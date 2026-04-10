import { type VariantProps, cva } from "class-variance-authority";
import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@scheniders/shared";

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:scale-105 active:scale-95 relative overflow-hidden",
    {
        variants: {
            variant: {
                primary:
                    "bg-gradient-to-r from-[#10b981] via-[#0ea572] to-[#06d6a0] text-white shadow-xl shadow-emerald-500/40 hover:shadow-2xl hover:shadow-emerald-500/60 before:absolute before:inset-0 before:bg-gradient-to-r before:from-white/0 before:via-white/20 before:to-white/0 before:translate-x-[-100%] hover:before:translate-x-[100%] before:transition-transform before:duration-700",
                destructive:
                    "bg-gradient-to-r from-[#ff006e] via-[#fb5891] to-[#fb6f92] text-white shadow-xl shadow-pink-500/40 hover:shadow-2xl hover:shadow-pink-500/60 before:absolute before:inset-0 before:bg-gradient-to-r before:from-white/0 before:via-white/20 before:to-white/0 before:translate-x-[-100%] hover:before:translate-x-[100%] before:transition-transform before:duration-700",
                financial:
                    "bg-gradient-to-r from-[#ffd60a] via-[#ffdc3a] to-[#ffc300] text-black shadow-xl shadow-yellow-500/40 hover:shadow-2xl hover:shadow-yellow-500/60 before:absolute before:inset-0 before:bg-gradient-to-r before:from-white/0 before:via-white/40 before:to-white/0 before:translate-x-[-100%] hover:before:translate-x-[100%] before:transition-transform before:duration-700",
                outline:
                    "border-2 border-white/10 bg-transparent hover:bg-white/5 hover:border-emerald-500/60 backdrop-blur-sm",
                ghost:
                    "hover:bg-white/5 hover:text-foreground backdrop-blur-sm",
                link: "text-primary underline-offset-4 hover:underline",
            },
            size: {
                sm: "h-9 px-4 text-sm",
                md: "h-11 px-6 text-sm",
                lg: "h-13 px-8 text-base",
                icon: "h-11 w-11",
            },
        },
        defaultVariants: {
            variant: "primary",
            size: "md",
        },
    }
);

export interface ButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, isLoading, children, disabled, ...props }, ref) => {
        return (
            <button
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                disabled={disabled || isLoading}
                {...props}
            >
                {isLoading && (
                    <svg
                        className="animate-spin h-5 w-5"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                )}
                {children}
            </button>
        );
    }
);

Button.displayName = "Button";

export { Button, buttonVariants };
