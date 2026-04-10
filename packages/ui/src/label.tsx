import { cn } from "@scheniders/shared";
import { forwardRef, LabelHTMLAttributes } from "react";

const Label = forwardRef<
    HTMLLabelElement,
    LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
    <label
        ref={ref}
        className={cn(
            "text-sm font-medium text-zinc-300 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
            className
        )}
        {...props}
    />
));
Label.displayName = "Label";

export { Label };
