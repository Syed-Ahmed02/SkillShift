import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

// Create a new skill generation session
export const create = mutation({
    args: {
        intent: v.string(),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity()
        if (identity === null) {
            throw new Error('Not authenticated')
        }

        const now = Date.now()
        const sessionId = await ctx.db.insert('skillSessions', {
            userId: identity.subject,
            intent: args.intent,
            turn: 0,
            qa: [],
            status: 'clarifying',
            createdAt: now,
            updatedAt: now,
        })

        return sessionId
    },
})

// Get a session by ID
export const get = query({
    args: {
        sessionId: v.id('skillSessions'),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity()
        if (identity === null) {
            throw new Error('Not authenticated')
        }

        const session = await ctx.db.get(args.sessionId)
        if (!session || session.userId !== identity.subject) {
            return null
        }

        return session
    },
})

// Append Q&A to a session
export const appendQA = mutation({
    args: {
        sessionId: v.id('skillSessions'),
        qa: v.array(
            v.object({
                question: v.string(),
                answer: v.string(),
            })
        ),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity()
        if (identity === null) {
            throw new Error('Not authenticated')
        }

        const session = await ctx.db.get(args.sessionId)
        if (!session || session.userId !== identity.subject) {
            throw new Error('Session not found or not authorized')
        }

        await ctx.db.patch(args.sessionId, {
            qa: [...session.qa, ...args.qa],
            turn: session.turn + 1,
            updatedAt: Date.now(),
        })
    },
})

// Update session status
export const setStatus = mutation({
    args: {
        sessionId: v.id('skillSessions'),
        status: v.union(
            v.literal('clarifying'),
            v.literal('ready'),
            v.literal('generating'),
            v.literal('completed'),
            v.literal('failed')
        ),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity()
        if (identity === null) {
            throw new Error('Not authenticated')
        }

        const session = await ctx.db.get(args.sessionId)
        if (!session || session.userId !== identity.subject) {
            throw new Error('Session not found or not authorized')
        }

        await ctx.db.patch(args.sessionId, {
            status: args.status,
            updatedAt: Date.now(),
        })
    },
})

// List user's sessions
export const listMine = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity()
        if (identity === null) {
            throw new Error('Not authenticated')
        }

        return await ctx.db
            .query('skillSessions')
            .withIndex('by_user', (q) => q.eq('userId', identity.subject))
            .order('desc')
            .take(20)
    },
})

