import { NextRequest, NextResponse } from 'next/server'
import { runGeneration } from '@/lib/agents/orchestrator'
import type {
    QAPair,
    GenerateResponse,
} from '@/lib/agents/types'

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

        // Use orchestrator for generation with conditional validation/repair
        const result = await runGeneration(body.intent, body.qa || [])

        const response: GenerateResponse = {
            success: result.success,
            skills: result.skills.map(skill => ({
                markdown: skill.markdown,
                name: skill.name,
                description: skill.description,
                validationStatus: skill.validationStatus,
                issues: skill.issues.length > 0 ? skill.issues : undefined,
            })),
            // Backward compatibility - single skill fields
            skillMarkdown: result.skillMarkdown,
            name: result.name,
            description: result.description,
            validationStatus: result.validationStatus,
            issues: result.issues.length > 0 ? result.issues : undefined,
            repairAttempts: result.repairAttempts,
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
