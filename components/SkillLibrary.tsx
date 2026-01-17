'use client'

import { useState, useCallback } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card'
import { Badge } from './ui/badge'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from './ui/alert-dialog'
import { Copy, Check, Trash2, ChevronDown, ChevronUp, FileText } from 'lucide-react'

interface Skill {
    _id: Id<'skills'>
    name: string
    description: string
    skillMarkdown: string
    sourceIntent: string
    qaSnapshot: Array<{ question: string; answer: string }>
    createdAt: number
    updatedAt: number
}

interface SkillLibraryProps {
    skills: Skill[]
}

export function SkillLibrary({ skills }: SkillLibraryProps) {
    const [expandedId, setExpandedId] = useState<Id<'skills'> | null>(null)
    const [copiedId, setCopiedId] = useState<Id<'skills'> | null>(null)
    const removeSkill = useMutation(api.skills.remove)

    const handleCopy = useCallback(async (skill: Skill) => {
        await navigator.clipboard.writeText(skill.skillMarkdown)
        setCopiedId(skill._id)
        setTimeout(() => setCopiedId(null), 2000)
    }, [])

    const handleDelete = useCallback(async (skillId: Id<'skills'>) => {
        await removeSkill({ skillId })
        if (expandedId === skillId) {
            setExpandedId(null)
        }
    }, [removeSkill, expandedId])

    const toggleExpand = useCallback((skillId: Id<'skills'>) => {
        setExpandedId((prev) => (prev === skillId ? null : skillId))
    }, [])

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        })
    }

    if (skills.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex size-16 items-center justify-center rounded-full bg-muted">
                    <FileText className="size-8 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-lg font-medium">No skills yet</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                    Create your first skill to see it here.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {skills.map((skill) => (
                <Card key={skill._id}>
                    <CardHeader className="cursor-pointer" onClick={() => toggleExpand(skill._id)}>
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <CardTitle className="text-base">{skill.name}</CardTitle>
                                    <Badge variant="secondary" className="text-xs">
                                        {formatDate(skill.createdAt)}
                                    </Badge>
                                </div>
                                <CardDescription className="mt-1">{skill.description}</CardDescription>
                            </div>
                            <Button variant="ghost" size="icon-sm">
                                {expandedId === skill._id ? (
                                    <ChevronUp className="size-4" />
                                ) : (
                                    <ChevronDown className="size-4" />
                                )}
                            </Button>
                        </div>
                    </CardHeader>

                    {expandedId === skill._id && (
                        <>
                            <CardContent className="space-y-4">
                                {/* Source intent */}
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Original Intent</p>
                                    <p className="text-sm text-foreground/80 line-clamp-3">{skill.sourceIntent}</p>
                                </div>

                                {/* Q&A snapshot */}
                                {skill.qaSnapshot.length > 0 && (
                                    <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-2">Clarifications</p>
                                        <div className="space-y-2">
                                            {skill.qaSnapshot.map((qa, index) => (
                                                <div key={index} className="rounded border bg-muted/30 p-2 text-xs">
                                                    <p className="font-medium">{qa.question}</p>
                                                    <p className="mt-0.5 text-muted-foreground">{qa.answer}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Skill content */}
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-2">SKILL.md Content</p>
                                    <div className="rounded-lg border bg-muted/30 p-4 max-h-80 overflow-y-auto">
                                        <pre className="whitespace-pre-wrap text-xs font-mono text-foreground">
                                            {skill.skillMarkdown}
                                        </pre>
                                    </div>
                                </div>
                            </CardContent>

                            <CardFooter className="flex justify-between gap-2">
                                <AlertDialog>
                                    <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
                                        <Trash2 className="size-3.5" />
                                        Delete
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Delete skill?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will permanently delete the skill "{skill.name}". This action cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDelete(skill._id)}>
                                                Delete
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>

                                <Button variant="outline" size="sm" onClick={() => handleCopy(skill)}>
                                    {copiedId === skill._id ? (
                                        <>
                                            <Check className="size-3.5" />
                                            Copied!
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="size-3.5" />
                                            Copy SKILL.md
                                        </>
                                    )}
                                </Button>
                            </CardFooter>
                        </>
                    )}
                </Card>
            ))}
        </div>
    )
}

