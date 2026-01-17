import { NextRequest, NextResponse } from 'next/server'
import { generateText } from 'ai'
import { cerebrasProvider } from '@/lib/cerebras'
import {
    CLARIFIER_SYSTEM_PROMPT,
    buildContext,
} from '@/lib/agents/prompts'
import type {
    SessionStartRequest,
    SessionStartResponse,
    ClarifierResponse,
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

        // Run clarifier agent
        const context = buildContext(intent, [])

        const { text } = await generateText({
            model: cerebrasProvider('llama3.1-8b'),
            system: CLARIFIER_SYSTEM_PROMPT,
            prompt: context,
        })

        // Parse the JSON response
        let clarifierResponse: ClarifierResponse
        try {
            // Extract JSON from the response (handle potential markdown code blocks)
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
                reasoning: 'Proceeding with generation based on provided intent.',
            }
        }

        // Generate a temporary session ID (client will create real one in Convex)
        const tempSessionId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`

        const response: SessionStartResponse = {
            sessionId: tempSessionId,
            status: clarifierResponse.status,
            questions: clarifierResponse.questions,
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

