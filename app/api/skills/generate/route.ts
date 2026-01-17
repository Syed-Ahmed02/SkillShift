import { NextRequest, NextResponse } from 'next/server'
import { generateText } from 'ai'
import { cerebrasProvider } from '@/lib/cerebras'
import {
    GENERATOR_SYSTEM_PROMPT,
    VALIDATOR_SYSTEM_PROMPT,
    REPAIR_SYSTEM_PROMPT,
    buildContext,
} from '@/lib/agents/prompts'
import type {
    QAPair,
    ValidatorResponse,
    GenerateResponse,
} from '@/lib/agents/types'
import { parseSkillFrontmatter, validateSkillStructure } from '@/lib/agents/validation'

const MAX_REPAIR_ATTEMPTS = 2

interface GenerateRequestBody {
    intent: string
    qa: QAPair[]
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as GenerateRequestBody

        if (!body.intent) {
            return NextResponse.json(
                { error: 'Intent is required' },
                { status: 400 }
            )
        }

        const context = buildContext(body.intent, body.qa || [])

        // Step 1: Generate the skill
        const { text: generatedSkill } = await generateText({
            model: cerebrasProvider('llama3.1-8b'),
            system: GENERATOR_SYSTEM_PROMPT,
            prompt: context,
        })

        let skillMarkdown = generatedSkill.trim()
        let repairAttempts = 0
        let validationStatus: 'valid' | 'fixed' | 'failed' = 'valid'
        let lastIssues: ValidatorResponse['issues'] = []

        // Step 2: Validate and repair loop
        for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
            // First, do deterministic validation
            const structuralIssues = validateSkillStructure(skillMarkdown)

            if (structuralIssues.length > 0) {
                // Has structural issues, needs repair
                if (attempt === MAX_REPAIR_ATTEMPTS) {
                    validationStatus = 'failed'
                    lastIssues = structuralIssues.map((issue) => ({
                        type: 'spec_violation' as const,
                        severity: 'error' as const,
                        description: issue,
                        suggestion: 'Fix the SKILL.md structure',
                    }))
                    break
                }

                // Attempt repair
                repairAttempts++
                const repairPrompt = `${context}\n\n## Current SKILL.md\n${skillMarkdown}\n\n## Issues to Fix\n${structuralIssues.join('\n')}`

                const { text: repairedSkill } = await generateText({
                    model: cerebrasProvider('llama3.1-8b'),
                    system: REPAIR_SYSTEM_PROMPT,
                    prompt: repairPrompt,
                })

                skillMarkdown = repairedSkill.trim()
                validationStatus = 'fixed'
                continue
            }

            // Structure is valid, now run LLM validator for alignment/quality
            const validatorPrompt = `${context}\n\n## SKILL.md to Validate\n${skillMarkdown}`

            const { text: validationResult } = await generateText({
                model: cerebrasProvider('llama3.1-8b'),
                system: VALIDATOR_SYSTEM_PROMPT,
                prompt: validatorPrompt,
            })

            let validatorResponse: ValidatorResponse
            try {
                const jsonMatch = validationResult.match(/\{[\s\S]*\}/)
                if (!jsonMatch) {
                    throw new Error('No JSON found')
                }
                validatorResponse = JSON.parse(jsonMatch[0])
            } catch {
                // If parsing fails, assume valid
                validatorResponse = {
                    valid: true,
                    issues: [],
                    summary: 'Skill appears valid.',
                }
            }

            const errors = validatorResponse.issues.filter((i) => i.severity === 'error')

            if (errors.length === 0) {
                // Valid! We're done
                lastIssues = validatorResponse.issues.filter((i) => i.severity === 'warning')
                break
            }

            // Has errors, attempt repair
            if (attempt === MAX_REPAIR_ATTEMPTS) {
                validationStatus = 'failed'
                lastIssues = validatorResponse.issues
                break
            }

            repairAttempts++
            const issuesList = errors.map((i) => `- ${i.description}: ${i.suggestion}`).join('\n')
            const repairPrompt = `${context}\n\n## Current SKILL.md\n${skillMarkdown}\n\n## Issues to Fix\n${issuesList}`

            const { text: repairedSkill } = await generateText({
                model: cerebrasProvider('llama3.1-8b'),
                system: REPAIR_SYSTEM_PROMPT,
                prompt: repairPrompt,
            })

            skillMarkdown = repairedSkill.trim()
            validationStatus = 'fixed'
        }

        // Extract frontmatter for response
        const frontmatter = parseSkillFrontmatter(skillMarkdown)

        const response: GenerateResponse = {
            success: validationStatus !== 'failed',
            skillMarkdown,
            name: frontmatter?.name,
            description: frontmatter?.description,
            validationStatus,
            issues: lastIssues.length > 0 ? lastIssues : undefined,
            repairAttempts,
        }

        return NextResponse.json(response)
    } catch (error) {
        console.error('Generate error:', error)
        return NextResponse.json(
            { error: 'Failed to generate skill' },
            { status: 500 }
        )
    }
}

