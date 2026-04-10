import { cn } from "@scheniders/shared";
import { forwardRef, InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> { }

const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    "flex h-11 w-full rounded-xl border-2 border-white/10 bg-white/5 backdrop-blur-sm px-4 py-2 text-sm text-foreground",
                    "placeholder:text-zinc-500",
                    "focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 focus:shadow-xl focus:shadow-emerald-500/30 focus:bg-white/10",
                    "hover:border-white/20 hover:bg-white/10",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    "transition-all duration-300",
                    className
                )}
                ref={ref}
                {...props}
            />
        );
    }
);
Input.displayName = "Input";

export { Input };
