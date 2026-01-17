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

