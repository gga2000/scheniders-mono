"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { useEffect, useCallback } from "react";
import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Strikethrough,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Link as LinkIcon,
    Unlink,
    AlignLeft,
    AlignCenter,
    AlignRight,
    RemoveFormatting,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    className?: string;
}

export function RichTextEditor({ value, onChange, placeholder = "Write your product description...", className }: RichTextEditorProps) {
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [2, 3],
                },
            }),
            Underline,
            Link.configure({
                openOnClick: false,
                HTMLAttributes: {
                    class: "text-blue-600 underline cursor-pointer",
                },
            }),
            Placeholder.configure({
                placeholder,
            }),
            TextAlign.configure({
                types: ["heading", "paragraph"],
            }),
        ],
        content: value,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: "prose prose-sm max-w-none min-h-[200px] px-4 py-3 focus:outline-none text-foreground",
            },
        },
    });

    // Sync external value changes (e.g., draft restore)
    useEffect(() => {
        if (editor && value !== editor.getHTML()) {
            editor.commands.setContent(value, { emitUpdate: false });
        }
    }, [value, editor]);

    if (!editor) {
        return (
            <div className="w-full min-h-[250px] bg-[var(--background)] border border-[var(--card-border)] rounded-xl animate-pulse" />
        );
    }

    return (
        <div className={cn("border border-[var(--card-border)] rounded-xl overflow-hidden bg-[var(--background)] focus-within:ring-2 focus-within:ring-[var(--pastel-yellow)] transition-all", className)}>
            <EditorToolbar editor={editor} />
            <EditorContent editor={editor} />
        </div>
    );
}

function EditorToolbar({ editor }: { editor: Editor }) {
    const setLink = useCallback(() => {
        const previousUrl = editor.getAttributes("link").href;
        const url = window.prompt("URL", previousUrl);

        if (url === null) return; // cancelled
        if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
        }

        editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }, [editor]);

    return (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-[var(--card-border)] bg-[var(--card-bg)]">
            {/* Text formatting */}
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                active={editor.isActive("bold")}
                title="Bold"
            >
                <Bold className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                active={editor.isActive("italic")}
                title="Italic"
            >
                <Italic className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                active={editor.isActive("underline")}
                title="Underline"
            >
                <UnderlineIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleStrike().run()}
                active={editor.isActive("strike")}
                title="Strikethrough"
            >
                <Strikethrough className="w-4 h-4" />
            </ToolbarButton>

            <ToolbarDivider />

            {/* Headings */}
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                active={editor.isActive("heading", { level: 2 })}
                title="Heading 2"
            >
                <Heading2 className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                active={editor.isActive("heading", { level: 3 })}
                title="Heading 3"
            >
                <Heading3 className="w-4 h-4" />
            </ToolbarButton>

            <ToolbarDivider />

            {/* Lists */}
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                active={editor.isActive("bulletList")}
                title="Bullet List"
            >
                <List className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                active={editor.isActive("orderedList")}
                title="Ordered List"
            >
                <ListOrdered className="w-4 h-4" />
            </ToolbarButton>

            <ToolbarDivider />

            {/* Links */}
            <ToolbarButton
                onClick={setLink}
                active={editor.isActive("link")}
                title="Add Link"
            >
                <LinkIcon className="w-4 h-4" />
            </ToolbarButton>
            {editor.isActive("link") && (
                <ToolbarButton
                    onClick={() => editor.chain().focus().unsetLink().run()}
                    title="Remove Link"
                >
                    <Unlink className="w-4 h-4" />
                </ToolbarButton>
            )}

            <ToolbarDivider />

            {/* Alignment */}
            <ToolbarButton
                onClick={() => editor.chain().focus().setTextAlign("left").run()}
                active={editor.isActive({ textAlign: "left" })}
                title="Align Left"
            >
                <AlignLeft className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().setTextAlign("center").run()}
                active={editor.isActive({ textAlign: "center" })}
                title="Align Center"
            >
                <AlignCenter className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().setTextAlign("right").run()}
                active={editor.isActive({ textAlign: "right" })}
                title="Align Right"
            >
                <AlignRight className="w-4 h-4" />
            </ToolbarButton>

            <ToolbarDivider />

            {/* Clear */}
            <ToolbarButton
                onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
                title="Clear Formatting"
            >
                <RemoveFormatting className="w-4 h-4" />
            </ToolbarButton>
        </div>
    );
}

function ToolbarButton({
    onClick,
    active,
    title,
    children,
}: {
    onClick: () => void;
    active?: boolean;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={cn(
                "p-1.5 rounded-lg transition-colors",
                active
                    ? "bg-[var(--pastel-yellow)] text-amber-900"
                    : "text-muted hover:text-foreground hover:bg-[var(--background)]"
            )}
        >
            {children}
        </button>
    );
}

function ToolbarDivider() {
    return <div className="w-px h-5 bg-[var(--card-border)] mx-1" />;
}
