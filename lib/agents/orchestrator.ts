// Orchestrator agent that delegates to specialist agents as needed
import { generateText, streamText } from 'ai'
import { z } from 'zod'
import { cerebrasProvider } from '@/lib/cerebras'
import {
    CLARIFIER_SYSTEM_PROMPT,
    GENERATOR_SYSTEM_PROMPT,
    VALIDATOR_SYSTEM_PROMPT,
    REPAIR_SYSTEM_PROMPT,
    PLANNER_SYSTEM_PROMPT,
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
 * Calculate similarity between two strings (0-1, where 1 is identical)
 */
function calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim()
    const s2 = str2.toLowerCase().trim()

    if (s1 === s2) return 1.0
    if (s1.length === 0 || s2.length === 0) return 0.0

    // Check if one contains the other
    if (s1.includes(s2) || s2.includes(s1)) {
        return Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length)
    }

    // Word overlap similarity
    const words1 = new Set(s1.split(/\s+/).filter(w => w.length > 2))
    const words2 = new Set(s2.split(/\s+/).filter(w => w.length > 2))

    if (words1.size === 0 || words2.size === 0) return 0.0

    const intersection = new Set([...words1].filter(w => words2.has(w)))
    const union = new Set([...words1, ...words2])

    return intersection.size / union.size
}

/**
 * Check if two skills are duplicates or too similar
 */
function areSkillsSimilar(skill1: GeneratedSkill, skill2: GeneratedSkill): boolean {
    // Check name similarity
    const name1 = skill1.name?.toLowerCase().trim() || ''
    const name2 = skill2.name?.toLowerCase().trim() || ''

    if (name1 && name2) {
        const nameSimilarity = calculateSimilarity(name1, name2)
        if (nameSimilarity > 0.7) return true // Very similar names
    }

    // Check description similarity
    const desc1 = skill1.description?.toLowerCase().trim() || ''
    const desc2 = skill2.description?.toLowerCase().trim() || ''

    if (desc1 && desc2) {
        const descSimilarity = calculateSimilarity(desc1, desc2)
        if (descSimilarity > 0.8) return true // Very similar descriptions
    }

    // Check content similarity (first 500 chars)
    const content1 = skill1.markdown.substring(0, 500).toLowerCase().trim()
    const content2 = skill2.markdown.substring(0, 500).toLowerCase().trim()

    if (content1.length > 50 && content2.length > 50) {
        const contentSimilarity = calculateSimilarity(content1, content2)
        if (contentSimilarity > 0.75) return true // Very similar content
    }

    return false
}

/**
 * Deduplicate skills by removing similar/duplicate entries
 */
function deduplicateSkills(skills: GeneratedSkill[]): GeneratedSkill[] {
    if (skills.length <= 1) return skills

    const unique: GeneratedSkill[] = []
    const seen: boolean[] = new Array(skills.length).fill(false)

    for (let i = 0; i < skills.length; i++) {
        if (seen[i]) continue

        let isDuplicate = false
        for (let j = i + 1; j < skills.length; j++) {
            if (seen[j]) continue

            if (areSkillsSimilar(skills[i], skills[j])) {
                // Keep the one with better validation status or more content
                const keepFirst =
                    skills[i].validationStatus === 'valid' && skills[j].validationStatus !== 'valid' ||
                    skills[i].markdown.length > skills[j].markdown.length

                if (keepFirst) {
                    seen[j] = true
                } else {
                    isDuplicate = true
                    seen[j] = false // Will be handled in next iteration
                    break
                }
            }
        }

        if (!isDuplicate) {
            unique.push(skills[i])
            seen[i] = true
        }
    }

    return unique
}

/**
 * Result from the clarification orchestration
 */
export interface ClarificationResult {
    status: 'need_more_info' | 'ready' | 'max_turns_reached'
    questions: ClarifierResponse['questions']
    reasoning: string
}

/**
 * Skill breakdown from the planner
 */
export interface SkillPlan {
    skillCount: number
    skills: Array<{
        name: string
        description: string
        category: 'core' | 'workflow' | 'constraints' | 'integration' | 'validation'
        concern: string
    }>
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
 * Plan skills - analyzes intent and determines how many skills are needed, separating concerns
 */
export async function planSkills(
    intent: string,
    qa: QAPair[]
): Promise<SkillPlan> {
    const context = buildContext(intent, qa)

    const { text } = await generateText({
        model: cerebrasProvider(process.env.CEREBRAS_MODEL ?? 'zai-glm-4.7'),
        system: PLANNER_SYSTEM_PROMPT,
        prompt: context,
    })

    let skillPlan: SkillPlan
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            throw new Error('No JSON found in response')
        }
        skillPlan = JSON.parse(jsonMatch[0])

        if (!skillPlan.skillCount || !Array.isArray(skillPlan.skills) || skillPlan.skills.length !== skillPlan.skillCount) {
            throw new Error('Invalid skill plan structure')
        }

        // Deduplicate skills in the plan
        const uniquePlanSkills: SkillPlan['skills'] = []
        const seenNames = new Set<string>()

        for (const skill of skillPlan.skills) {
            const normalizedName = skill.name.toLowerCase().trim()

            // Check for duplicate names
            if (seenNames.has(normalizedName)) {
                console.warn(`Skipping duplicate skill in plan: ${skill.name}`)
                continue
            }

            // Check for similar descriptions
            const isSimilar = uniquePlanSkills.some(existing => {
                const descSimilarity = calculateSimilarity(
                    existing.description.toLowerCase(),
                    skill.description.toLowerCase()
                )
                return descSimilarity > 0.8
            })

            if (!isSimilar) {
                uniquePlanSkills.push(skill)
                seenNames.add(normalizedName)
            } else {
                console.warn(`Skipping similar skill in plan: ${skill.name}`)
            }
        }

        // Update plan with deduplicated skills
        if (uniquePlanSkills.length > 0) {
            skillPlan.skills = uniquePlanSkills
            skillPlan.skillCount = uniquePlanSkills.length
        } else {
            // Fallback if all skills were duplicates
            throw new Error('All skills in plan were duplicates')
        }
    } catch (error) {
        console.error('Failed to parse skill plan:', text, error)
        skillPlan = {
            skillCount: 1,
            skills: [{
                name: 'generated-skill',
                description: 'Generated skill based on user intent',
                category: 'core',
                concern: 'User intent',
            }],
            reasoning: 'Fallback: generating single skill due to planning error',
        }
    }

    return skillPlan
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
    // Try exact separator first
    const exactSeparator = '\n\n---SKILL_SEPARATOR---\n\n'
    if (output.includes(exactSeparator)) {
        const skills = output.split(exactSeparator).map(s => s.trim()).filter(s => s.length > 0)
        // Only return multiple if we actually got multiple skills
        if (skills.length > 1) {
            return skills
        }
    }

    // Check for variations with different spacing and common typos
    const variations = [
        '\n---SKILL_SEPARATOR---\n',
        '---SKILL_SEPARATOR---',
        '\n\n---SKILL SEPARATOR---\n\n',  // Handle space variant
        '\n---SKILL SEPARATOR---\n',
        '---SKILL SEPARATOR---',
        '\n\n---SKILL_SEPERATOR---\n\n',  // Handle misspelling
        '\n---SKILL_SEPERATOR---\n',
        '---SKILL_SEPERATOR---',
    ]

    for (const variant of variations) {
        if (output.includes(variant)) {
            const skills = output.split(variant).map(s => s.trim()).filter(s => s.length > 0)
            // Only return multiple if we actually got multiple skills
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

    const skillPlan = await planSkills(intent, qa)

    const enhancedPrompt = `${context}

## Skill Generation Plan
Generate exactly ${skillPlan.skillCount} skill(s) as planned:

${skillPlan.skills.map((skill, index) =>
        `Skill ${index + 1}: ${skill.name}
- Description: ${skill.description}
- Category: ${skill.category}
- Concern: ${skill.concern}`
    ).join('\n\n')}

Reasoning: ${skillPlan.reasoning}

IMPORTANT: Generate each skill according to its CATEGORY:
- "workflow" → Use decision trees, numbered steps, sequential processes
- "constraints" → Use MUST/SHOULD/NEVER rule patterns  
- "core" → Describe capabilities with code examples
- "integration" → Show tool setup, API patterns, connection workflows
- "validation" → Include check criteria and verification steps

Each skill must be standalone, match its category pattern, and include relevant code examples.`

    const { text: generatedOutput } = await generateText({
        model: cerebrasProvider(process.env.CEREBRAS_MODEL ?? 'zai-glm-4.7'),
        system: GENERATOR_SYSTEM_PROMPT,
        prompt: enhancedPrompt,
    })

    const skillMarkdowns = parseMultipleSkills(generatedOutput.trim())

    const repairAttempts = { current: 0 }
    const skills: GeneratedSkill[] = []

    for (const skillMarkdown of skillMarkdowns) {
        const skill = await validateAndRepairSkill(context, skillMarkdown, repairAttempts)
        skills.push(skill)
    }

    // Deduplicate skills before final processing
    const uniqueSkills = deduplicateSkills(skills)

    const overallStatus: 'valid' | 'fixed' | 'failed' =
        uniqueSkills.some(s => s.validationStatus === 'failed') ? 'failed' :
            uniqueSkills.some(s => s.validationStatus === 'fixed') ? 'fixed' :
                'valid'

    const success = overallStatus !== 'failed'

    const allIssues: ValidatorResponse['issues'] = []
    for (const skill of uniqueSkills) {
        allIssues.push(...skill.issues)
    }

    const firstSkill = uniqueSkills[0]

    return {
        success,
        skills: uniqueSkills,
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
 */
export async function* streamGeneration(
    intent: string,
    qa: QAPair[]
): AsyncGenerator<{ type: 'chunk'; text: string } | { type: 'complete'; result: GenerationResult }, void, unknown> {
    const context = buildContext(intent, qa)

    const skillPlan = await planSkills(intent, qa)

    const enhancedPrompt = `${context}

## Skill Generation Plan
Generate exactly ${skillPlan.skillCount} skill(s) as planned:

${skillPlan.skills.map((skill, index) =>
        `Skill ${index + 1}: ${skill.name}
- Description: ${skill.description}
- Category: ${skill.category}
- Concern: ${skill.concern}`
    ).join('\n\n')}

Reasoning: ${skillPlan.reasoning}

IMPORTANT: Generate each skill according to its CATEGORY:
- "workflow" → Use decision trees, numbered steps, sequential processes
- "constraints" → Use MUST/SHOULD/NEVER rule patterns  
- "core" → Describe capabilities with code examples
- "integration" → Show tool setup, API patterns, connection workflows
- "validation" → Include check criteria and verification steps

Each skill must be standalone, match its category pattern, and include relevant code examples.`

    const { textStream } = streamText({
        model: cerebrasProvider(process.env.CEREBRAS_MODEL ?? 'zai-glm-4.7'),
        system: GENERATOR_SYSTEM_PROMPT,
        prompt: enhancedPrompt,
    })

    let generatedOutput = ''
    for await (const textChunk of textStream) {
        generatedOutput += textChunk
        yield { type: 'chunk', text: textChunk }
    }

    const skillMarkdowns = parseMultipleSkills(generatedOutput.trim())

    const repairAttempts = { current: 0 }
    const skills: GeneratedSkill[] = []

    for (const skillMarkdown of skillMarkdowns) {
        const skill = await validateAndRepairSkill(context, skillMarkdown, repairAttempts)
        skills.push(skill)
    }

    // Deduplicate skills before final processing
    const uniqueSkills = deduplicateSkills(skills)

    const overallStatus: 'valid' | 'fixed' | 'failed' =
        uniqueSkills.some(s => s.validationStatus === 'failed') ? 'failed' :
            uniqueSkills.some(s => s.validationStatus === 'fixed') ? 'fixed' :
                'valid'

    const success = overallStatus !== 'failed'

    const allIssues: ValidatorResponse['issues'] = []
    for (const skill of uniqueSkills) {
        allIssues.push(...skill.issues)
    }

    const firstSkill = uniqueSkills[0]

    const result: GenerationResult = {
        success,
        skills: uniqueSkills,
        skillMarkdown: firstSkill?.markdown,
        name: firstSkill?.name,
        description: firstSkill?.description,
        validationStatus: overallStatus,
        issues: allIssues,
        repairAttempts: repairAttempts.current,
    }

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

