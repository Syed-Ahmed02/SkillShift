'use client'

import { useState, useCallback, useRef } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { GenerationsSidebar, type Skill, type Session } from './GenerationsSidebar'
import { ClarifierPanel } from './ClarifierPanel'
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
    PromptInput,
    PromptInputTextarea,
    PromptInputFooter,
    PromptInputSubmit,
    type PromptInputMessage,
} from './ai-elements/prompt-input'
import type { ClarifierQuestion, QAPair, ValidationIssue } from '@/lib/agents/types'
import { nanoid } from 'nanoid'
import { SaveIcon, RefreshCwIcon, CopyIcon, CheckIcon, SparklesIcon, EditIcon, EyeIcon } from 'lucide-react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select'
import { MarkdownEditor } from './MarkdownEditor'
import { CodeBlock, CodeBlockCopyButton } from './ai-elements/code-block'

// Types
interface SingleSkillData {
    markdown: string
    name?: string
    description?: string
    validationStatus: 'valid' | 'fixed' | 'failed'
    issues?: ValidationIssue[]
}

interface GenerationResult {
    success: boolean
    skills: SingleSkillData[]
    // Backward compatibility - single skill fields
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
    isStreaming?: boolean
}

type ConversationState = 'idle' | 'clarifying' | 'generating'

export function SkillShiftApp() {
    // State
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [conversationState, setConversationState] = useState<ConversationState>('idle')
    const [selectedSkillId, setSelectedSkillId] = useState<Id<'skills'> | null>(null)
    const [currentSessionId, setCurrentSessionId] = useState<Id<'skillSessions'> | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [maxTurnsReached, setMaxTurnsReached] = useState(false)
    const [maxTurnsMessage, setMaxTurnsMessage] = useState<string>('')
    const [editingMessageIds, setEditingMessageIds] = useState<Set<string>>(new Set())
    const [selectedSkillIndex, setSelectedSkillIndex] = useState<Record<string, number>>({})

    // Refs for clarification flow
    const intentRef = useRef('')
    const qaRef = useRef<QAPair[]>([])
    const turnRef = useRef(0)
    const pendingQuestionsRef = useRef<ClarifierQuestion[]>([])

    // Mutations
    const createSkill = useMutation(api.skills.create)
    const createSession = useMutation(api.sessions.create)
    const updateSession = useMutation(api.sessions.appendQA)
    const setSessionStatus = useMutation(api.sessions.setStatus)

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

    // Generate skill(s)
    const generateSkill = useCallback(async (intent: string, qa: QAPair[]) => {
        // Update session status to generating if we have a session
        if (currentSessionId) {
            try {
                await setSessionStatus({
                    sessionId: currentSessionId,
                    status: 'generating',
                })
            } catch (err) {
                console.error('Failed to update session status:', err)
            }
        }

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
                const errorData = await response.json()
                throw new Error(errorData.error || 'Failed to generate skill')
            }

            if (!response.body) {
                throw new Error('Response body is null')
            }

            // Remove loading message and create streaming skill message
            removeMessage(loadingId)

            // Create initial streaming message - we'll group multiple skills in one message
            const streamingMessageId = addMessage({
                role: 'assistant',
                content: '',
                type: 'skill',
                isStreaming: true,
                skillData: {
                    success: false,
                    skills: [],
                    repairAttempts: 0,
                    validationStatus: 'valid',
                    issues: [],
                },
            })

            let accumulatedText = ''
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let finalResult: GenerationResult | null = null

            try {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    const chunk = decoder.decode(value, { stream: true })
                    const lines = chunk.split('\n').filter(line => line.trim())

                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line)

                            if (data.type === 'chunk') {
                                // Update content as chunks arrive
                                accumulatedText += data.text
                                updateMessage(streamingMessageId, {
                                    content: accumulatedText,
                                    isStreaming: true,
                                })
                            } else if (data.type === 'complete') {
                                // Final result received
                                finalResult = data.result
                            } else if (data.type === 'error') {
                                throw new Error(data.error || 'Streaming error')
                            }
                        } catch {
                            // Skip invalid JSON lines (might be incomplete chunks)
                            console.warn('Failed to parse stream line:', line)
                        }
                    }
                }
            } finally {
                reader.releaseLock()
            }

            // Update message with final result
            if (finalResult) {
                const skills = finalResult.skills || []

                if (skills.length > 0) {
                    // Update the streaming message with all skills grouped together
                    updateMessage(streamingMessageId, {
                        content: accumulatedText,
                        type: 'skill',
                        isStreaming: false,
                        skillData: finalResult,
                    })
                } else if (finalResult.skillMarkdown) {
                    // Backward compatibility - single skill format
                    updateMessage(streamingMessageId, {
                        content: finalResult.skillMarkdown || accumulatedText,
                        type: 'skill',
                        isStreaming: false,
                        skillData: finalResult,
                    })
                }
            } else {
                // Fallback if no final result was received
                updateMessage(streamingMessageId, {
                    content: accumulatedText || 'Generated skill',
                    type: 'skill',
                    isStreaming: false,
                })
            }

            // Update session status to completed and save final result
            if (currentSessionId && finalResult) {
                try {
                    await setSessionStatus({
                        sessionId: currentSessionId,
                        status: 'completed',
                        finalResult: {
                            success: finalResult.success,
                            skills: finalResult.skills || [],
                            skillMarkdown: finalResult.skillMarkdown,
                            name: finalResult.name,
                            description: finalResult.description,
                            validationStatus: finalResult.validationStatus,
                            issues: finalResult.issues,
                            repairAttempts: finalResult.repairAttempts,
                        },
                    })
                } catch (err) {
                    console.error('Failed to update session status:', err)
                }
            } else if (currentSessionId) {
                try {
                    await setSessionStatus({
                        sessionId: currentSessionId,
                        status: 'completed',
                    })
                } catch (err) {
                    console.error('Failed to update session status:', err)
                }
            }

            setConversationState('idle')
            setMaxTurnsReached(false)
            setMaxTurnsMessage('')
        } catch (err) {
            updateMessage(loadingId, {
                content: err instanceof Error ? err.message : 'An error occurred',
                type: 'error',
            })
            setConversationState('idle')
        }
    }, [addMessage, removeMessage, updateMessage, currentSessionId, setSessionStatus])

    // Handle structured answers from ClarifierPanel
    const handleClarifierSubmit = useCallback(async (answers: Array<{ question: string; answer: string }>) => {
        if (answers.length === 0) return

        setIsProcessing(true)
        setError(null)

        // Add user's answers to Q&A
        qaRef.current = [...qaRef.current, ...answers]

        // Add a summary message showing user's answers
        const answerSummary = answers.map(a => `**${a.question}**\n${a.answer}`).join('\n\n')
        addMessage({
            role: 'user',
            content: answerSummary,
            type: 'answer',
        })

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

            // Update session with new Q&A
            if (currentSessionId) {
                try {
                    await updateSession({
                        sessionId: currentSessionId,
                        qa: answers,
                    })
                } catch (err) {
                    console.error('Failed to update session:', err)
                }
            }

            // Handle max turns reached
            if (data.maxTurnsReached) {
                setMaxTurnsReached(true)
                setMaxTurnsMessage(data.message || '')
            }

            if (data.status === 'ready') {
                setConversationState('generating')
                pendingQuestionsRef.current = []
                // Update session status to ready
                if (currentSessionId) {
                    try {
                        await setSessionStatus({
                            sessionId: currentSessionId,
                            status: 'ready',
                        })
                    } catch (err) {
                        console.error('Failed to update session status:', err)
                    }
                }
                await generateSkill(intentRef.current, qaRef.current)
            } else {
                // Just update pending questions - ClarifierPanel will render them
                pendingQuestionsRef.current = data.questions || []
            }
        } catch (err) {
            updateMessage(loadingId, {
                content: err instanceof Error ? err.message : 'An error occurred',
                type: 'error',
            })
            setConversationState('idle')
        } finally {
            setIsProcessing(false)
        }
    }, [addMessage, removeMessage, updateMessage, generateSkill, currentSessionId, updateSession, setSessionStatus])

    // Handle new intent submission
    const handleSubmit = useCallback(async (message: PromptInputMessage) => {
        const text = message.text.trim()
        if (!text) return

        setError(null)
        setIsProcessing(true)

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
        setMaxTurnsReached(false)
        setMaxTurnsMessage('')

        const loadingId = addMessage({
            role: 'assistant',
            content: 'Analyzing your request...',
            type: 'loading',
        })

        try {
            // Create session in Convex
            const sessionId = await createSession({ intent: text })
            setCurrentSessionId(sessionId)

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
                // Update session status to ready
                try {
                    await setSessionStatus({
                        sessionId: sessionId,
                        status: 'ready',
                    })
                } catch (err) {
                    console.error('Failed to update session status:', err)
                }
                await generateSkill(text, [])
            } else {
                // Just set state and pending questions - ClarifierPanel will render them
                setConversationState('clarifying')
                pendingQuestionsRef.current = data.questions || []
            }
        } catch (err) {
            updateMessage(loadingId, {
                content: err instanceof Error ? err.message : 'An error occurred',
                type: 'error',
            })
        } finally {
            setIsProcessing(false)
        }
    }, [addMessage, removeMessage, updateMessage, generateSkill, createSession, setSessionStatus])

    // Handle new chat
    const handleNewChat = useCallback(() => {
        setMessages([])
        setSelectedSkillId(null)
        setCurrentSessionId(null)
        setConversationState('idle')
        setError(null)
        setMaxTurnsReached(false)
        setMaxTurnsMessage('')
        intentRef.current = ''
        qaRef.current = []
        turnRef.current = 0
        pendingQuestionsRef.current = []
    }, [])

    // Handle loading a skill from sidebar
    const handleLoadSkill = useCallback((skill: Skill) => {
        setSelectedSkillId(skill._id)
        setCurrentSessionId(null)
        setConversationState('idle')
        setError(null)
        setMaxTurnsReached(false)
        setMaxTurnsMessage('')
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
                skills: [{
                    markdown: skill.skillMarkdown,
                    name: skill.name,
                    description: skill.description,
                    validationStatus: 'valid',
                }],
                // Backward compatibility
                skillMarkdown: skill.skillMarkdown,
                name: skill.name,
                description: skill.description,
                validationStatus: 'valid',
                issues: [],
                repairAttempts: 0,
            },
            timestamp: skill.updatedAt,
        })

        setMessages(newMessages)
    }, [])

    // Handle loading a session/conversation from sidebar
    const handleLoadSession = useCallback(async (session: Session) => {
        setSelectedSkillId(null)
        setCurrentSessionId(session._id)
        setError(null)
        setMaxTurnsReached(false)
        setMaxTurnsMessage('')
        intentRef.current = session.intent
        qaRef.current = session.qa
        turnRef.current = session.turn
        pendingQuestionsRef.current = []

        // Build messages from the session
        const newMessages: ChatMessage[] = [
            {
                id: nanoid(),
                role: 'user',
                content: session.intent,
                type: 'intent',
                timestamp: session.createdAt,
            },
        ]

        // Add Q&A as messages
        session.qa.forEach((qa, i) => {
            newMessages.push({
                id: nanoid(),
                role: 'assistant',
                content: qa.question,
                type: 'question',
                timestamp: session.createdAt + i * 2,
            })
            newMessages.push({
                id: nanoid(),
                role: 'user',
                content: qa.answer,
                type: 'answer',
                timestamp: session.createdAt + i * 2 + 1,
            })
        })

        // Add final skill result if session is completed and has finalResult
        if (session.status === 'completed' && session.finalResult) {
            const result = session.finalResult
            const skills = result.skills || []

            // Use the first skill's markdown or fall back to backward compatibility
            const skillMarkdown = skills.length > 0
                ? skills[0].markdown
                : (result.skillMarkdown || '')

            if (skillMarkdown) {
                // Convert session skills to SingleSkillData format with proper typing
                const skillsData: SingleSkillData[] = skills.map(skill => ({
                    markdown: skill.markdown,
                    name: skill.name,
                    description: skill.description,
                    validationStatus: skill.validationStatus,
                    issues: skill.issues as ValidationIssue[] | undefined,
                }))

                newMessages.push({
                    id: nanoid(),
                    role: 'assistant',
                    content: skillMarkdown,
                    type: 'skill',
                    skillData: {
                        success: result.success,
                        skills: skillsData,
                        skillMarkdown: result.skillMarkdown,
                        name: result.name,
                        description: result.description,
                        validationStatus: result.validationStatus || 'valid',
                        issues: result.issues as ValidationIssue[] | undefined,
                        repairAttempts: result.repairAttempts,
                    },
                    timestamp: session.updatedAt,
                })
            }
        }

        setMessages(newMessages)

        // If the session is in clarifying state, refetch pending questions
        if (session.status === 'clarifying') {
            setConversationState('generating') // Show loading state while fetching questions
            try {
                const response = await fetch('/api/skills/session/answer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        intent: session.intent,
                        qa: session.qa,
                        currentTurn: session.turn,
                        newAnswers: [], // Empty to just get fresh questions
                    }),
                })

                if (!response.ok) {
                    throw new Error('Failed to load clarification questions')
                }

                const data = await response.json()

                if (data.status === 'ready') {
                    // Session is actually ready to generate
                    setConversationState('idle')
                } else {
                    pendingQuestionsRef.current = data.questions || []
                    setConversationState('clarifying')
                }
            } catch (err) {
                console.error('Failed to refetch clarification questions:', err)
                setError('Failed to load clarification questions. Please try again.')
                setConversationState('idle')
            }
        } else {
            setConversationState(session.status === 'completed' ? 'idle' : 'idle')
        }
    }, [])

    // Handle save skill
    const handleSaveSkill = useCallback(async (messageId: string) => {
        const message = messages.find(m => m.id === messageId)
        if (!message?.skillData) {
            setError('Cannot save: skill data is missing')
            return
        }

        // Use the first skill from the skills array, or fall back to backward compatibility fields
        const skillToSave = message.skillData.skills?.[0] || {
            markdown: message.skillData.skillMarkdown || '',
            name: message.skillData.name,
            description: message.skillData.description,
            validationStatus: message.skillData.validationStatus,
            issues: message.skillData.issues,
        }

        if (!skillToSave.markdown || !skillToSave.name) {
            setError('Cannot save: skill data is missing')
            return
        }

        try {
            await createSkill({
                name: skillToSave.name,
                description: skillToSave.description || '',
                skillMarkdown: skillToSave.markdown,
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

    // Handle toggle edit mode
    const handleToggleEdit = useCallback((messageId: string) => {
        setEditingMessageIds(prev => {
            const newSet = new Set(prev)
            if (newSet.has(messageId)) {
                newSet.delete(messageId)
            } else {
                newSet.add(messageId)
            }
            return newSet
        })
    }, [])

    // Handle markdown change in editor
    const handleMarkdownChange = useCallback((messageId: string, newMarkdown: string) => {
        setMessages(prev => prev.map(msg => {
            if (msg.id !== messageId || !msg.skillData) return msg
            return {
                ...msg,
                skillData: {
                    ...msg.skillData,
                    skills: msg.skillData.skills?.map((skill, idx) =>
                        idx === 0 ? { ...skill, markdown: newMarkdown } : skill
                    ) || [{
                        markdown: newMarkdown,
                        name: msg.skillData.name,
                        description: msg.skillData.description,
                        validationStatus: msg.skillData.validationStatus,
                        issues: msg.skillData.issues,
                    }],
                    // Backward compatibility
                    skillMarkdown: newMarkdown,
                }
            }
        }))
    }, [])

    // Skip clarification
    const handleSkipClarification = useCallback(() => {
        setConversationState('generating')
        pendingQuestionsRef.current = []
        setMaxTurnsReached(false)
        setMaxTurnsMessage('')
        generateSkill(intentRef.current, qaRef.current)
    }, [generateSkill])

    const isLoading = conversationState === 'generating' || isProcessing
    const isClarifying = conversationState === 'clarifying'
    const hasPendingQuestions = pendingQuestionsRef.current.length > 0

    return (
        <div className="flex h-full bg-background">
            {/* Sidebar */}
            <GenerationsSidebar
                selectedSkillId={selectedSkillId}
                currentSessionId={currentSessionId}
                onSelectSkill={handleLoadSkill}
                onSelectSession={handleLoadSession}
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
                            <>
                                {messages.map((message) => (
                                    <Message key={message.id} from={message.role}>
                                        <MessageContent>
                                            {message.type === 'loading' ? (
                                                <div className="flex items-center gap-3">
                                                    <Loader size={16} />
                                                    <span className="text-muted-foreground">{message.content}</span>
                                                </div>
                                            ) : message.type === 'skill' && message.skillData ? (
                                                (() => {
                                                    const skills = message.skillData.skills || []
                                                    const hasMultipleSkills = skills.length > 1

                                                    // If multiple skills, use the first one for display; otherwise fall back to backward compat
                                                    const primarySkill = skills[0] || {
                                                        markdown: message.skillData.skillMarkdown || message.content || '',
                                                        name: message.skillData.name,
                                                        description: message.skillData.description,
                                                        validationStatus: message.skillData.validationStatus,
                                                        issues: message.skillData.issues,
                                                    }

                                                    if (!primarySkill.markdown && !message.isStreaming) {
                                                        return <div className="text-muted-foreground">No skill content</div>
                                                    }

                                                    const isEditing = editingMessageIds.has(message.id)
                                                    const isStreaming = message.isStreaming || false
                                                    const currentMarkdown = primarySkill.markdown || message.content || ''

                                                    // Render skill component (used for both single and first in multiple)
                                                    const renderSkill = (skill: typeof primarySkill, index: number, showActions: boolean = false) => {
                                                        const skillMarkdown = skill.markdown || currentMarkdown
                                                        const skillIsEditing = isEditing && index === 0 // Only first skill can be edited for now

                                                        return (
                                                            <div className={showActions ? "w-full max-w-2xl space-y-4" : "space-y-4"}>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-medium">{skill.name || `Generated Skill ${index + 1}`}</span>
                                                                    {skill.validationStatus === 'valid' && (
                                                                        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600">Valid</span>
                                                                    )}
                                                                    {skill.validationStatus === 'fixed' && (
                                                                        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600">Auto-fixed</span>
                                                                    )}
                                                                    {skill.validationStatus === 'failed' && (
                                                                        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-600">Failed</span>
                                                                    )}
                                                                </div>
                                                                {skillIsEditing ? (
                                                                    <MarkdownEditor
                                                                        content={skillMarkdown}
                                                                        onChange={(newMarkdown) => handleMarkdownChange(message.id, newMarkdown)}
                                                                        editable={true}
                                                                        placeholder="Edit your skill markdown..."
                                                                        showToolbar={true}
                                                                    />
                                                                ) : isStreaming ? (
                                                                    <MessageResponse>{skillMarkdown}</MessageResponse>
                                                                ) : (
                                                                    <CodeBlock code={skillMarkdown} language="markdown">
                                                                        <CodeBlockCopyButton />
                                                                    </CodeBlock>
                                                                )}
                                                                {showActions && (
                                                                    <MessageActions>
                                                                        <MessageAction
                                                                            tooltip={skillIsEditing ? "View Mode" : "Edit Mode"}
                                                                            onClick={() => handleToggleEdit(message.id)}
                                                                        >
                                                                            {skillIsEditing ? <EyeIcon className="size-4" /> : <EditIcon className="size-4" />}
                                                                        </MessageAction>
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
                                                                            onClick={() => handleCopy(skillMarkdown)}
                                                                        >
                                                                            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                                                                        </MessageAction>
                                                                    </MessageActions>
                                                                )}
                                                            </div>
                                                        )
                                                    }

                                                    if (hasMultipleSkills) {
                                                        // Multiple skills - show dropdown to select which skill to view
                                                        const selectedIndex = selectedSkillIndex[message.id] ?? 0
                                                        const selectedSkill = skills[selectedIndex] || primarySkill

                                                        return (
                                                            <div className="w-full max-w-2xl space-y-4">
                                                                {/* Dropdown to select skill */}
                                                                <div className="flex items-center gap-2">
                                                                    <Select
                                                                        value={selectedIndex.toString()}
                                                                        onValueChange={(value) => {
                                                                            if (value) {
                                                                                setSelectedSkillIndex(prev => ({
                                                                                    ...prev,
                                                                                    [message.id]: parseInt(value, 10)
                                                                                }))
                                                                            }
                                                                        }}
                                                                    >
                                                                        <SelectTrigger className="w-fit min-w-[200px]">
                                                                            <SelectValue>
                                                                                {selectedSkill.name || `Skill ${selectedIndex + 1}`}
                                                                            </SelectValue>
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            {skills.map((skill, index) => (
                                                                                <SelectItem key={index} value={index.toString()}>
                                                                                    {skill.name || `Generated Skill ${index + 1}`}
                                                                                </SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                    <span className="text-xs text-muted-foreground">
                                                                        ({skills.length} {skills.length === 1 ? 'skill' : 'skills'})
                                                                    </span>
                                                                </div>

                                                                {/* Render selected skill */}
                                                                {renderSkill(selectedSkill, selectedIndex, true)}
                                                            </div>
                                                        )
                                                    } else {
                                                        // Single skill - simple display with actions
                                                        return renderSkill(primarySkill, 0, true)
                                                    }
                                                })()
                                            ) : message.type === 'error' ? (
                                                <div className="text-destructive">{message.content}</div>
                                            ) : message.type === 'question' ? (
                                                <div className="whitespace-pre-wrap text-muted-foreground italic">
                                                    Q: {message.content}
                                                </div>
                                            ) : (
                                                <div className="whitespace-pre-wrap">{message.content}</div>
                                            )}
                                        </MessageContent>
                                    </Message>
                                ))}

                                {/* Clarifier Panel - shown when we have pending questions */}
                                {isClarifying && hasPendingQuestions && (
                                    <div className="mt-6">
                                        <ClarifierPanel
                                            questions={pendingQuestionsRef.current}
                                            onSubmit={handleClarifierSubmit}
                                            onSkip={handleSkipClarification}
                                            isLoading={isLoading}
                                            turn={turnRef.current}
                                            qa={qaRef.current}
                                            maxTurnsReached={maxTurnsReached}
                                            maxTurnsMessage={maxTurnsMessage}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </ConversationContent>
                    <ConversationScrollButton />
                </Conversation>

                {/* Input - only show for new intents, not during clarification */}
                {!isClarifying && (
                    <div className="border-t bg-background/95 px-4 py-4 backdrop-blur supports-backdrop-filter:bg-background/60">
                        <div className="mx-auto max-w-3xl">
                            <PromptInput
                                onSubmit={handleSubmit}
                                className="rounded-xl border shadow-sm"
                            >
                                <PromptInputTextarea
                                    placeholder="Describe the skill you want to create..."
                                    disabled={isLoading}
                                />
                                <PromptInputFooter>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground" />
                                    <PromptInputSubmit disabled={isLoading} />
                                </PromptInputFooter>
                            </PromptInput>
                        </div>
                    </div>
                )}
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
