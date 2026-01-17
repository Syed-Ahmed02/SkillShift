'use client'

import { useState, useCallback } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card'
import { Textarea } from './ui/textarea'
import { Badge } from './ui/badge'
import { Loader } from './ai-elements/loader'
import type { ClarifierQuestion, QAPair } from '@/lib/agents/types'
import { ArrowRight, SkipForward, MessageCircleQuestion } from 'lucide-react'

interface ClarifierPanelProps {
    questions: ClarifierQuestion[]
    onSubmit: (answers: Array<{ question: string; answer: string }>) => void
    onSkip: () => void
    isLoading: boolean
    turn: number
    maxTurns: number
    qa: QAPair[]
}

export function ClarifierPanel({
    questions,
    onSubmit,
    onSkip,
    isLoading,
    turn,
    maxTurns,
    qa,
}: ClarifierPanelProps) {
    const [answers, setAnswers] = useState<Record<string, string>>({})

    const handleAnswerChange = useCallback((questionId: string, answer: string) => {
        setAnswers((prev) => ({ ...prev, [questionId]: answer }))
    }, [])

    const handleOptionSelect = useCallback((questionId: string, option: string) => {
        setAnswers((prev) => ({ ...prev, [questionId]: option }))
    }, [])

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault()
        const formattedAnswers = questions.map((q) => ({
            question: q.question,
            answer: answers[q.id] || '',
        })).filter((a) => a.answer.trim().length > 0)

        if (formattedAnswers.length > 0) {
            onSubmit(formattedAnswers)
            setAnswers({})
        }
    }, [questions, answers, onSubmit])

    const allAnswered = questions.every((q) => answers[q.id]?.trim().length > 0)

    return (
        <div className="space-y-6">
            {/* Previous Q&A */}
            {qa.length > 0 && (
                <div className="space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">Previous answers:</p>
                    <div className="space-y-2">
                        {qa.map((item, index) => (
                            <div key={index} className="rounded-lg border bg-muted/30 p-3 text-sm">
                                <p className="font-medium">{item.question}</p>
                                <p className="mt-1 text-muted-foreground">{item.answer}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Current questions */}
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                            <MessageCircleQuestion className="size-5 text-primary" />
                            <CardTitle>A few clarifying questions</CardTitle>
                        </div>
                        <Badge variant="secondary">
                            Turn {turn} of {maxTurns}
                        </Badge>
                    </div>
                    <CardDescription>
                        Help us understand your requirements better to generate a more accurate skill.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form id="clarifier-form" onSubmit={handleSubmit} className="space-y-6">
                        {questions.map((question, index) => (
                            <div key={question.id} className="space-y-3">
                                <label className="block text-sm font-medium">
                                    {index + 1}. {question.question}
                                </label>

                                {question.type === 'multiple_choice' && question.options ? (
                                    <div className="flex flex-wrap gap-2">
                                        {question.options.map((option) => (
                                            <button
                                                key={option}
                                                type="button"
                                                onClick={() => handleOptionSelect(question.id, option)}
                                                disabled={isLoading}
                                                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${answers[question.id] === option
                                                    ? 'border-primary bg-primary/10 text-primary'
                                                    : 'border-border hover:bg-accent hover:text-accent-foreground'
                                                    }`}
                                            >
                                                {option}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <Textarea
                                        value={answers[question.id] || ''}
                                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                                        placeholder="Your answer..."
                                        className="min-h-[80px]"
                                        disabled={isLoading}
                                    />
                                )}
                            </div>
                        ))}
                    </form>
                </CardContent>
                <CardFooter className="flex justify-between gap-3">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onSkip}
                        disabled={isLoading}
                    >
                        <SkipForward className="size-3.5" />
                        Skip & Generate
                    </Button>
                    <Button
                        type="submit"
                        form="clarifier-form"
                        disabled={!allAnswered || isLoading}
                    >
                        {isLoading ? (
                            <>
                                <Loader size={14} />
                                Processing...
                            </>
                        ) : turn >= maxTurns ? (
                            <>
                                Generate Skill
                                <ArrowRight className="size-3.5" />
                            </>
                        ) : (
                            <>
                                Continue
                                <ArrowRight className="size-3.5" />
                            </>
                        )}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}

