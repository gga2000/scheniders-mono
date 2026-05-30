"use client";

import { useEffect, useState, useRef } from "react";
import { Plus, Trash2, Edit2, MessageSquare, X, Smile, Phone, Bell, Gift, Filter, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@scheniders/ui/button";
import { Input } from "@scheniders/ui/input";
import { Textarea } from "@scheniders/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@scheniders/ui/dialog";
import { cn } from "@/lib/utils";
import { getEmojiList, processEmojis } from "@/lib/emoji-shortcodes";
import { useLanguage } from "@/hooks/use-language";

interface Template {
    id: string;
    name: string;
    content: string;
    content_ar?: string;
    is_active: boolean;
    template_type?: 'confirmation' | 'reminder' | 'discount' | null;
}

type FilterType = 'all' | 'workflow' | 'other';

export function MessageTemplatesList() {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [filter, setFilter] = useState<FilterType>('all');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [activeField, setActiveField] = useState<'content' | 'content_ar'>('content_ar');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const textareaArRef = useRef<HTMLTextAreaElement>(null);
    const { t } = useLanguage();

    useEffect(() => {
        fetchTemplates();
    }, []);

    async function fetchTemplates() {
        const { data } = await supabase
            .from("message_templates")
            .select("*")
            .order("sort_order");
        if (data) setTemplates(data);
        setLoading(false);
    }

    async function handleSave() {
        if (!editingTemplate) return;

        if (editingTemplate.id === "new") {
            const { data } = await supabase
                .from("message_templates")
                .insert([{
                    name: editingTemplate.name,
                    content: editingTemplate.content,
                    content_ar: editingTemplate.content_ar,
                    is_active: true,
                    template_type: editingTemplate.template_type,
                }])
                .select()
                .single();

            if (data) setTemplates([...templates, data]);
        } else {
            await supabase
                .from("message_templates")
                .update({
                    name: editingTemplate.name,
                    content: editingTemplate.content,
                    content_ar: editingTemplate.content_ar,
                    template_type: editingTemplate.template_type,
                })
                .eq("id", editingTemplate.id);

            setTemplates(templates.map(t => t.id === editingTemplate.id ? editingTemplate : t));
        }
        setIsDialogOpen(false);
        setEditingTemplate(null);
    }

    async function handleDelete(id: string) {
        if (!confirm("Delete this template?")) return;
        setTemplates(templates.filter(t => t.id !== id));
        await supabase.from("message_templates").delete().eq("id", id);
    }

    function openNew() {
        setEditingTemplate({ id: "new", name: "", content: "", content_ar: "", is_active: true, template_type: null });
        setIsDialogOpen(true);
    }

    function openEdit(t: Template) {
        setEditingTemplate(t);
        setIsDialogOpen(true);
    }

    function insertEmoji(shortcode: string) {
        if (!editingTemplate) return;
        const insertText = `{e:${shortcode}}`;

        if (activeField === 'content_ar') {
            setEditingTemplate({
                ...editingTemplate,
                content_ar: (editingTemplate.content_ar || '') + insertText
            });
        } else {
            setEditingTemplate({
                ...editingTemplate,
                content: editingTemplate.content + insertText
            });
        }
        setShowEmojiPicker(false);
    }

    const filteredTemplates = templates.filter(t => {
        if (filter === 'all') return true;
        if (filter === 'workflow') return !!t.template_type;
        return !t.template_type;
    });

    const getTypeBadge = (type: Template['template_type']) => {
        if (!type) return null;
        const config = {
            confirmation: { label: t('templates.confirmation'), color: 'bg-emerald-100 text-emerald-700', icon: Phone },
            reminder: { label: t('templates.reminder'), color: 'bg-amber-100 text-amber-700', icon: Bell },
            discount: { label: t('templates.discount'), color: 'bg-rose-100 text-rose-700', icon: Gift },
        };
        const c = config[type];
        const Icon = c.icon;
        return (
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", c.color)}>
                <Icon className="w-3 h-3" />
                {c.label}
            </span>
        );
    };

    if (loading) return <div className="text-sm">Loading templates...</div>;

    const emojiList = getEmojiList();

    return (
        <div className="space-y-4">
            {/* Filter Tabs */}
            <div className="flex items-center gap-2 border-b pb-2">
                {(['all', 'workflow', 'other'] as FilterType[]).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={cn(
                            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                            filter === f
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted"
                        )}
                    >
                        {f === 'all' && 'All'}
                        {f === 'workflow' && 'Workflow'}
                        {f === 'other' && 'Other'}
                        <span className="ml-1.5 text-xs opacity-70">
                            ({templates.filter(t =>
                                f === 'all' ? true :
                                    f === 'workflow' ? !!t.template_type :
                                        !t.template_type
                            ).length})
                        </span>
                    </button>
                ))}
            </div>

            {/* Template List */}
            <div className="grid gap-3">
                {filteredTemplates.map((template) => (
                    <div
                        key={template.id}
                        className="flex items-start justify-between p-3 rounded-md border bg-card hover:bg-muted/50 transition-colors"
                    >
                        <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-medium text-sm">{template.name}</h4>
                                {getTypeBadge(template.template_type)}
                                {!template.is_active && <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">Disabled</span>}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2 max-w-md" dir="rtl">
                                {processEmojis(template.content_ar || template.content)}
                            </p>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(template)}>
                                <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500" onClick={() => handleDelete(template.id)}>
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full border-dashed" onClick={openNew}>
                        <Plus className="mr-2 h-3.5 w-3.5" /> New Template
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingTemplate?.id === 'new' ? 'New Template' : 'Edit Template'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {/* Name */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Template Name</label>
                            <Input
                                value={editingTemplate?.name || ''}
                                onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, name: e.target.value } : null)}
                                placeholder="e.g. Order Confirmation"
                            />
                        </div>

                        {/* Template Type */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Template Type</label>
                            <div className="flex gap-2">
                                {[
                                    { value: null, label: 'General' },
                                    { value: 'confirmation', label: t('templates.confirmation') },
                                    { value: 'reminder', label: t('templates.reminder') },
                                    { value: 'discount', label: t('templates.discount') },
                                ].map(opt => (
                                    <button
                                        key={opt.value || 'none'}
                                        onClick={() => setEditingTemplate(prev =>
                                            prev ? { ...prev, template_type: opt.value as any } : null
                                        )}
                                        className={cn(
                                            "px-3 py-1.5 text-sm rounded-md border transition-colors",
                                            editingTemplate?.template_type === opt.value
                                                ? "bg-primary text-primary-foreground border-primary"
                                                : "border-input hover:bg-muted"
                                        )}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Arabic Content */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium">Arabic Content</label>
                                <button
                                    onClick={() => {
                                        setActiveField('content_ar');
                                        setShowEmojiPicker(!showEmojiPicker);
                                    }}
                                    className={cn(
                                        "flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors",
                                        showEmojiPicker && activeField === 'content_ar'
                                            ? "bg-amber-100 text-amber-700"
                                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                                    )}
                                >
                                    <Smile className="w-3 h-3" />
                                    Emoji
                                </button>
                            </div>
                            <Textarea
                                ref={textareaArRef}
                                value={editingTemplate?.content_ar || ''}
                                onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, content_ar: e.target.value } : null)}
                                placeholder="*يا هلا ومرحبا {e:heart}*..."
                                className="min-h-[150px] font-arabic"
                                dir="rtl"
                            />

                            {/* Emoji Picker Dropdown */}
                            {showEmojiPicker && activeField === 'content_ar' && (
                                <div className="border rounded-lg p-3 bg-muted/50 space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground">Click to insert emoji shortcode:</p>
                                    <div className="flex flex-wrap gap-1">
                                        {emojiList.slice(0, 24).map(item => (
                                            <button
                                                key={item.shortcode}
                                                onClick={() => insertEmoji(item.shortcode)}
                                                className="w-8 h-8 flex items-center justify-center text-lg hover:bg-white rounded transition-colors"
                                                title={`{e:${item.shortcode}}`}
                                            >
                                                {item.emoji}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Preview */}
                        {editingTemplate?.content_ar && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">Preview</label>
                                <div className="p-3 rounded-lg bg-[#e5ddd5] border">
                                    <div className="bg-[#dcf8c6] rounded-lg p-3 max-w-[80%] ml-auto">
                                        <p className="text-sm whitespace-pre-wrap" dir="rtl">
                                            {processEmojis(editingTemplate.content_ar)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Variable Hints */}
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                            <p className="text-xs font-medium text-blue-800 mb-2">Available Variables:</p>
                            <div className="flex flex-wrap gap-1.5">
                                {['{customer_name}', '{order_id}', '{sequence_number}', '{product}', '{price}', '{address}', '{phone}'].map(v => (
                                    <code key={v} className="px-1.5 py-0.5 bg-white rounded text-xs text-blue-700 border border-blue-200">{v}</code>
                                ))}
                            </div>
                        </div>

                        <Button onClick={handleSave} className="w-full">Save Template</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
