import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <label className="label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-[12px] leading-4 text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("field", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("field min-h-[88px] resize-y", className)} {...props} />;
}

export function FormMessage({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "success" | "info";
  children: ReactNode;
}) {
  const styles = {
    danger: "border-danger/25 bg-danger/10 text-danger",
    success: "border-positive/25 bg-positive/10 text-positive",
    info: "border-info/25 bg-info/10 text-info",
  };
  return (
    <div
      className={cn(
        "rounded-[9px] border px-3 py-2.5 text-[12.5px] leading-5",
        styles[tone],
      )}
      role={tone === "danger" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
