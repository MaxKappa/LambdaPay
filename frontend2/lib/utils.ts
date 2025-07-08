import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Funzioni per gestire i centesimi
export function centsToAmount(cents: number): number {
  return cents / 100
}

export function amountToCents(amount: number): number {
  return Math.round(amount * 100)
}

export function formatCurrency(cents: number): string {
  const amount = centsToAmount(cents)
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

// Funzione per validare i centesimi
export function isValidCents(cents: number): boolean {
  return Number.isInteger(cents) && cents >= 0
}
