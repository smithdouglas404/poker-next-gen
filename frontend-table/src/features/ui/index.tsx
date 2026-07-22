"use client";

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

import { BTN_GOLD, BTN_GREEN, BTN_RED, GLASS_PANEL, GLASS_PANEL_HOVER, HEADING_SM, cn } from "./tokens";

// A small, dependency-free primitive layer giving the app a consistent
// GGPoker-grade look for buttons, panels, inputs, selects, and labeled fields.

type ButtonVariant = "primary" | "gold" | "green" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: BTN_RED,
  gold: BTN_GOLD,
  green: BTN_GREEN,
  outline: "border border-white/15 text-white hover:bg-white/5",
  ghost: "text-neutral-300 hover:bg-white/5 hover:text-white",
  danger: "border border-[#e01e2b]/40 text-[#ff9ba1] bg-[#e01e2b]/10 hover:bg-[#e01e2b]/20",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "gold", size = "md", className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold uppercase tracking-wide",
        "transition disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    />
  );
});

export function Panel({
  children,
  className,
  hover,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div className={cn(GLASS_PANEL, hover && "transition hover:border-white/20", className)}>
      {children}
    </div>
  );
}

export function SectionHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn(HEADING_SM, "text-amber-300/80", className)}>{children}</p>;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white",
          "placeholder:text-neutral-600 outline-none transition",
          "focus:border-cyan/40 focus:ring-2 focus:ring-cyan/10",
          className,
        )}
        {...rest}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white",
          "outline-none transition focus:border-cyan/40 focus:ring-2 focus:ring-cyan/10",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
        {label}
      </span>
      {children}
      {hint && <span className="block text-[10px] text-neutral-600">{hint}</span>}
    </label>
  );
}

export { cn } from "./tokens";
