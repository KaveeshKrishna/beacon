"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/cn";

type Toast = {
  id: number;
  title: string;
  description?: string;
  tone: "default" | "success" | "danger";
};

type ToastInput = Omit<Toast, "id">;

const ToastContext = createContext<{
  push: (toast: ToastInput) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((toast: ToastInput) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-[min(360px,calc(100vw-40px))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} onDismiss={dismiss} toast={toast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), 5000);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-[10px] border bg-surface p-3.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)]",
        toast.tone === "success" && "border-positive/30",
        toast.tone === "danger" && "border-danger/30",
        toast.tone === "default" && "border-line",
      )}
      role="status"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-5">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-[12px] leading-4 text-muted">
            {toast.description}
          </p>
        ) : null}
      </div>
      <button
        aria-label="Dismiss"
        className="-mr-1 -mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-faint hover:bg-surface-2 hover:text-ink"
        onClick={() => onDismiss(toast.id)}
        type="button"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
