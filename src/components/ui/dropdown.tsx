"use client";

import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";

import { cn } from "@/lib/cn";

export const Dropdown = DropdownPrimitive.Root;
export const DropdownTrigger = DropdownPrimitive.Trigger;

export function DropdownContent({
  children,
  align = "end",
  className,
}: {
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        className={cn(
          "z-50 min-w-[190px] overflow-hidden rounded-[10px] border border-line bg-surface p-1 shadow-[0_16px_48px_-16px_rgba(0,0,0,0.45)]",
          className,
        )}
        sideOffset={6}
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  );
}

export function DropdownItem({
  children,
  onSelect,
  className,
  disabled,
}: {
  children: React.ReactNode;
  onSelect?: (event: Event) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-[13px] text-ink outline-none",
        "data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-45",
        className,
      )}
      disabled={disabled}
      onSelect={onSelect}
    >
      {children}
    </DropdownPrimitive.Item>
  );
}

export function DropdownSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-line" />;
}
