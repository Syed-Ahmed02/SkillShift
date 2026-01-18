import { NextRequest, NextResponse } from 'next/server'
import { streamGeneration } from '@/lib/agents/orchestrator'
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

        const encoder = new TextEncoder()
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const item of streamGeneration(body.intent, body.qa || [])) {
                        if (item.type === 'chunk') {
                            const data = JSON.stringify({ type: 'chunk', text: item.text }) + '\n'
                            controller.enqueue(encoder.encode(data))
                        } else if (item.type === 'complete') {
                            const result = item.result
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
                            const data = JSON.stringify({ type: 'complete', result: response }) + '\n'
                            controller.enqueue(encoder.encode(data))
                            controller.close()
                        }
                    }
                } catch (error) {
                    console.error('Streaming error:', error)
                    const errorData = JSON.stringify({
                        type: 'error',
                        error: 'Failed to generate skill'
                    }) + '\n'
                    controller.enqueue(encoder.encode(errorData))
                    controller.close()
                }
            },
        })

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        })
    } catch (error) {
        console.error('Generate error:', error)
        return NextResponse.json(
            { error: 'Failed to generate skill' },
            { status: 500 }
        )
    }
}
