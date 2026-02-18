"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    Phone,
    MapPin,
    Calendar,
    ShoppingBag,
    DollarSign,
    MessageCircle,
    Crown,
    Star,
    User,
    Tag,
    StickyNote,
    Plus,
    Edit2,
    Trash2,
    AlertTriangle,
    Cake,
    Save,
} from "lucide-react";
import { Customer } from "@/hooks/use-customers";
import { useCustomerNotes, useCustomerTagAssignments, useCustomerTags, useCustomerMetadata } from "@/hooks/use-customer-management";
import { CustomerTag, tagColorClasses, CustomerStatus } from "@/lib/customer-types";
import { formatIQD, formatDate, generateWhatsAppLink } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface CustomerDetailModalProps {
    customer: Customer | null;
    isOpen: boolean;
    onClose: () => void;
}

export function CustomerDetailModal({ customer, isOpen, onClose }: CustomerDetailModalProps) {
    const [activeTab, setActiveTab] = useState<"orders" | "notes" | "tags">("orders");
    const [newNote, setNewNote] = useState("");
    const [editingNote, setEditingNote] = useState<string | null>(null);
    const [editNoteText, setEditNoteText] = useState("");
    const [birthday, setBirthday] = useState("");
    const [manualStatus, setManualStatus] = useState<CustomerStatus | "">("");

    const { notes, addNote, updateNote, deleteNote } = useCustomerNotes(customer?.phone || "");
    const { tags: allTags } = useCustomerTags();
    const { assignments, assignTag, removeTag } = useCustomerTagAssignments(customer?.phone || "");
    const { metadata, updateMetadata } = useCustomerMetadata(customer?.phone || "");

    useEffect(() => {
        if (metadata) {
            setBirthday(metadata.birthday || "");
            setManualStatus(metadata.manual_status || "");
        } else {
            setBirthday("");
            setManualStatus("");
        }
    }, [metadata]);

    const handleAddNote = async () => {
        if (!newNote.trim()) return;
        await addNote(newNote);
        setNewNote("");
    };

    const handleUpdateNote = async (id: string) => {
        if (!editNoteText.trim()) return;
        await updateNote(id, editNoteText);
        setEditingNote(null);
        setEditNoteText("");
    };

    const handleSaveMetadata = async () => {
        await updateMetadata({
            birthday: birthday || undefined,
            manual_status: manualStatus as CustomerStatus || undefined,
        });
    };

    const getStatusIcon = (status: CustomerStatus) => {
        switch (status) {
            case "vip": return <Crown className="w-4 h-4" />;
            case "regular": return <Star className="w-4 h-4" />;
            default: return <User className="w-4 h-4" />;
        }
    };

    const getStatusColor = (status: CustomerStatus) => {
        switch (status) {
            case "vip": return "bg-amber-100 text-amber-800";
            case "regular": return "bg-green-100 text-green-800";
            default: return "bg-blue-100 text-blue-800";
        }
    };

    if (!customer || !isOpen) return null;

    const assignedTagIds = assignments.map((a) => a.tag_id);
    const availableTags = allTags.filter((t) => !assignedTagIds.includes(t.id));

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-hidden bg-[var(--card-bg)] rounded-3xl shadow-2xl mx-4"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-[var(--card-border)]">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-4">
                                <div className={cn(
                                    "w-14 h-14 rounded-2xl flex items-center justify-center",
                                    getStatusColor(customer.status)
                                )}>
                                    {getStatusIcon(customer.status)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold text-foreground">{customer.name}</h2>
                                        {customer.isBlacklisted && (
                                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3" />
                                                Blacklisted
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-muted mt-1">
                                        <span className="flex items-center gap-1 font-mono">
                                            <Phone className="w-3 h-3" />
                                            {customer.phone}
                                        </span>
                                        {customer.city && (
                                            <span className="flex items-center gap-1">
                                                <MapPin className="w-3 h-3" />
                                                {customer.city}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => window.open(generateWhatsAppLink(customer.phone, `مرحباً ${customer.name}`), "_blank")}
                                    className="p-2 rounded-xl bg-green-500 text-white hover:bg-green-600 transition-colors"
                                >
                                    <MessageCircle className="w-5 h-5" />
                                </button>
                                <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--background)] transition-colors">
                                    <X className="w-5 h-5 text-muted" />
                                </button>
                            </div>
                        </div>

                        {/* Stats Row */}
                        <div className="grid grid-cols-4 gap-3 mt-4">
                            <div className="p-3 bg-[var(--background)] rounded-xl text-center">
                                <p className="text-lg font-bold text-foreground">{customer.totalOrders}</p>
                                <p className="text-xs text-muted">Orders</p>
                            </div>
                            <div className="p-3 bg-[var(--background)] rounded-xl text-center">
                                <p className="text-lg font-bold text-foreground">{formatIQD(customer.totalSpent)}</p>
                                <p className="text-xs text-muted">Total Spent</p>
                            </div>
                            <div className="p-3 bg-[var(--background)] rounded-xl text-center">
                                <p className="text-sm font-medium text-foreground">{formatDate(customer.firstOrderDate)}</p>
                                <p className="text-xs text-muted">First Order</p>
                            </div>
                            <div className="p-3 bg-[var(--background)] rounded-xl text-center">
                                <p className="text-sm font-medium text-foreground">{formatDate(customer.lastOrderDate)}</p>
                                <p className="text-xs text-muted">Last Order</p>
                            </div>
                        </div>

                        {/* Customer Tags */}
                        {assignments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-4">
                                {assignments.map((a) => a.tag && (
                                    <span
                                        key={a.id}
                                        className={cn(
                                            "px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1",
                                            tagColorClasses[a.tag.color].bg,
                                            tagColorClasses[a.tag.color].text
                                        )}
                                    >
                                        <Tag className="w-3 h-3" />
                                        {a.tag.name}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-[var(--card-border)]">
                        {[
                            { id: "orders", label: "Orders", icon: ShoppingBag },
                            { id: "notes", label: "Notes", icon: StickyNote },
                            { id: "tags", label: "Tags & Info", icon: Tag },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
                                    activeTab === tab.id
                                        ? "text-foreground border-b-2 border-foreground"
                                        : "text-muted hover:text-foreground"
                                )}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="p-6 overflow-y-auto max-h-[400px]">
                        {activeTab === "orders" && (
                            <div className="space-y-3">
                                {customer.orders.slice(0, 10).map((order) => (
                                    <div key={order.id} className="p-4 bg-[var(--background)] rounded-xl">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-mono text-sm text-foreground">#{order.order_id}</span>
                                            <span className={cn(
                                                "px-2 py-0.5 rounded-full text-xs font-medium capitalize",
                                                order.status === "delivered" ? "bg-green-100 text-green-700" :
                                                    order.status === "rejected" ? "bg-red-100 text-red-700" :
                                                        "bg-yellow-100 text-yellow-700"
                                            )}>
                                                {order.status}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-muted">{formatDate(order.created_at)}</span>
                                            <span className="font-bold text-foreground">{formatIQD(order.price)}</span>
                                        </div>
                                        {order.items && order.items.length > 0 && (
                                            <div className="mt-2 text-xs text-muted">
                                                {order.items.map((item, i) => (
                                                    <span key={i}>
                                                        {item.quantity}x {item.name}
                                                        {i < order.items.length - 1 && ", "}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {customer.orders.length > 10 && (
                                    <p className="text-center text-sm text-muted py-2">
                                        +{customer.orders.length - 10} more orders
                                    </p>
                                )}
                            </div>
                        )}

                        {activeTab === "notes" && (
                            <div className="space-y-4">
                                {/* Add Note */}
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newNote}
                                        onChange={(e) => setNewNote(e.target.value)}
                                        placeholder="Add a note..."
                                        className="flex-1 px-4 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                        onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                                    />
                                    <button
                                        onClick={handleAddNote}
                                        disabled={!newNote.trim()}
                                        className="px-4 py-2 bg-[var(--ink)] text-white rounded-xl hover:opacity-90 disabled:opacity-50 transition-all"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Notes List */}
                                {notes.length === 0 ? (
                                    <p className="text-center text-muted py-8">No notes yet</p>
                                ) : (
                                    <div className="space-y-2">
                                        {notes.map((note) => (
                                            <div key={note.id} className="p-3 bg-[var(--background)] rounded-xl">
                                                {editingNote === note.id ? (
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            value={editNoteText}
                                                            onChange={(e) => setEditNoteText(e.target.value)}
                                                            className="flex-1 px-3 py-1 bg-white border border-[var(--card-border)] rounded-lg text-sm"
                                                        />
                                                        <button onClick={() => handleUpdateNote(note.id)} className="text-green-600">
                                                            <Save className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={() => setEditingNote(null)} className="text-muted">
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-start justify-between">
                                                        <div>
                                                            <p className="text-sm text-foreground">{note.note}</p>
                                                            <p className="text-xs text-muted mt-1">{formatDate(note.created_at)}</p>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={() => { setEditingNote(note.id); setEditNoteText(note.note); }}
                                                                className="p-1 text-muted hover:text-foreground"
                                                            >
                                                                <Edit2 className="w-3 h-3" />
                                                            </button>
                                                            <button
                                                                onClick={() => deleteNote(note.id)}
                                                                className="p-1 text-muted hover:text-red-600"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === "tags" && (
                            <div className="space-y-6">
                                {/* Tags */}
                                <div>
                                    <h4 className="text-sm font-semibold text-foreground mb-3">Tags</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {assignments.map((a) => a.tag && (
                                            <button
                                                key={a.id}
                                                onClick={() => removeTag(a.tag_id)}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1 hover:opacity-75 transition-opacity",
                                                    tagColorClasses[a.tag.color].bg,
                                                    tagColorClasses[a.tag.color].text
                                                )}
                                            >
                                                {a.tag.name}
                                                <X className="w-3 h-3" />
                                            </button>
                                        ))}
                                        {availableTags.map((tag) => (
                                            <button
                                                key={tag.id}
                                                onClick={() => assignTag(tag.id)}
                                                className="px-3 py-1.5 rounded-full text-sm font-medium border-2 border-dashed border-[var(--card-border)] text-muted hover:border-foreground hover:text-foreground transition-colors flex items-center gap-1"
                                            >
                                                <Plus className="w-3 h-3" />
                                                {tag.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Birthday & Status */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-1">
                                            <Cake className="w-4 h-4" />
                                            Birthday
                                        </label>
                                        <input
                                            type="date"
                                            value={birthday}
                                            onChange={(e) => setBirthday(e.target.value)}
                                            className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            Override Status
                                        </label>
                                        <select
                                            value={manualStatus}
                                            onChange={(e) => setManualStatus(e.target.value as CustomerStatus | "")}
                                            className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                        >
                                            <option value="">Auto (based on orders)</option>
                                            <option value="new">New</option>
                                            <option value="regular">Regular</option>
                                            <option value="vip">VIP</option>
                                        </select>
                                    </div>
                                </div>
                                <button
                                    onClick={handleSaveMetadata}
                                    className="w-full py-2 bg-[var(--ink)] text-white rounded-xl font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    Save Changes
                                </button>

                                {/* Favorite Products */}
                                {customer.favoriteProducts.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1">
                                            <ShoppingBag className="w-4 h-4" />
                                            Favorite Products
                                        </h4>
                                        <div className="space-y-2">
                                            {customer.favoriteProducts.slice(0, 5).map((product, i) => (
                                                <div key={i} className="flex items-center justify-between p-2 bg-[var(--background)] rounded-lg">
                                                    <span className="text-sm text-foreground">{product.name}</span>
                                                    <span className="text-xs text-muted">{product.count}x purchased</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
