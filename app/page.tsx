'use client'

import { Authenticated, Unauthenticated, AuthLoading } from 'convex/react'
import { SignInButton, UserButton } from '@clerk/nextjs'
import { SkillShiftApp } from '@/components/SkillShiftApp'
import { Loader } from '@/components/ai-elements/loader'

export default function Page() {
    return (
        <div className="min-h-screen bg-background">
            <AuthLoading>
                <div className="flex min-h-screen items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                        <Loader size={24} />
                        <p className="text-muted-foreground text-sm">Loading...</p>
                    </div>
                </div>
            </AuthLoading>

            <Unauthenticated>
                <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
                    <div className="flex flex-col items-center gap-4 text-center">
                        <div className="flex items-center gap-2">
                            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
                                S
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight">SkillShift</h1>
                        </div>
                        <p className="max-w-md text-muted-foreground">
                            Turn product intent into reusable Claude skills. Paste a PRD, feature idea, or workflow description and get a production-ready Agent Skill.
                        </p>
                    </div>
                    <SignInButton mode="modal">
                        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                            Sign in to get started
                        </button>
                    </SignInButton>
                </div>
            </Unauthenticated>

            <Authenticated>
                <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
                        <div className="flex items-center gap-2">
                            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                                S
                            </div>
                            <span className="font-semibold">SkillShift</span>
                        </div>
                        <UserButton afterSignOutUrl="/" />
                    </div>
                </header>
                <main className="mx-auto max-w-5xl p-4">
                    <SkillShiftApp />
                </main>
            </Authenticated>
        </div>
    )
}
