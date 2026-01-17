'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { cn } from '@/lib/utils'
import { PlusIcon, FileTextIcon, ChevronLeftIcon, ChevronRightIcon, MessageSquareIcon } from 'lucide-react'
import { useState, useMemo } from 'react'

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

export interface Session {
    _id: Id<'skillSessions'>
    intent: string
    qa: Array<{ question: string; answer: string }>
    status: 'clarifying' | 'ready' | 'generating' | 'completed' | 'failed'
    createdAt: number
    updatedAt: number
}

interface GenerationsSidebarProps {
    selectedSkillId: Id<'skills'> | null
    currentSessionId: Id<'skillSessions'> | null
    onSelectSkill: (skill: Skill) => void
    onSelectSession: (session: Session) => void
    onNewChat: () => void
}

export function GenerationsSidebar({
    selectedSkillId,
    currentSessionId,
    onSelectSkill,
    onSelectSession,
    onNewChat,
}: GenerationsSidebarProps) {
    const skills = useQuery(api.skills.listMine)
    const sessions = useQuery(api.sessions.listMine)
    const [collapsed, setCollapsed] = useState(false)

    // Combine and sort sessions and skills by most recent
    const allItems = useMemo(() => {
        const items: Array<{
            id: string
            type: 'session' | 'skill'
            title: string
            subtitle: string
            timestamp: number
            data: Skill | Session
        }> = []

        // Add sessions
        if (sessions) {
            sessions.forEach((session) => {
                items.push({
                    id: session._id,
                    type: 'session',
                    title: session.intent.length > 50
                        ? session.intent.substring(0, 50) + '...'
                        : session.intent,
                    subtitle: session.qa.length > 0
                        ? `${session.qa.length} Q&A`
                        : 'New conversation',
                    timestamp: session.updatedAt,
                    data: session as Session,
                })
            })
        }

        // Add skills
        if (skills) {
            skills.forEach((skill) => {
                items.push({
                    id: skill._id,
                    type: 'skill',
                    title: skill.name,
                    subtitle: skill.description || skill.sourceIntent,
                    timestamp: skill.updatedAt,
                    data: skill as Skill,
                })
            })
        }

        // Sort by timestamp (most recent first)
        return items.sort((a, b) => b.timestamp - a.timestamp)
    }, [sessions, skills])

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
                <h2 className="font-semibold text-sm tracking-tight">Conversations</h2>
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

            {/* Conversations List */}
            <ScrollArea className="flex-1">
                <div className="flex flex-col gap-1 p-2">
                    {allItems.length === 0 && (skills === undefined || sessions === undefined) ? (
                        // Loading state
                        <div className="flex flex-col gap-2 p-2">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/50" />
                            ))}
                        </div>
                    ) : allItems.length === 0 ? (
                        // Empty state
                        <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                                <MessageSquareIcon className="size-5 text-muted-foreground" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium">No conversations yet</p>
                                <p className="text-xs text-muted-foreground">
                                    Start a new conversation to create a skill
                                </p>
                            </div>
                            <Button variant="outline" size="sm" onClick={onNewChat}>
                                <PlusIcon className="size-3.5" />
                                New Conversation
                            </Button>
                        </div>
                    ) : (
                        // Conversations list
                        allItems.map((item) => {
                            const isSelected = item.type === 'session'
                                ? currentSessionId === item.id
                                : selectedSkillId === item.id

                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                        if (item.type === 'session') {
                                            onSelectSession(item.data as Session)
                                        } else {
                                            onSelectSkill(item.data as Skill)
                                        }
                                    }}
                                    className={cn(
                                        'group flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-colors',
                                        'hover:bg-accent/50',
                                        isSelected && 'bg-accent text-accent-foreground'
                                    )}
                                >
                                    <div className={cn(
                                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded',
                                        item.type === 'session'
                                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                            : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                                    )}>
                                        {item.type === 'session' ? (
                                            <MessageSquareIcon className="size-3" />
                                        ) : (
                                            <FileTextIcon className="size-3" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span className="line-clamp-1 text-sm font-medium">
                                            {item.title}
                                        </span>
                                        <span className="line-clamp-1 text-xs text-muted-foreground group-hover:text-muted-foreground">
                                            {item.subtitle}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground/70">
                                            {formatDate(item.timestamp)}
                                        </span>
                                    </div>
                                </button>
                            )
                        })
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}

