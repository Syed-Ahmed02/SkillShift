import { NextRequest, NextResponse } from 'next/server'
import { runClarification } from '@/lib/agents/orchestrator'
import type {
    SessionStartRequest,
    SessionStartResponse,
} from '@/lib/agents/types'

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as SessionStartRequest

        if (!body.intent || typeof body.intent !== 'string') {
            return NextResponse.json(
                { error: 'Intent is required' },
                { status: 400 }
            )
        }

        const intent = body.intent.trim()
        if (intent.length < 10) {
            return NextResponse.json(
                { error: 'Intent must be at least 10 characters' },
                { status: 400 }
            )
        }

        // Run orchestrator's clarification
        const clarificationResult = await runClarification(intent, [], 0)

        // Generate a temporary session ID (client will create real one in Convex)
        const tempSessionId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`

        const response: SessionStartResponse = {
            sessionId: tempSessionId,
            status: clarificationResult.status === 'ready' ? 'ready' : 'need_more_info',
            questions: clarificationResult.questions,
            turn: 1,
        }

        return NextResponse.json(response)
    } catch (error) {
        console.error('Session start error:', error)
        return NextResponse.json(
            { error: 'Failed to start session' },
            { status: 500 }
        )
    }
}
