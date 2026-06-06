import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Capitalize the first letter of each whitespace-separated word.
 * Preserves separators (spaces, hyphens, slashes) and leaves non-letter
 * tokens untouched. Safe for null/undefined.
 */
export function titleCase(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .toLowerCase()
    .replace(/([^\s\-/]+)/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}
