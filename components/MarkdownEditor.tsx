'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect } from 'react'
import { Button } from './ui/button'
import {
    Bold,
    Italic,
    List,
    ListOrdered,
    Heading1,
    Heading2,
    Heading3,
    Quote,
    Code,
    Undo,
    Redo,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Toolbar button component defined outside to avoid creating during render
const ToolbarButton = ({
    onClick,
    isActive,
    tooltip,
    children,
}: {
    onClick: () => void
    isActive?: boolean
    tooltip: string
    children: React.ReactNode
}) => (
    <Button
        type="button"
        variant={isActive ? 'secondary' : 'ghost'}
        size="icon"
        className={cn('size-8', isActive && 'bg-accent')}
        onClick={onClick}
        title={tooltip}
    >
        {children}
    </Button>
)

interface MarkdownEditorProps {
    content: string
    onChange: (markdown: string) => void
    editable?: boolean
    placeholder?: string
    className?: string
    showToolbar?: boolean
}

export function MarkdownEditor({
    content,
    onChange,
    editable = true,
    placeholder = 'Start writing...',
    className,
    showToolbar = true,
}: MarkdownEditorProps) {
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [1, 2, 3],
                },
            }),
            Markdown,
            Placeholder.configure({
                placeholder,
            }),
        ],
        content,
        editable,
        editorProps: {
            attributes: {
                class: cn(
                    'prose prose-sm dark:prose-invert max-w-none focus:outline-none',
                    'min-h-[200px] px-4 py-3',
                    '[&_p]:my-2 [&_p]:leading-7',
                    '[&_ul]:my-2 [&_ol]:my-2',
                    '[&_li]:my-1',
                    '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2',
                    '[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-2',
                    '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1',
                    '[&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-4 [&_blockquote]:italic',
                    '[&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono',
                    '[&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-4',
                    '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
                ),
            },
        },
        onUpdate: ({ editor }) => {
            const markdown = editor.getMarkdown()
            onChange(markdown)
        },
    })

    // Update editor content when prop changes externally
    useEffect(() => {
        if (!editor) return
        const current = editor.getMarkdown()
        if (content !== current) {
            editor.commands.setContent(content)
        }
    }, [content, editor])

    // Update editable state
    useEffect(() => {
        if (!editor) return
        editor.setEditable(editable)
    }, [editable, editor])

    if (!editor) {
        return <div className="h-[200px] animate-pulse rounded-lg bg-muted" />
    }

    return (
        <div className={cn('w-full rounded-lg border bg-background', className)}>
            {showToolbar && editable && (
                <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 px-2 py-2">
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        isActive={editor.isActive('bold')}
                        tooltip="Bold"
                    >
                        <Bold className="size-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        isActive={editor.isActive('italic')}
                        tooltip="Italic"
                    >
                        <Italic className="size-4" />
                    </ToolbarButton>
                    <div className="mx-1 h-6 w-px bg-border" />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        isActive={editor.isActive('heading', { level: 1 })}
                        tooltip="Heading 1"
                    >
                        <Heading1 className="size-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        isActive={editor.isActive('heading', { level: 2 })}
                        tooltip="Heading 2"
                    >
                        <Heading2 className="size-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                        isActive={editor.isActive('heading', { level: 3 })}
                        tooltip="Heading 3"
                    >
                        <Heading3 className="size-4" />
                    </ToolbarButton>
                    <div className="mx-1 h-6 w-px bg-border" />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        isActive={editor.isActive('bulletList')}
                        tooltip="Bullet List"
                    >
                        <List className="size-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        isActive={editor.isActive('orderedList')}
                        tooltip="Numbered List"
                    >
                        <ListOrdered className="size-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                        isActive={editor.isActive('blockquote')}
                        tooltip="Quote"
                    >
                        <Quote className="size-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleCode().run()}
                        isActive={editor.isActive('code')}
                        tooltip="Inline Code"
                    >
                        <Code className="size-4" />
                    </ToolbarButton>
                    <div className="mx-1 h-6 w-px bg-border" />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().undo().run()}
                        tooltip="Undo"
                    >
                        <Undo className="size-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().redo().run()}
                        tooltip="Redo"
                    >
                        <Redo className="size-4" />
                    </ToolbarButton>
                </div>
            )}
            <div className="min-h-[200px] overflow-y-auto">
                <EditorContent editor={editor} />
            </div>
        </div>
    )
}

