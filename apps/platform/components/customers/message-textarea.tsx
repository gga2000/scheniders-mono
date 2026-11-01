import { forwardRef } from "react";
import { Textarea, type TextareaProps } from "@scheniders/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * The customers pages' one writing surface (a note, a WhatsApp message): the
 * shared Textarea on the same paper fill, border and focus ring as the search fields.
 */
export const MessageTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
    <Textarea
        ref={ref}
        className={cn(
            "rounded-xl bg-background border-(--card-border) p-3 placeholder:text-muted-foreground",
            "focus:ring-foreground/10 focus:border-(--card-border)",
            className,
        )}
        {...props}
    />
));
MessageTextarea.displayName = "MessageTextarea";
