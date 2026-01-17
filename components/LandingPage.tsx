'use client'

import { SignInButton } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function LandingPage() {
    return (
        <div className="min-h-screen bg-background">
            {/* Navigation */}
            <nav className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
                <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                            S
                        </div>
                        <span className="font-semibold">SkillShift</span>
                    </div>
                    <SignInButton mode="modal">
                        <Button variant="outline" size="sm">
                            Sign in
                        </Button>
                    </SignInButton>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="mx-auto max-w-6xl px-6 pt-20 pb-16">
                <div className="flex flex-col items-center text-center gap-6">
                    <Badge variant="secondary" className="px-3 py-1">
                        Stop wrestling with markdown
                    </Badge>
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight max-w-4xl">
                        Generate production-ready{' '}
                        <span className="text-primary">Claude Skills</span>{' '}
                        from plain English
                    </h1>
                    <p className="text-muted-foreground text-lg md:text-xl max-w-2xl">
                        Paste your PRD, feature idea, or workflow description.
                        Get a perfectly formatted, reusable Agent Skill in seconds.
                    </p>
                    <div className="flex gap-3 pt-4">
                        <SignInButton mode="modal">
                            <Button size="lg" className="h-11 px-8 text-sm">
                                Get Started Free
                            </Button>
                        </SignInButton>
                        <Button variant="outline" size="lg" className="h-11 px-8 text-sm">
                            See Example
                        </Button>
                    </div>
                </div>
            </section>

            {/* Problem Section */}
            <section className="bg-muted/50 border-y">
                <div className="mx-auto max-w-6xl px-6 py-20">
                    <div className="text-center mb-12">
                        <h2 className="text-2xl md:text-3xl font-bold mb-4">
                            Let's be honest: generating markdown is annoying
                        </h2>
                        <p className="text-muted-foreground max-w-2xl mx-auto">
                            You've been there. Trying to format the perfect Agent Skill spec,
                            fighting with indentation, headers, and YAML frontmatter.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        <Card className="bg-background">
                            <CardHeader>
                                <CardTitle className="text-destructive flex items-center gap-2">
                                    <span className="text-lg">1.</span>
                                    Formatting Hell
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CardDescription className="text-sm">
                                    Spending 30 minutes fixing indentation, escaping characters,
                                    and making sure your code blocks render correctly.
                                </CardDescription>
                            </CardContent>
                        </Card>

                        <Card className="bg-background">
                            <CardHeader>
                                <CardTitle className="text-destructive flex items-center gap-2">
                                    <span className="text-lg">2.</span>
                                    Structure Guesswork
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CardDescription className="text-sm">
                                    What sections does an Agent Skill need? Triggers? Actions?
                                    Context? You're constantly referencing docs.
                                </CardDescription>
                            </CardContent>
                        </Card>

                        <Card className="bg-background">
                            <CardHeader>
                                <CardTitle className="text-destructive flex items-center gap-2">
                                    <span className="text-lg">3.</span>
                                    Copy-Paste Chaos
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CardDescription className="text-sm">
                                    Copying from old skills, merging pieces, losing track of
                                    what came from where. It's a mess.
                                </CardDescription>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>

            {/* Solution Section */}
            <section className="mx-auto max-w-6xl px-6 py-20">
                <div className="text-center mb-12">
                    <Badge variant="outline" className="mb-4">The Solution</Badge>
                    <h2 className="text-2xl md:text-3xl font-bold mb-4">
                        Describe what you want. We handle the markdown.
                    </h2>
                    <p className="text-muted-foreground max-w-2xl mx-auto">
                        SkillShift transforms your natural language descriptions into
                        properly structured, production-ready Agent Skills.
                    </p>

                </div>

                <div className="grid md:grid-cols-2 gap-8 items-start">
                    {/* Before */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary">Before</Badge>
                            <span className="text-sm text-muted-foreground">Your input</span>
                        </div>
                        <Card className="bg-muted/30">
                            <CardContent className="pt-4">
                                <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                                    {`"I need a skill that helps review 
PRs. It should check for common 
issues like missing tests, large 
diffs, and security concerns. 
Suggest fixes inline."`}
                                </pre>
                            </CardContent>
                        </Card>
                    </div>

                    {/* After */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Badge variant="default">After</Badge>
                            <span className="text-sm text-muted-foreground">Generated skill</span>
                        </div>
                        <Card className="bg-muted/30 border-primary/20">
                            <CardContent className="pt-4">
                                <pre className="text-xs font-mono text-foreground whitespace-pre-wrap overflow-x-auto">
                                    {`# PR Review Assistant

## Description
Automated PR reviewer that identifies 
common issues and suggests fixes.

## Triggers
- New PR opened
- PR updated with commits

## Actions
- Check test coverage
- Analyze diff size
- Scan for security issues
- Post inline suggestions

## Context
- Repository conventions
- Team coding standards`}
                                </pre>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="bg-muted/50 border-y">
                <div className="mx-auto max-w-6xl px-6 py-20">
                    <div className="text-center mb-12">
                        <h2 className="text-2xl md:text-3xl font-bold mb-4">
                            Built for speed and accuracy
                        </h2>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <Card className="bg-background">
                            <CardHeader>
                                <CardTitle className="text-sm">Instant Generation</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CardDescription>
                                    Skills generated in seconds, not minutes of manual formatting.
                                </CardDescription>
                            </CardContent>
                        </Card>

                        <Card className="bg-background">
                            <CardHeader>
                                <CardTitle className="text-sm">Smart Structure</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CardDescription>
                                    Automatically organizes triggers, actions, and context sections.
                                </CardDescription>
                            </CardContent>
                        </Card>

                        <Card className="bg-background">
                            <CardHeader>
                                <CardTitle className="text-sm">Iterative Refinement</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CardDescription>
                                    Chat with AI to refine and improve your skill until it's perfect.
                                </CardDescription>
                            </CardContent>
                        </Card>

                        <Card className="bg-background">
                            <CardHeader>
                                <CardTitle className="text-sm">Export Ready</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CardDescription>
                                    Copy the final markdown directly into Claude or your workflow.
                                </CardDescription>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="mx-auto max-w-6xl px-6 py-20">
                <div className="text-center">
                    <h2 className="text-2xl md:text-3xl font-bold mb-4">
                        Stop fighting with markdown
                    </h2>
                    <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                        Join developers who've ditched manual skill writing.
                        Generate your first Agent Skill in under a minute.
                    </p>
                    <SignInButton mode="modal">
                        <Button size="lg" className="h-12 px-10 text-sm">
                            Start Creating Skills
                        </Button>
                    </SignInButton>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t bg-muted/30">
                <div className="mx-auto max-w-6xl px-6 py-8">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <div className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground font-bold text-xs">
                                S
                            </div>
                            <span className="text-sm font-medium">SkillShift</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Transform product intent into reusable Claude skills
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    )
}
