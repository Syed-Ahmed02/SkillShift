'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { cn } from '@/lib/utils'
import { PlusIcon, FileTextIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'

export interface Skill {
    _id: Id<'skills'>
    name: string
    description: string
    skillMarkdown: string
    sourceIntent: string
    qaSnapshot: Array<{ question: string; answer: string }>
    createdAt: number
    updatedAt: number
}

interface GenerationsSidebarProps {
    selectedSkillId: Id<'skills'> | null
    onSelectSkill: (skill: Skill) => void
    onNewChat: () => void
}

export function GenerationsSidebar({
    selectedSkillId,
    onSelectSkill,
    onNewChat,
}: GenerationsSidebarProps) {
    const skills = useQuery(api.skills.listMine)
    const [collapsed, setCollapsed] = useState(false)

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp)
        const now = new Date()
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

        if (diffDays === 0) return 'Today'
        if (diffDays === 1) return 'Yesterday'
        if (diffDays < 7) return `${diffDays} days ago`
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    if (collapsed) {
        return (
            <div className="flex h-full w-12 flex-col border-r bg-card/50">
                <div className="flex items-center justify-center p-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setCollapsed(false)}
                        className="size-8"
                    >
                        <ChevronRightIcon className="size-4" />
                    </Button>
                </div>
                <div className="flex-1" />
                <div className="flex items-center justify-center p-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onNewChat}
                        className="size-8"
                    >
                        <PlusIcon className="size-4" />
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-full w-72 flex-col border-r bg-card/50">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="font-semibold text-sm tracking-tight">Skills</h2>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onNewChat}
                        className="size-7"
                        title="New Chat"
                    >
                        <PlusIcon className="size-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setCollapsed(true)}
                        className="size-7"
                        title="Collapse sidebar"
                    >
                        <ChevronLeftIcon className="size-4" />
                    </Button>
                </div>
            </div>

            {/* Skills List */}
            <ScrollArea className="flex-1">
                <div className="flex flex-col gap-1 p-2">
                    {skills === undefined ? (
                        // Loading state
                        <div className="flex flex-col gap-2 p-2">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/50" />
                            ))}
                        </div>
                    ) : skills.length === 0 ? (
                        // Empty state
                        <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                                <FileTextIcon className="size-5 text-muted-foreground" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium">No skills yet</p>
                                <p className="text-xs text-muted-foreground">
                                    Create your first skill to get started
                                </p>
                            </div>
                            <Button variant="outline" size="sm" onClick={onNewChat}>
                                <PlusIcon className="size-3.5" />
                                New Skill
                            </Button>
                        </div>
                    ) : (
                        // Skills list
                        skills.map((skill) => (
                            <button
                                key={skill._id}
                                type="button"
                                onClick={() => onSelectSkill(skill as Skill)}
                                className={cn(
                                    'group flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors',
                                    'hover:bg-accent/50',
                                    selectedSkillId === skill._id && 'bg-accent text-accent-foreground'
                                )}
                            >
                                <span className="line-clamp-1 text-sm font-medium">
                                    {skill.name}
                                </span>
                                <span className="line-clamp-1 text-xs text-muted-foreground group-hover:text-muted-foreground">
                                    {skill.description || skill.sourceIntent}
                                </span>
                                <span className="text-[10px] text-muted-foreground/70">
                                    {formatDate(skill.createdAt)}
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}

