import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
/** Merge shadcn utility classes while allowing local overrides. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
