// Types for the multi-agent pipeline

export interface ClarifierQuestion {
    id: string
    question: string
    type: 'multiple_choice' | 'open_ended'
    options?: string[]
}

export interface ClarifierResponse {
    status: 'need_more_info' | 'ready'
    questions: ClarifierQuestion[]
    reasoning: string
}

export interface QAPair {
    question: string
    answer: string
}

export interface ValidationIssue {
    type: 'spec_violation' | 'alignment' | 'quality'
    severity: 'error' | 'warning'
    description: string
    suggestion: string
}

export interface ValidatorResponse {
    valid: boolean
    issues: ValidationIssue[]
    summary: string
}

export interface SessionStartRequest {
    intent: string
}

export interface SessionStartResponse {
    sessionId: string
    status: 'need_more_info' | 'ready'
    questions: ClarifierQuestion[]
    turn: number
}

export interface SessionAnswerRequest {
    sessionId: string
    answers: Array<{
        questionId: string
        answer: string
    }>
}

export interface SessionAnswerResponse {
    status: 'need_more_info' | 'ready'
    questions: ClarifierQuestion[]
    turn: number
}

export interface GenerateRequest {
    sessionId: string
}

export interface GenerateResponse {
    success: boolean
    skillMarkdown?: string
    name?: string
    description?: string
    validationStatus: 'valid' | 'fixed' | 'failed'
    issues?: ValidationIssue[]
    repairAttempts: number
}

