'use client'

import { Authenticated, Unauthenticated, AuthLoading } from 'convex/react'
import { SignInButton, UserButton } from '@clerk/nextjs'
import { SkillShiftApp } from '@/components/SkillShiftApp'
import { Loader } from '@/components/ai-elements/loader'

export default function Page() {
    return (
        <div className="h-screen overflow-hidden bg-background">
            <AuthLoading>
                <div className="flex h-full items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                        <Loader size={24} />
                        <p className="text-muted-foreground text-sm">Loading...</p>
                    </div>
                </div>
            </AuthLoading>

            <Unauthenticated>
                <div className="flex h-full flex-col items-center justify-center gap-8 p-8">
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
                <div className="flex h-full flex-col">
                    {/* Header */}
                    <header className="z-50 flex h-12 shrink-0 items-center justify-between border-b bg-background px-4">
                        <div className="flex items-center gap-2">
                            <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs">
                                S
                            </div>
                            <span className="font-semibold text-sm">SkillShift</span>
                        </div>
                        <UserButton afterSignOutUrl="/" />
                    </header>

                    {/* App Content */}
                    <div className="flex-1 overflow-hidden">
                        <SkillShiftApp />
                    </div>
                </div>
            </Authenticated>
        </div>
    )
}
