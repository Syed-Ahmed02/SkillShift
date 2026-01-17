'use client'

import { useState, useCallback } from 'react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Loader } from './ai-elements/loader'
import { Sparkles } from 'lucide-react'

interface SkillComposerProps {
    onSubmit: (intent: string) => void
    isLoading: boolean
    initialValue?: string
}

const EXAMPLE_PROMPTS = [
    {
        title: 'Code Review Assistant',
        description: 'Reviews pull requests and provides feedback on code quality, best practices, and potential issues.',
    },
    {
        title: 'Technical Documentation Writer',
        description: 'Generates clear technical documentation from code, including API references and usage examples.',
    },
    {
        title: 'Bug Triage Helper',
        description: 'Analyzes bug reports, categorizes severity, suggests potential causes, and recommends next steps.',
    },
]

export function SkillComposer({ onSubmit, isLoading, initialValue = '' }: SkillComposerProps) {
    const [intent, setIntent] = useState(initialValue)

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault()
        if (intent.trim().length >= 10) {
            onSubmit(intent.trim())
        }
    }, [intent, onSubmit])

    const handleExampleClick = useCallback((example: typeof EXAMPLE_PROMPTS[0]) => {
        setIntent(`Create a skill for: ${example.title}\n\n${example.description}`)
    }, [])

    const isValid = intent.trim().length >= 10

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>What skill do you want to create?</CardTitle>
                    <CardDescription>
                        Describe your product intent, feature idea, or workflow. Be as detailed as you like — the more context, the better the skill.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Textarea
                            value={intent}
                            onChange={(e) => setIntent(e.target.value)}
                            placeholder="Example: Create a skill that helps developers write better commit messages. It should analyze the staged changes, suggest a conventional commit format, and ensure the message is clear and descriptive..."
                            className="min-h-[160px]"
                            disabled={isLoading}
                        />
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                                {intent.length} characters {intent.length < 10 && '(minimum 10)'}
                            </p>
                            <Button type="submit" disabled={!isValid || isLoading}>
                                {isLoading ? (
                                    <>
                                        <Loader size={14} />
                                        Analyzing...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="size-3.5" />
                                        Generate Skill
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* Example prompts */}
            <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Or try an example:</p>
                <div className="grid gap-3 sm:grid-cols-3">
                    {EXAMPLE_PROMPTS.map((example) => (
                        <button
                            key={example.title}
                            type="button"
                            onClick={() => handleExampleClick(example)}
                            disabled={isLoading}
                            className="group rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                        >
                            <h4 className="font-medium text-sm">{example.title}</h4>
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2 group-hover:text-accent-foreground/70">
                                {example.description}
                            </p>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}

