import { NextRequest, NextResponse } from 'next/server'
import { runClarification } from '@/lib/agents/orchestrator'
import type {
    SessionAnswerResponse,
    QAPair,
} from '@/lib/agents/types'

interface AnswerRequestBody {
    intent: string
    qa: QAPair[]
    currentTurn: number
    newAnswers: Array<{
        question: string
        answer: string
    }>
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as AnswerRequestBody

        if (!body.intent || !Array.isArray(body.newAnswers)) {
            return NextResponse.json(
                { error: 'Intent and newAnswers are required' },
                { status: 400 }
            )
        }

        // Combine existing Q&A with new answers
        const allQA: QAPair[] = [
            ...(body.qa || []),
            ...body.newAnswers,
        ]

        const currentTurn = (body.currentTurn || 1) + 1

        // Run orchestrator's clarification with accumulated Q&A
        const clarificationResult = await runClarification(body.intent, allQA, currentTurn)

        // Handle max turns reached - return special status so UI can prompt skip
        if (clarificationResult.status === 'max_turns_reached') {
            const response: SessionAnswerResponse = {
                status: 'need_more_info', // Still need more info but suggest skipping
                questions: [],
                turn: currentTurn,
                maxTurnsReached: true,
                message: clarificationResult.reasoning,
            }
            return NextResponse.json(response)
        }

        const response: SessionAnswerResponse = {
            status: clarificationResult.status === 'ready' ? 'ready' : 'need_more_info',
            questions: clarificationResult.questions,
            turn: currentTurn,
        }

        return NextResponse.json(response)
    } catch (error) {
        console.error('Session answer error:', error)
        return NextResponse.json(
            { error: 'Failed to process answers' },
            { status: 500 }
        )
    }
}
