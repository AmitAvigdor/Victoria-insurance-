import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'הפעולה לא הושלמה. נסו שוב.'
}
