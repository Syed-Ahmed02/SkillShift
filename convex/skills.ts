import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

// Create/save a new skill
export const create = mutation({
    args: {
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
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity()
        if (identity === null) {
            throw new Error('Not authenticated')
        }

        const now = Date.now()
        const skillId = await ctx.db.insert('skills', {
            userId: identity.subject,
            name: args.name,
            description: args.description,
            skillMarkdown: args.skillMarkdown,
            sourceIntent: args.sourceIntent,
            qaSnapshot: args.qaSnapshot,
            createdAt: now,
            updatedAt: now,
        })

        return skillId
    },
})

// List user's skills
export const listMine = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity()
        if (identity === null) {
            throw new Error('Not authenticated')
        }

        return await ctx.db
            .query('skills')
            .withIndex('by_user', (q) => q.eq('userId', identity.subject))
            .order('desc')
            .collect()
    },
})

// Get a single skill by ID
export const get = query({
    args: {
        skillId: v.id('skills'),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity()
        if (identity === null) {
            throw new Error('Not authenticated')
        }

        const skill = await ctx.db.get(args.skillId)
        if (!skill || skill.userId !== identity.subject) {
            return null
        }

        return skill
    },
})

// Delete a skill
export const remove = mutation({
    args: {
        skillId: v.id('skills'),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity()
        if (identity === null) {
            throw new Error('Not authenticated')
        }

        const skill = await ctx.db.get(args.skillId)
        if (!skill || skill.userId !== identity.subject) {
            throw new Error('Skill not found or not authorized')
        }

        await ctx.db.delete(args.skillId)
    },
})

// Update a skill
export const update = mutation({
    args: {
        skillId: v.id('skills'),
        name: v.optional(v.string()),
        description: v.optional(v.string()),
        skillMarkdown: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity()
        if (identity === null) {
            throw new Error('Not authenticated')
        }

        const skill = await ctx.db.get(args.skillId)
        if (!skill || skill.userId !== identity.subject) {
            throw new Error('Skill not found or not authorized')
        }

        const updates: Record<string, unknown> = { updatedAt: Date.now() }
        if (args.name !== undefined) updates.name = args.name
        if (args.description !== undefined) updates.description = args.description
        if (args.skillMarkdown !== undefined) updates.skillMarkdown = args.skillMarkdown

        await ctx.db.patch(args.skillId, updates)
    },
})

