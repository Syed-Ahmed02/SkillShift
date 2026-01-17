'use client'

import { Authenticated, Unauthenticated, AuthLoading } from 'convex/react'
import { UserButton } from '@clerk/nextjs'
import { SkillShiftApp } from '@/components/SkillShiftApp'
import { LandingPage } from '@/components/LandingPage'
import { Loader } from '@/components/ai-elements/loader'

export default function Page() {
    return (
        <>
            <AuthLoading>
                <div className="h-screen bg-background flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                        <Loader size={24} />
                        <p className="text-muted-foreground text-sm">Loading...</p>
                    </div>
                </div>
            </AuthLoading>

            <Unauthenticated>
                <LandingPage />
            </Unauthenticated>

            <Authenticated>
                <div className="h-screen overflow-hidden bg-background flex flex-col">
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
        </>
    )
}
