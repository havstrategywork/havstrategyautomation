"use client";

import * as React from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";
import { cn } from "@/lib/access/utils";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: "default" | "success" | "destructive";
}

interface ToastContextValue {
  toast: (input: Omit<ToastItem, "id">) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback((input: Omit<ToastItem, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev, { ...input, id }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg",
              item.variant === "success" && "border-success-border bg-success-bg",
              item.variant === "destructive" && "border-destructive-border bg-destructive-bg",
              item.variant === "default" && "border-border bg-background",
            )}
          >
            {item.variant === "success" ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : null}
            {item.variant === "destructive" ? <XCircle className="h-5 w-5 shrink-0 text-destructive" /> : null}
            <div className="flex-1 text-sm">
              <p className="font-medium text-foreground">{item.title}</p>
              {item.description ? <p className="mt-0.5 text-muted">{item.description}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((t) => t.id !== item.id))}
              className="text-muted hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
