import { daysUntil, today } from './dates'
import type { Policy, Snapshot, Task } from './types'
export const isActive = (p: Policy) =>
  p.status !== 'בוטלה' && p.status !== 'הסתיימה' && p.start_date <= today() && p.end_date >= today()
export const renewalOpen = (p: Policy) =>
  p.status !== 'בוטלה' && p.renewal_stage !== 'חודש' && p.renewal_stage !== 'לא חודש'
export const isRenewable = renewalOpen
export const isOverdue = (t: Task) => t.status !== 'הושלמה' && t.due_date < today()
export const renewals = (policies: Policy[], window: number | 'expired') =>
  policies
    .filter(
      (p) =>
        isRenewable(p) &&
        (window === 'expired'
          ? daysUntil(p.end_date) < 0
          : daysUntil(p.end_date) >= 0 && daysUntil(p.end_date) <= window),
    )
    .sort((a, b) => a.end_date.localeCompare(b.end_date))
export const statistics = (s: Snapshot) => ({
  customers: s.customers.filter((c) => !c.archived_at).length,
  active: s.policies.filter(isActive).length,
  renewals: renewals(s.policies, 30).length,
  tasks: s.tasks.filter((t) => t.status !== 'הושלמה').length,
})
