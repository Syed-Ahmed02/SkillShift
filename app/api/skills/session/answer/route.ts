import { NextRequest, NextResponse } from 'next/server'
import { generateText } from 'ai'
import { cerebrasProvider } from '@/lib/cerebras'
import {
    CLARIFIER_SYSTEM_PROMPT,
    buildContext,
} from '@/lib/agents/prompts'
import type {
    SessionAnswerResponse,
    ClarifierResponse,
    QAPair,
} from '@/lib/agents/types'

const MAX_TURNS = 3

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

        // If we've reached max turns, signal ready
        if (currentTurn > MAX_TURNS) {
            const response: SessionAnswerResponse = {
                status: 'ready',
                questions: [],
                turn: currentTurn,
            }
            return NextResponse.json(response)
        }

        // Run clarifier agent with updated context
        const context = buildContext(body.intent, allQA)

        const { text } = await generateText({
            model: cerebrasProvider('llama3.1-8b'),
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
            clarifierResponse = {
                status: 'ready',
                questions: [],
                reasoning: 'Proceeding with generation based on provided context.',
            }
        }

        const response: SessionAnswerResponse = {
            status: clarifierResponse.status,
            questions: clarifierResponse.questions,
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

