"use client";

import { useToast } from "@/hooks/use-toast";
import { Bell, CheckCircle2, AlertCircle, AlertTriangle, Info, Clock, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export function NotificationCenter() {
    const { inbox } = useToast();
    const unreadCount = inbox.length; // Simplified for now, could be tracked explicitly

    const getIcon = (variant: string = "default") => {
        switch (variant) {
            case "success": return <CheckCircle2 className="w-4 h-4 text-[#2D8A56]" />;
            case "error": return <AlertCircle className="w-4 h-4 text-[#C94058]" />;
            case "warning": return <AlertTriangle className="w-4 h-4 text-[#B8860B]" />;
            case "loading": return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
            default: return <Info className="w-4 h-4 text-[#5B8DEF]" />;
        }
    };

    const getBgColor = (variant: string = "default") => {
        switch (variant) {
            case "success": return "bg-[#ECFCCB]/30 border-[#C0EBA6]/30";
            case "error": return "bg-[#FFF1F2]/30 border-[#F4C7CF]/30";
            case "warning": return "bg-[#FFFBEB]/30 border-[#FBE38E]/30";
            case "loading": return "bg-blue-50/30 border-blue-200/30";
            default: return "bg-[#EFF6FF]/30 border-[#A6C8FF]/30";
        }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button className="relative w-[34px] h-[34px] flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all border border-transparent hover:border-white/10">
                    <Bell className="w-4 h-4" />
                    {unreadCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]" />
                    )}
                </button>
            </PopoverTrigger>

            <PopoverContent
                className="w-[340px] p-0 rounded-2xl border-white/10 bg-[#1E1E1E]/95 backdrop-blur-xl shadow-2xl overflow-hidden mr-4"
                align="start"
                side="right"
                sideOffset={15}
            >
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                            Notifications
                            <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] text-zinc-300">
                                {inbox.length}
                            </span>
                        </h3>
                        <p className="text-xs text-zinc-500 mt-0.5">Your recent system activity</p>
                    </div>
                </div>

                <div className="max-h-[400px] overflow-y-auto w-full flex flex-col custom-scrollbar">
                    {inbox.length === 0 ? (
                        <div className="py-12 px-4 flex flex-col items-center justify-center text-center">
                            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                                <Bell className="w-5 h-5 text-zinc-600" />
                            </div>
                            <p className="text-sm font-medium text-zinc-400">All caught up</p>
                            <p className="text-xs text-zinc-600 mt-1">No recent notifications</p>
                        </div>
                    ) : (
                        inbox.map((toast, i) => (
                            <div
                                key={`${toast.id}-${i}`}
                                className={cn(
                                    "p-4 flex gap-3 border-b border-white/5 hover:bg-white/[0.02] transition-colors relative group",
                                    i === 0 && "bg-white/[0.03]"
                                )}
                            >
                                <div className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border",
                                    getBgColor(toast.variant)
                                )}>
                                    {getIcon(toast.variant)}
                                </div>
                                <div className="flex-1 min-w-0 pt-0.5">
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <p className="text-sm font-medium text-white truncate pr-2">
                                            {toast.title}
                                            {toast.count && toast.count > 1 && (
                                                <span className="ml-2 text-xs font-normal text-zinc-500">
                                                    (x{toast.count})
                                                </span>
                                            )}
                                        </p>
                                        <span className="text-[10px] text-zinc-500 flex items-center flex-shrink-0">
                                            <Clock className="w-3 h-3 mr-1 opacity-50" />
                                            Just now
                                        </span>
                                    </div>
                                    {toast.description && (
                                        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                                            {toast.description}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
