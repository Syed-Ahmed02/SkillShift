'use client'

import { useState, useCallback, useRef } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { GenerationsSidebar, type Skill } from './GenerationsSidebar'
import { Button } from './ui/button'
import { Loader } from './ai-elements/loader'
import {
    Conversation,
    ConversationContent,
    ConversationEmptyState,
    ConversationScrollButton,
} from './ai-elements/conversation'
import {
    Message,
    MessageContent,
    MessageActions,
    MessageAction,
    MessageResponse,
} from './ai-elements/message'
import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
} from './ui/collapsible'
import {
    PromptInput,
    PromptInputTextarea,
    PromptInputFooter,
    PromptInputSubmit,
    type PromptInputMessage,
} from './ai-elements/prompt-input'
import type { ClarifierQuestion, QAPair, ValidationIssue } from '@/lib/agents/types'
import { nanoid } from 'nanoid'
import { MessageCircleIcon, SaveIcon, RefreshCwIcon, CopyIcon, CheckIcon, SparklesIcon, ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Types
interface GenerationResult {
    success: boolean
    skillMarkdown?: string
    name?: string
    description?: string
    validationStatus: 'valid' | 'fixed' | 'failed'
    issues?: ValidationIssue[]
    repairAttempts: number
}

type ChatMessageType = 'intent' | 'answer' | 'question' | 'skill' | 'loading' | 'error'

interface ChatMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    type: ChatMessageType
    skillData?: GenerationResult
    questions?: ClarifierQuestion[]
    timestamp: number
}

type ConversationState = 'idle' | 'clarifying' | 'generating'

export function SkillShiftApp() {
    // State
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [conversationState, setConversationState] = useState<ConversationState>('idle')
    const [selectedSkillId, setSelectedSkillId] = useState<Id<'skills'> | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [expandedSkills, setExpandedSkills] = useState<Record<string, boolean>>({})

    // Refs for clarification flow
    const intentRef = useRef('')
    const qaRef = useRef<QAPair[]>([])
    const turnRef = useRef(0)
    const pendingQuestionsRef = useRef<ClarifierQuestion[]>([])

    // Mutations
    const createSkill = useMutation(api.skills.create)

    // Add message helper
    const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
        const newMessage: ChatMessage = {
            ...message,
            id: nanoid(),
            timestamp: Date.now(),
        }
        setMessages(prev => [...prev, newMessage])
        return newMessage.id
    }, [])

    // Update message helper
    const updateMessage = useCallback((id: string, updates: Partial<ChatMessage>) => {
        setMessages(prev => prev.map(msg => msg.id === id ? { ...msg, ...updates } : msg))
    }, [])

    // Remove message helper
    const removeMessage = useCallback((id: string) => {
        setMessages(prev => prev.filter(msg => msg.id !== id))
    }, [])

    // Generate skill
    const generateSkill = useCallback(async (intent: string, qa: QAPair[]) => {
        const loadingId = addMessage({
            role: 'assistant',
            content: 'Generating your skill...',
            type: 'loading',
        })

        try {
            const response = await fetch('/api/skills/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ intent, qa }),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to generate skill')
            }

            const data: GenerationResult = await response.json()

            updateMessage(loadingId, {
                content: data.skillMarkdown || 'Generated skill',
                type: 'skill',
                skillData: data,
            })

            setConversationState('idle')
        } catch (err) {
            updateMessage(loadingId, {
                content: err instanceof Error ? err.message : 'An error occurred',
                type: 'error',
            })
            setConversationState('idle')
        }
    }, [addMessage, updateMessage])

    // Handle user message submission
    const handleSubmit = useCallback(async (message: PromptInputMessage) => {
        const text = message.text.trim()
        if (!text) return

        setError(null)

        // If we're in clarification mode, treat as answer
        if (conversationState === 'clarifying' && pendingQuestionsRef.current.length > 0) {
            // Add user's answer message
            addMessage({
                role: 'user',
                content: text,
                type: 'answer',
            })

            // Build answers from the text (user provides answers naturally)
            const answers = pendingQuestionsRef.current.map((q, i) => ({
                question: q.question,
                answer: i === 0 ? text : '', // For simplicity, apply to first question
            })).filter(a => a.answer)

            qaRef.current = [...qaRef.current, ...answers]

            // Show loading
            const loadingId = addMessage({
                role: 'assistant',
                content: 'Processing your answers...',
                type: 'loading',
            })

            try {
                const response = await fetch('/api/skills/session/answer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        intent: intentRef.current,
                        qa: qaRef.current,
                        currentTurn: turnRef.current,
                        newAnswers: answers,
                    }),
                })

                if (!response.ok) {
                    const data = await response.json()
                    throw new Error(data.error || 'Failed to process answers')
                }

                const data = await response.json()
                turnRef.current = data.turn

                removeMessage(loadingId)

                if (data.status === 'ready') {
                    setConversationState('generating')
                    pendingQuestionsRef.current = []
                    await generateSkill(intentRef.current, qaRef.current)
                } else {
                    pendingQuestionsRef.current = data.questions
                    addMessage({
                        role: 'assistant',
                        content: formatQuestions(data.questions),
                        type: 'question',
                        questions: data.questions,
                    })
                }
            } catch (err) {
                updateMessage(loadingId, {
                    content: err instanceof Error ? err.message : 'An error occurred',
                    type: 'error',
                })
                setConversationState('idle')
            }
        } else {
            // New intent - start session
            addMessage({
                role: 'user',
                content: text,
                type: 'intent',
            })

            intentRef.current = text
            qaRef.current = []
            turnRef.current = 0
            pendingQuestionsRef.current = []

            const loadingId = addMessage({
                role: 'assistant',
                content: 'Analyzing your request...',
                type: 'loading',
            })

            try {
                const response = await fetch('/api/skills/session/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ intent: text }),
                })

                if (!response.ok) {
                    const data = await response.json()
                    throw new Error(data.error || 'Failed to start session')
                }

                const data = await response.json()
                turnRef.current = data.turn

                removeMessage(loadingId)

                if (data.status === 'ready') {
                    setConversationState('generating')
                    await generateSkill(text, [])
                } else {
                    setConversationState('clarifying')
                    pendingQuestionsRef.current = data.questions
                    addMessage({
                        role: 'assistant',
                        content: formatQuestions(data.questions),
                        type: 'question',
                        questions: data.questions,
                    })
                }
            } catch (err) {
                updateMessage(loadingId, {
                    content: err instanceof Error ? err.message : 'An error occurred',
                    type: 'error',
                })
            }
        }
    }, [conversationState, addMessage, removeMessage, updateMessage, generateSkill])

    // Format questions for display
    const formatQuestions = (questions: ClarifierQuestion[]) => {
        return questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n\n')
    }

    // Handle new chat
    const handleNewChat = useCallback(() => {
        setMessages([])
        setSelectedSkillId(null)
        setConversationState('idle')
        setError(null)
        intentRef.current = ''
        qaRef.current = []
        turnRef.current = 0
        pendingQuestionsRef.current = []
    }, [])

    // Handle loading a skill from sidebar
    const handleLoadSkill = useCallback((skill: Skill) => {
        setSelectedSkillId(skill._id)
        setConversationState('idle')
        setError(null)
        intentRef.current = skill.sourceIntent
        qaRef.current = skill.qaSnapshot
        pendingQuestionsRef.current = []

        // Build messages from the skill
        const newMessages: ChatMessage[] = [
            {
                id: nanoid(),
                role: 'user',
                content: skill.sourceIntent,
                type: 'intent',
                timestamp: skill.createdAt,
            },
        ]

        // Add Q&A as messages
        skill.qaSnapshot.forEach((qa, i) => {
            newMessages.push({
                id: nanoid(),
                role: 'assistant',
                content: qa.question,
                type: 'question',
                timestamp: skill.createdAt + i * 2,
            })
            newMessages.push({
                id: nanoid(),
                role: 'user',
                content: qa.answer,
                type: 'answer',
                timestamp: skill.createdAt + i * 2 + 1,
            })
        })

        // Add the skill result
        newMessages.push({
            id: nanoid(),
            role: 'assistant',
            content: skill.skillMarkdown,
            type: 'skill',
            skillData: {
                success: true,
                skillMarkdown: skill.skillMarkdown,
                name: skill.name,
                description: skill.description,
                validationStatus: 'valid',
                repairAttempts: 0,
            },
            timestamp: skill.updatedAt,
        })

        setMessages(newMessages)
    }, [])

    // Handle save skill
    const handleSaveSkill = useCallback(async (messageId: string) => {
        const message = messages.find(m => m.id === messageId)
        if (!message?.skillData?.skillMarkdown || !message.skillData.name) {
            setError('Cannot save: skill data is missing')
            return
        }

        try {
            await createSkill({
                name: message.skillData.name,
                description: message.skillData.description || '',
                skillMarkdown: message.skillData.skillMarkdown,
                sourceIntent: intentRef.current,
                qaSnapshot: qaRef.current,
            })

            // Show success feedback
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save skill')
        }
    }, [messages, createSkill])

    // Handle regenerate
    const handleRegenerate = useCallback(async (messageId: string) => {
        // Remove the current skill message and regenerate
        removeMessage(messageId)
        setConversationState('generating')
        await generateSkill(intentRef.current, qaRef.current)
    }, [removeMessage, generateSkill])

    // Handle copy
    const handleCopy = useCallback(async (content: string) => {
        await navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [])

    // Skip clarification
    const handleSkipClarification = useCallback(() => {
        setConversationState('generating')
        pendingQuestionsRef.current = []
        generateSkill(intentRef.current, qaRef.current)
    }, [generateSkill])

    const isLoading = conversationState === 'generating'
    const isClarifying = conversationState === 'clarifying'

    return (
        <div className="flex h-full bg-background">
            {/* Sidebar */}
            <GenerationsSidebar
                selectedSkillId={selectedSkillId}
                onSelectSkill={handleLoadSkill}
                onNewChat={handleNewChat}
            />

            {/* Main Chat Area */}
            <div className="flex flex-1 flex-col">
                {/* Error Banner */}
                {error && (
                    <div className="border-b border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                        {error}
                    </div>
                )}

                {/* Messages */}
                <Conversation className="flex-1">
                    <ConversationContent className="mx-auto max-w-3xl px-4 py-6">
                        {messages.length === 0 ? (
                            <ConversationEmptyState
                                icon={<SparklesIcon className="size-8" />}
                                title="Create a new skill"
                                description="Describe your product intent, feature idea, or workflow. The more context you provide, the better the skill."
                            >
                                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                                    {EXAMPLE_PROMPTS.map((example) => (
                                        <button
                                            key={example.title}
                                            type="button"
                                            onClick={() => handleSubmit({ text: `Create a skill for: ${example.title}\n\n${example.description}`, files: [] })}
                                            className="group rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                                        >
                                            <h4 className="font-medium text-sm">{example.title}</h4>
                                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2 group-hover:text-accent-foreground/70">
                                                {example.description}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </ConversationEmptyState>
                        ) : (
                            messages.map((message) => (
                                <Message key={message.id} from={message.role}>
                                    <MessageContent>
                                        {message.type === 'loading' ? (
                                            <div className="flex items-center gap-3">
                                                <Loader size={16} />
                                                <span className="text-muted-foreground">{message.content}</span>
                                            </div>
                                        ) : message.type === 'skill' && message.skillData?.skillMarkdown ? (
                                            <div className="w-full max-w-2xl space-y-4">
                                                <Collapsible
                                                    defaultOpen={true}
                                                    open={expandedSkills[message.id] ?? true}
                                                    onOpenChange={(open) => setExpandedSkills(prev => ({ ...prev, [message.id]: open }))}
                                                >
                                                    <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium">{message.skillData.name || 'Generated Skill'}</span>
                                                            {message.skillData.validationStatus === 'valid' && (
                                                                <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600">Valid</span>
                                                            )}
                                                            {message.skillData.validationStatus === 'fixed' && (
                                                                <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600">Auto-fixed</span>
                                                            )}
                                                        </div>
                                                        <ChevronDownIcon
                                                            className={cn(
                                                                "size-4 text-muted-foreground transition-transform",
                                                                (expandedSkills[message.id] ?? true) ? "rotate-180" : "rotate-0"
                                                            )}
                                                        />
                                                    </CollapsibleTrigger>
                                                    <CollapsibleContent className="mt-2">
                                                        <MessageResponse>
                                                            {message.skillData.skillMarkdown}
                                                        </MessageResponse>
                                                    </CollapsibleContent>
                                                </Collapsible>
                                                <MessageActions>
                                                    <MessageAction
                                                        tooltip="Save to Library"
                                                        onClick={() => handleSaveSkill(message.id)}
                                                    >
                                                        <SaveIcon className="size-4" />
                                                    </MessageAction>
                                                    <MessageAction
                                                        tooltip="Regenerate"
                                                        onClick={() => handleRegenerate(message.id)}
                                                    >
                                                        <RefreshCwIcon className="size-4" />
                                                    </MessageAction>
                                                    <MessageAction
                                                        tooltip="Copy"
                                                        onClick={() => handleCopy(message.skillData!.skillMarkdown!)}
                                                    >
                                                        {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                                                    </MessageAction>
                                                </MessageActions>
                                            </div>
                                        ) : message.type === 'error' ? (
                                            <div className="text-destructive">{message.content}</div>
                                        ) : message.type === 'question' ? (
                                            <div className="space-y-3">
                                                <p className="text-muted-foreground">I have a few questions to help create a better skill:</p>
                                                <div className="whitespace-pre-wrap">{message.content}</div>
                                                {isClarifying && message.id === messages[messages.length - 1]?.id && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={handleSkipClarification}
                                                        className="mt-2"
                                                    >
                                                        Skip and generate now
                                                    </Button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="whitespace-pre-wrap">{message.content}</div>
                                        )}
                                    </MessageContent>
                                </Message>
                            ))
                        )}
                    </ConversationContent>
                    <ConversationScrollButton />
                </Conversation>

                {/* Input */}
                <div className="border-t bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <div className="mx-auto max-w-3xl">
                        <PromptInput
                            onSubmit={handleSubmit}
                            className="rounded-xl border shadow-sm"
                        >
                            <PromptInputTextarea
                                placeholder={
                                    isClarifying
                                        ? "Answer the questions above..."
                                        : "Describe the skill you want to create..."
                                }
                                disabled={isLoading}
                            />
                            <PromptInputFooter>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {isClarifying && (
                                        <span className="flex items-center gap-1">
                                            <MessageCircleIcon className="size-3" />
                                            Clarifying
                                        </span>
                                    )}
                                </div>
                                <PromptInputSubmit disabled={isLoading} />
                            </PromptInputFooter>
                        </PromptInput>
                    </div>
                </div>
            </div>
        </div>
    )
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
    {
        title: 'Commit Message Generator',
        description: 'Analyzes staged changes and suggests conventional commit messages that are clear and descriptive.',
    },
]
