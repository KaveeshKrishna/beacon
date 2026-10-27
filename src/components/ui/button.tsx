import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "soft";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink hover:bg-accent-hover border border-transparent shadow-[0_1px_0_rgba(255,255,255,0.12)_inset]",
  secondary:
    "bg-surface text-ink border border-line-strong hover:bg-surface-2",
  ghost:
    "bg-transparent text-muted border border-transparent hover:bg-surface-2 hover:text-ink",
  danger:
    "bg-danger text-white border border-transparent hover:brightness-110",
  soft: "bg-accent/10 text-accent border border-accent/20 hover:bg-accent/15",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[7px]",
  md: "h-10 px-4 text-sm gap-2 rounded-[9px]",
  lg: "h-11 px-5 text-sm gap-2 rounded-[10px]",
  icon: "h-9 w-9 rounded-[8px] justify-center",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(
    "inline-flex select-none items-center justify-center font-medium tracking-[-0.01em] transition-colors duration-150",
    "disabled:pointer-events-none disabled:opacity-45",
    variants[variant],
    sizes[size],
    className,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
