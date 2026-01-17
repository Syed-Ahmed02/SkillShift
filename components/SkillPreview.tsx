'use client'

import { useState, useCallback } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/card'
import { Badge } from './ui/badge'
import { Loader } from './ai-elements/loader'
import type { ValidationIssue } from '@/lib/agents/types'
import { Copy, Check, Save, RefreshCw, RotateCcw, AlertTriangle, CheckCircle, Info } from 'lucide-react'

interface GenerationResult {
    success: boolean
    skillMarkdown?: string
    name?: string
    description?: string
    validationStatus: 'valid' | 'fixed' | 'failed'
    issues?: ValidationIssue[]
    repairAttempts: number
}

interface SkillPreviewProps {
    result: GenerationResult
    onSave: () => void
    onRegenerate: () => void
    onReset: () => void
    isLoading: boolean
}

export function SkillPreview({ result, onSave, onRegenerate, onReset, isLoading }: SkillPreviewProps) {
    const [copied, setCopied] = useState(false)

    const handleCopy = useCallback(async () => {
        if (result.skillMarkdown) {
            await navigator.clipboard.writeText(result.skillMarkdown)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }, [result.skillMarkdown])

    const statusConfig = {
        valid: {
            icon: CheckCircle,
            label: 'Valid',
            variant: 'default' as const,
            color: 'text-green-600',
        },
        fixed: {
            icon: Info,
            label: 'Auto-fixed',
            variant: 'secondary' as const,
            color: 'text-blue-600',
        },
        failed: {
            icon: AlertTriangle,
            label: 'Validation Failed',
            variant: 'destructive' as const,
            color: 'text-destructive',
        },
    }

    const status = statusConfig[result.validationStatus]
    const StatusIcon = status.icon

    return (
        <div className="space-y-6">
            {/* Status banner */}
            <div className={`flex items-center gap-3 rounded-lg border p-4 ${result.validationStatus === 'failed' ? 'border-destructive/50 bg-destructive/10' :
                result.validationStatus === 'fixed' ? 'border-blue-500/50 bg-blue-500/10' :
                    'border-green-500/50 bg-green-500/10'
                }`}>
                <StatusIcon className={`size-5 ${status.color}`} />
                <div className="flex-1">
                    <p className="font-medium text-sm">{status.label}</p>
                    {result.repairAttempts > 0 && (
                        <p className="text-xs text-muted-foreground">
                            Auto-repaired {result.repairAttempts} time{result.repairAttempts > 1 ? 's' : ''}
                        </p>
                    )}
                </div>
                <Badge variant={status.variant}>{result.name || 'Skill'}</Badge>
            </div>

            {/* Validation issues */}
            {result.issues && result.issues.length > 0 && (
                <div className="space-y-2">
                    <p className="text-sm font-medium">
                        {result.validationStatus === 'failed' ? 'Issues to address:' : 'Warnings:'}
                    </p>
                    <div className="space-y-2">
                        {result.issues.map((issue, index) => (
                            <div
                                key={index}
                                className={`rounded-lg border p-3 text-sm ${issue.severity === 'error'
                                    ? 'border-destructive/50 bg-destructive/5'
                                    : 'border-yellow-500/50 bg-yellow-500/5'
                                    }`}
                            >
                                <div className="flex items-start gap-2">
                                    <Badge variant={issue.severity === 'error' ? 'destructive' : 'secondary'} className="shrink-0">
                                        {issue.type}
                                    </Badge>
                                    <div className="flex-1">
                                        <p>{issue.description}</p>
                                        {issue.suggestion && (
                                            <p className="mt-1 text-xs text-muted-foreground">{issue.suggestion}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Skill preview */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">Generated SKILL.md</CardTitle>
                    <Button variant="outline" size="sm" onClick={handleCopy} disabled={!result.skillMarkdown}>
                        {copied ? (
                            <>
                                <Check className="size-3.5" />
                                Copied!
                            </>
                        ) : (
                            <>
                                <Copy className="size-3.5" />
                                Copy
                            </>
                        )}
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="rounded-lg border bg-muted/30 p-4">
                        <pre className="overflow-x-auto whitespace-pre-wrap text-xs font-mono text-foreground">
                            {result.skillMarkdown || 'No content generated'}
                        </pre>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-between gap-3">
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={onReset} disabled={isLoading}>
                            <RotateCcw className="size-3.5" />
                            Start Over
                        </Button>
                        <Button variant="outline" onClick={onRegenerate} disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader size={14} />
                                    Regenerating...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="size-3.5" />
                                    Regenerate
                                </>
                            )}
                        </Button>
                    </div>
                    <Button
                        onClick={onSave}
                        disabled={isLoading || !result.success || !result.skillMarkdown}
                    >
                        {isLoading ? (
                            <>
                                <Loader size={14} />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="size-3.5" />
                                Save to Library
                            </>
                        )}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}

