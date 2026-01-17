import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
    // Skill generation sessions (tracks the clarifier Q&A flow)
    skillSessions: defineTable({
        userId: v.string(),
        intent: v.string(),
        turn: v.number(),
        qa: v.array(
            v.object({
                question: v.string(),
                answer: v.string(),
            })
        ),
        status: v.union(
            v.literal('clarifying'),
            v.literal('ready'),
            v.literal('generating'),
            v.literal('completed'),
            v.literal('failed')
        ),
        finalResult: v.optional(
            v.object({
                success: v.boolean(),
                skills: v.array(
                    v.object({
                        markdown: v.string(),
                        name: v.optional(v.string()),
                        description: v.optional(v.string()),
                        validationStatus: v.union(
                            v.literal('valid'),
                            v.literal('fixed'),
                            v.literal('failed')
                        ),
                        issues: v.optional(
                            v.array(
                                v.object({
                                    type: v.string(),
                                    severity: v.string(),
                                    description: v.string(),
                                    suggestion: v.string(),
                                })
                            )
                        ),
                    })
                ),
                // Backward compatibility - single skill fields
                skillMarkdown: v.optional(v.string()),
                name: v.optional(v.string()),
                description: v.optional(v.string()),
                validationStatus: v.optional(
                    v.union(
                        v.literal('valid'),
                        v.literal('fixed'),
                        v.literal('failed')
                    )
                ),
                issues: v.optional(
                    v.array(
                        v.object({
                            type: v.string(),
                            severity: v.string(),
                            description: v.string(),
                            suggestion: v.string(),
                        })
                    )
                ),
                repairAttempts: v.number(),
            })
        ),
        createdAt: v.number(),
        updatedAt: v.number(),
    }).index('by_user', ['userId']),

    // Saved skills
    skills: defineTable({
        userId: v.string(),
        name: v.string(),
        description: v.string(),
        skillMarkdown: v.string(),
        sourceIntent: v.string(),
        qaSnapshot: v.array(
            v.object({
                question: v.string(),
                answer: v.string(),
            })
        ),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_user', ['userId'])
        .index('by_user_and_name', ['userId', 'name']),
})

