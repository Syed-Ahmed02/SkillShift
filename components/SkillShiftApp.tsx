'use client'

import { useState, useCallback } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { SkillComposer } from './SkillComposer'
import { ClarifierPanel } from './ClarifierPanel'
import { SkillPreview } from './SkillPreview'
import { SkillLibrary } from './SkillLibrary'
import { Button } from './ui/button'
import { Loader } from './ai-elements/loader'
import type { ClarifierQuestion, QAPair, ValidationIssue } from '@/lib/agents/types'

type Step = 'compose' | 'clarify' | 'generate' | 'preview' | 'saved'

interface GenerationResult {
    success: boolean
    skillMarkdown?: string
    name?: string
    description?: string
    validationStatus: 'valid' | 'fixed' | 'failed'
    issues?: ValidationIssue[]
    repairAttempts: number
}

export function SkillShiftApp() {
    const [step, setStep] = useState<Step>('compose')
    const [intent, setIntent] = useState('')
    const [qa, setQa] = useState<QAPair[]>([])
    const [questions, setQuestions] = useState<ClarifierQuestion[]>([])
    const [turn, setTurn] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [generatedSkill, setGeneratedSkill] = useState<GenerationResult | null>(null)
    const [showLibrary, setShowLibrary] = useState(false)

    const skills = useQuery(api.skills.listMine)
    const createSkill = useMutation(api.skills.create)

    // Generate the skill (defined first since other handlers depend on it)
    const handleGenerate = useCallback(async (intentText: string, qaList: QAPair[]) => {
        setIsLoading(true)
        setError(null)
        setStep('generate')

        try {
            const response = await fetch('/api/skills/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    intent: intentText,
                    qa: qaList,
                }),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to generate skill')
            }

            const data: GenerationResult = await response.json()
            setGeneratedSkill(data)
            setStep('preview')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred')
            setStep('compose')
        } finally {
            setIsLoading(false)
        }
    }, [])

    // Start a new session
    const handleStartSession = useCallback(async (intentText: string) => {
        setIsLoading(true)
        setError(null)
        setIntent(intentText)
        setQa([])

        try {
            const response = await fetch('/api/skills/session/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ intent: intentText }),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to start session')
            }

            const data = await response.json()
            setTurn(data.turn)

            if (data.status === 'ready') {
                // Skip to generation
                setStep('generate')
                handleGenerate(intentText, [])
            } else {
                setQuestions(data.questions)
                setStep('clarify')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred')
        } finally {
            setIsLoading(false)
        }
    }, [handleGenerate])

    // Submit answers to clarifier
    const handleSubmitAnswers = useCallback(async (answers: Array<{ question: string; answer: string }>) => {
        setIsLoading(true)
        setError(null)

        const newQa = [...qa, ...answers]
        setQa(newQa)

        try {
            const response = await fetch('/api/skills/session/answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    intent,
                    qa: qa,
                    currentTurn: turn,
                    newAnswers: answers,
                }),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to process answers')
            }

            const data = await response.json()
            setTurn(data.turn)

            if (data.status === 'ready') {
                setStep('generate')
                handleGenerate(intent, newQa)
            } else {
                setQuestions(data.questions)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred')
        } finally {
            setIsLoading(false)
        }
    }, [intent, qa, turn, handleGenerate])

    // Skip clarification and generate directly
    const handleSkipClarification = useCallback(() => {
        handleGenerate(intent, qa)
    }, [intent, qa, handleGenerate])

    // Save the skill to Convex
    const handleSaveSkill = useCallback(async () => {
        if (!generatedSkill?.skillMarkdown || !generatedSkill.name) {
            setError('Cannot save: skill data is missing')
            return
        }

        setIsLoading(true)
        setError(null)

        try {
            await createSkill({
                name: generatedSkill.name,
                description: generatedSkill.description || '',
                skillMarkdown: generatedSkill.skillMarkdown,
                sourceIntent: intent,
                qaSnapshot: qa,
            })
            setStep('saved')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save skill')
        } finally {
            setIsLoading(false)
        }
    }, [generatedSkill, intent, qa, createSkill])

    // Reset to start over
    const handleReset = useCallback(() => {
        setStep('compose')
        setIntent('')
        setQa([])
        setQuestions([])
        setTurn(0)
        setGeneratedSkill(null)
        setError(null)
    }, [])

    // Toggle library view
    const toggleLibrary = useCallback(() => {
        setShowLibrary((prev) => !prev)
    }, [])

    if (showLibrary) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">My Skills</h2>
                    <Button variant="outline" onClick={toggleLibrary}>
                        Create New Skill
                    </Button>
                </div>
                <SkillLibrary skills={skills || []} />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Navigation */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <StepIndicator step={1} active={step === 'compose'} completed={step !== 'compose'} label="Intent" />
                    <StepDivider />
                    <StepIndicator step={2} active={step === 'clarify'} completed={['generate', 'preview', 'saved'].includes(step)} label="Clarify" />
                    <StepDivider />
                    <StepIndicator step={3} active={step === 'generate' || step === 'preview'} completed={step === 'saved'} label="Generate" />
                    <StepDivider />
                    <StepIndicator step={4} active={step === 'saved'} completed={false} label="Save" />
                </div>
                {skills && skills.length > 0 && (
                    <Button variant="ghost" onClick={toggleLibrary}>
                        View Library ({skills.length})
                    </Button>
                )}
            </div>

            {/* Error display */}
            {error && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                    {error}
                </div>
            )}

            {/* Step content */}
            {step === 'compose' && (
                <SkillComposer
                    onSubmit={handleStartSession}
                    isLoading={isLoading}
                    initialValue={intent}
                />
            )}

            {step === 'clarify' && (
                <ClarifierPanel
                    questions={questions}
                    onSubmit={handleSubmitAnswers}
                    onSkip={handleSkipClarification}
                    isLoading={isLoading}
                    turn={turn}
                    maxTurns={3}
                    qa={qa}
                />
            )}

            {step === 'generate' && (
                <div className="flex flex-col items-center justify-center gap-4 py-16">
                    <Loader size={32} />
                    <p className="text-muted-foreground">Generating your skill...</p>
                    <p className="text-xs text-muted-foreground">This may take a moment</p>
                </div>
            )}

            {step === 'preview' && generatedSkill && (
                <SkillPreview
                    result={generatedSkill}
                    onSave={handleSaveSkill}
                    onRegenerate={() => handleGenerate(intent, qa)}
                    onReset={handleReset}
                    isLoading={isLoading}
                />
            )}

            {step === 'saved' && (
                <div className="flex flex-col items-center justify-center gap-6 py-16">
                    <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <div className="text-center">
                        <h3 className="text-lg font-semibold">Skill Saved!</h3>
                        <p className="text-muted-foreground">Your skill has been added to your library.</p>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={handleReset}>
                            Create Another
                        </Button>
                        <Button onClick={toggleLibrary}>
                            View Library
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

function StepIndicator({ step, active, completed, label }: { step: number; active: boolean; completed: boolean; label: string }) {
    return (
        <div className="flex items-center gap-2">
            <div
                className={`flex size-6 items-center justify-center rounded-full text-xs font-medium transition-colors ${active
                    ? 'bg-primary text-primary-foreground'
                    : completed
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
            >
                {completed ? (
                    <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                ) : (
                    step
                )}
            </div>
            <span className={`text-sm ${active ? 'font-medium' : 'text-muted-foreground'}`}>{label}</span>
        </div>
    )
}

function StepDivider() {
    return <div className="h-px w-8 bg-border" />
}

