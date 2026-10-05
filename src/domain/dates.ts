// Date-only arithmetic uses calendar days, independent of DST and the visitor's timezone.
export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
export function daysUntil(date: string, from = today()) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}
export function addDays(days: number, from = today()) {
  const date = new Date(`${from}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export const formatDate = (date: string) =>
  new Intl.DateTimeFormat('he-IL', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date.length === 10 ? `${date}T00:00:00Z` : date))
export const money = (value: number | null) =>
  value == null
    ? 'לא צוין'
    : new Intl.NumberFormat('he-IL', {
        style: 'currency',
        currency: 'ILS',
        maximumFractionDigits: 0,
      }).format(value)
