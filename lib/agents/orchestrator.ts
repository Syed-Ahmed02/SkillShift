// Orchestrator agent that delegates to specialist agents as needed
import { generateText, streamText } from 'ai'
import { z } from 'zod'
import { cerebrasProvider } from '@/lib/cerebras'
import {
    CLARIFIER_SYSTEM_PROMPT,
    GENERATOR_SYSTEM_PROMPT,
    VALIDATOR_SYSTEM_PROMPT,
    REPAIR_SYSTEM_PROMPT,
    buildContext,
} from './prompts'
import type {
    ClarifierResponse,
    ValidatorResponse,
    QAPair,
} from './types'
import { validateSkillStructure, parseSkillFrontmatter } from './validation'

// Max repair attempts before giving up
const MAX_REPAIR_ATTEMPTS = 2

// Safety cap for clarification turns (prevents infinite loops)
export const MAX_CLARIFICATION_TURNS = 10

/**
 * Result from the clarification orchestration
 */
export interface ClarificationResult {
    status: 'need_more_info' | 'ready' | 'max_turns_reached'
    questions: ClarifierResponse['questions']
    reasoning: string
}

/**
 * A single generated skill
 */
export interface GeneratedSkill {
    markdown: string
    name?: string
    description?: string
    validationStatus: 'valid' | 'fixed' | 'failed'
    issues: ValidatorResponse['issues']
}

/**
 * Result from the generation orchestration
 */
export interface GenerationResult {
    success: boolean
    skills: GeneratedSkill[]
    // Backward compatibility - single skill fields
    skillMarkdown?: string
    name?: string
    description?: string
    validationStatus: 'valid' | 'fixed' | 'failed'
    issues: ValidatorResponse['issues']
    repairAttempts: number
}

/**
 * Run clarification - delegates to clarifier agent to determine if more info is needed
 */
export async function runClarification(
    intent: string,
    qa: QAPair[],
    currentTurn: number
): Promise<ClarificationResult> {
    // Safety cap - if we've hit max turns, suggest skipping
    if (currentTurn >= MAX_CLARIFICATION_TURNS) {
        return {
            status: 'max_turns_reached',
            questions: [],
            reasoning: 'Maximum clarification turns reached. Please proceed with generation or refine your intent.',
        }
    }

    const context = buildContext(intent, qa)

    const { text } = await generateText({
        model: cerebrasProvider(process.env.CEREBRAS_MODEL ?? 'zai-glm-4.7'),
        system: CLARIFIER_SYSTEM_PROMPT,
        prompt: context,
    })

    // Parse the JSON response
    let clarifierResponse: ClarifierResponse
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            throw new Error('No JSON found in response')
        }
        clarifierResponse = JSON.parse(jsonMatch[0])
    } catch {
        console.error('Failed to parse clarifier response:', text)
        // Fallback: assume ready if parsing fails
        clarifierResponse = {
            status: 'ready',
            questions: [],
            reasoning: 'Proceeding with generation based on provided context.',
        }
    }

    return {
        status: clarifierResponse.status,
        questions: clarifierResponse.questions,
        reasoning: clarifierResponse.reasoning,
    }
}

/**
 * Parse multiple skills from generator output
 */
function parseMultipleSkills(output: string): string[] {
    const separator = '\n\n---SKILL_SEPARATOR---\n\n'

    // Check if output contains the separator
    if (output.includes(separator)) {
        const skills = output.split(separator).map(s => s.trim()).filter(s => s.length > 0)
        // Only return multiple if we actually got multiple skills
        if (skills.length > 1) {
            return skills
        }
    }

    // Also check for variations with different spacing
    const variations = [
        '\n\n---SKILL_SEPARATOR---\n\n',
        '\n---SKILL_SEPARATOR---\n',
        '---SKILL_SEPARATOR---',
    ]

    for (const variant of variations) {
        if (output.includes(variant)) {
            const skills = output.split(variant).map(s => s.trim()).filter(s => s.length > 0 && s.startsWith('---'))
            if (skills.length > 1) {
                return skills
            }
        }
    }

    // Single skill - return as array
    return [output.trim()]
}

/**
 * Validate and repair a single skill
 */
async function validateAndRepairSkill(
    context: string,
    skillMarkdown: string,
    repairAttempts: { current: number }
): Promise<GeneratedSkill> {
    let currentMarkdown = skillMarkdown
    let validationStatus: 'valid' | 'fixed' | 'failed' = 'valid'
    let lastIssues: ValidatorResponse['issues'] = []

    // Validate and repair loop
    for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
        // First, do deterministic structural validation
        const structuralIssues = validateSkillStructure(currentMarkdown)

        if (structuralIssues.length > 0) {
            // Has structural issues - needs repair
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
            repairAttempts.current++
            currentMarkdown = await repairSkill(context, currentMarkdown, structuralIssues)
            validationStatus = 'fixed'
            continue
        }

        // Structure is valid - run LLM validator for alignment/quality
        const validatorResult = await validateWithLLM(context, currentMarkdown)

        if (!validatorResult) {
            // LLM validation failed/skipped - assume valid
            break
        }

        const errors = validatorResult.issues.filter((i) => i.severity === 'error')

        if (errors.length === 0) {
            // Valid! Capture any warnings
            lastIssues = validatorResult.issues.filter((i) => i.severity === 'warning')
            break
        }

        // Has errors - attempt repair
        if (attempt === MAX_REPAIR_ATTEMPTS) {
            validationStatus = 'failed'
            lastIssues = validatorResult.issues
            break
        }

        repairAttempts.current++
        const issuesList = errors.map((i) => `- ${i.description}: ${i.suggestion}`).join('\n')
        currentMarkdown = await repairSkill(context, currentMarkdown, [issuesList])
        validationStatus = 'fixed'
    }

    // Extract frontmatter
    const frontmatter = parseSkillFrontmatter(currentMarkdown)

    return {
        markdown: currentMarkdown,
        name: frontmatter?.name,
        description: frontmatter?.description,
        validationStatus,
        issues: lastIssues,
    }
}

/**
 * Run generation with conditional validation/repair delegation
 * Supports generating multiple skills when intent spans distinct capabilities
 */
export async function runGeneration(
    intent: string,
    qa: QAPair[]
): Promise<GenerationResult> {
    const context = buildContext(intent, qa)

    // Step 1: Generate the skill(s)
    const { text: generatedOutput } = await generateText({
        model: cerebrasProvider(process.env.CEREBRAS_MODEL ?? 'zai-glm-4.7'),
        system: GENERATOR_SYSTEM_PROMPT,
        prompt: context,
    })

    // Step 2: Parse multiple skills
    const skillMarkdowns = parseMultipleSkills(generatedOutput.trim())

    // Step 3: Validate and repair each skill
    const repairAttempts = { current: 0 }
    const skills: GeneratedSkill[] = []

    for (const skillMarkdown of skillMarkdowns) {
        const skill = await validateAndRepairSkill(context, skillMarkdown, repairAttempts)
        skills.push(skill)
    }

    // Determine overall status
    const overallStatus: 'valid' | 'fixed' | 'failed' =
        skills.some(s => s.validationStatus === 'failed') ? 'failed' :
            skills.some(s => s.validationStatus === 'fixed') ? 'fixed' :
                'valid'

    const success = overallStatus !== 'failed'

    // Collect all issues
    const allIssues: ValidatorResponse['issues'] = []
    for (const skill of skills) {
        allIssues.push(...skill.issues)
    }

    // Backward compatibility: single skill fields (use first skill if only one)
    const firstSkill = skills[0]

    return {
        success,
        skills,
        // Backward compatibility fields
        skillMarkdown: firstSkill?.markdown,
        name: firstSkill?.name,
        description: firstSkill?.description,
        validationStatus: overallStatus,
        issues: allIssues,
        repairAttempts: repairAttempts.current,
    }
}

/**
 * Stream generation with conditional validation/repair delegation
 * Streams text generation, then performs validation/repair after streaming completes
 * Returns an async generator that yields text chunks and metadata
 */
export async function* streamGeneration(
    intent: string,
    qa: QAPair[]
): AsyncGenerator<{ type: 'chunk'; text: string } | { type: 'complete'; result: GenerationResult }, void, unknown> {
    const context = buildContext(intent, qa)

    // Step 1: Stream the skill generation
    const { textStream } = streamText({
        model: cerebrasProvider(process.env.CEREBRAS_MODEL ?? 'zai-glm-4.7'),
        system: GENERATOR_SYSTEM_PROMPT,
        prompt: context,
    })

    // Collect the full streamed output while yielding chunks
    let generatedOutput = ''
    for await (const textChunk of textStream) {
        generatedOutput += textChunk
        yield { type: 'chunk', text: textChunk }
    }

    // Step 2: Parse multiple skills from the complete output
    const skillMarkdowns = parseMultipleSkills(generatedOutput.trim())

    // Step 3: Validate and repair each skill (blocking after streaming)
    const repairAttempts = { current: 0 }
    const skills: GeneratedSkill[] = []

    for (const skillMarkdown of skillMarkdowns) {
        const skill = await validateAndRepairSkill(context, skillMarkdown, repairAttempts)
        skills.push(skill)
    }

    // Determine overall status
    const overallStatus: 'valid' | 'fixed' | 'failed' =
        skills.some(s => s.validationStatus === 'failed') ? 'failed' :
            skills.some(s => s.validationStatus === 'fixed') ? 'fixed' :
                'valid'

    const success = overallStatus !== 'failed'

    // Collect all issues
    const allIssues: ValidatorResponse['issues'] = []
    for (const skill of skills) {
        allIssues.push(...skill.issues)
    }

    // Backward compatibility: single skill fields (use first skill if only one)
    const firstSkill = skills[0]

    const result: GenerationResult = {
        success,
        skills,
        // Backward compatibility fields
        skillMarkdown: firstSkill?.markdown,
        name: firstSkill?.name,
        description: firstSkill?.description,
        validationStatus: overallStatus,
        issues: allIssues,
        repairAttempts: repairAttempts.current,
    }

    // Yield final result
    yield { type: 'complete', result }
}

/**
 * Validate skill with LLM (for alignment/quality checks)
 * Returns null if validation couldn't be performed
 */
async function validateWithLLM(
    context: string,
    skillMarkdown: string
): Promise<ValidatorResponse | null> {
    try {
        const validatorPrompt = `${context}\n\n## SKILL.md to Validate\n${skillMarkdown}`

        const { text: validationResult } = await generateText({
            model: cerebrasProvider(process.env.CEREBRAS_MODEL ?? 'zai-glm-4.7'),
            system: VALIDATOR_SYSTEM_PROMPT,
            prompt: validatorPrompt,
        })

        const jsonMatch = validationResult.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            return null
        }

        return JSON.parse(jsonMatch[0]) as ValidatorResponse
    } catch {
        console.error('LLM validation failed, proceeding without')
        return null
    }
}

/**
 * Repair skill using repair agent
 */
async function repairSkill(
    context: string,
    skillMarkdown: string,
    issues: string[]
): Promise<string> {
    const repairPrompt = `${context}\n\n## Current SKILL.md\n${skillMarkdown}\n\n## Issues to Fix\n${issues.join('\n')}`

    const { text: repairedSkill } = await generateText({
        model: cerebrasProvider(process.env.CEREBRAS_MODEL ?? 'zai-glm-4.7'),
        system: REPAIR_SYSTEM_PROMPT,
        prompt: repairPrompt,
    })

    return repairedSkill.trim()
}

// ============================================================================
// Tool schemas for future ToolLoopAgent integration
// ============================================================================

/**
 * Zod schemas for orchestrator tools
 * These can be used with AI SDK's tool-calling capabilities when needed
 */
export const orchestratorToolSchemas = {
    clarify: {
        description: 'Analyze if more information is needed from the user before generating a skill',
        parameters: z.object({
            intent: z.string().describe('The user\'s original intent'),
            qa: z.array(z.object({
                question: z.string(),
                answer: z.string(),
            })).describe('Previous Q&A pairs'),
        }),
    },

    generateSkill: {
        description: 'Generate a SKILL.md file from the intent and clarifying Q&A',
        parameters: z.object({
            intent: z.string().describe('The user\'s original intent'),
            qa: z.array(z.object({
                question: z.string(),
                answer: z.string(),
            })).describe('Clarifying Q&A pairs'),
        }),
    },

    validateSkill: {
        description: 'Validate a generated SKILL.md for structural and quality issues',
        parameters: z.object({
            skillMarkdown: z.string().describe('The SKILL.md content to validate'),
            context: z.string().describe('The original context (intent + Q&A)'),
        }),
    },

    repairSkill: {
        description: 'Repair a SKILL.md that has validation issues',
        parameters: z.object({
            skillMarkdown: z.string().describe('The SKILL.md content to repair'),
            context: z.string().describe('The original context (intent + Q&A)'),
            issues: z.array(z.string()).describe('List of issues to fix'),
        }),
    },
}

