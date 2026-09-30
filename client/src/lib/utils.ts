import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtMoney(n: number | string | null | undefined): string {
  return `$${Number(n || 0).toFixed(2)}`
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function esc(s: string | null | undefined): string {
  return String(s ?? '')
}

export const isImg = (val: string | null | undefined): boolean => {
  if (!val) return false
  const s = String(val).trim()
  return Boolean(
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('//') ||
    s.startsWith('/') ||
    s.startsWith('./') ||
    s.startsWith('../') ||
    s.startsWith('data:') ||
    s.startsWith('blob:') ||
    /\.(png|jpe?g|svg|webp|gif|avif|bmp|ico)($|\?)/i.test(s)
  )
}

export const getImageUrl = (val: string | null | undefined, fallback = ''): string => {
  if (!val || !isImg(val)) return fallback
  return String(val).trim()
}
