import { describe, expect, it } from 'vitest'
import { daysUntil, addDays } from './dates'
import { renewals, statistics } from './selectors'
import { createDemoData } from '../services/demo-seed'
import { customerSchema, policySchema, taskSchema } from './validation'
describe('calendar day calculations', () => {
  it('handles DST boundaries without off-by-one errors', () => {
    expect(daysUntil('2026-10-26', '2026-10-24')).toBe(2)
    expect(daysUntil('2026-03-28', '2026-03-26')).toBe(2)
    expect(daysUntil('2026-10-03', '2026-10-04')).toBe(-1)
  })
  it('adds dates over month/year boundaries', () =>
    expect(addDays(1, '2026-12-31')).toBe('2027-01-01'))
})
describe('renewal and dashboard rules', () => {
  it('includes boundary day but excludes cancellations and expired policies', () => {
    const data = createDemoData()
    const base = data.policies[0]
    const policies = [
      { ...base, end_date: addDays(0) },
      { ...base, end_date: addDays(30) },
      { ...base, end_date: addDays(31) },
      { ...base, end_date: addDays(-1) },
      { ...base, end_date: addDays(2), status: 'בוטלה' as const },
    ]
    expect(renewals(policies, 30)).toHaveLength(2)
    expect(renewals(policies, 'expired')).toHaveLength(1)
  })
  it('counts from live records and excludes archived/completed', () => {
    const data = createDemoData()
    const original = statistics(data)
    data.customers[0].archived_at = new Date().toISOString()
    data.tasks[0].status = 'הושלמה'
    const current = statistics(data)
    expect(current.customers).toBe(original.customers - 1)
    expect(current.tasks).toBe(original.tasks - 1)
  })
})
describe('input validation', () => {
  it('rejects impossible dates and reversed policy ranges', () => {
    const policy = createDemoData().policies[0]
    expect(policySchema.safeParse({ ...policy, start_date: '2026-02-30' }).success).toBe(false)
    expect(
      policySchema.safeParse({ ...policy, start_date: '2027-01-01', end_date: '2026-01-01' })
        .success,
    ).toBe(false)
  })
  it('rejects negative premiums and malformed IDs', () => {
    const data = createDemoData()
    expect(policySchema.safeParse({ ...data.policies[0], premium: -1 }).success).toBe(false)
    expect(
      customerSchema.safeParse({ ...data.customers[0], identification_number: '123' }).success,
    ).toBe(false)
  })
  it('requires a customer when task has policy', () => {
    const task = createDemoData().tasks[0]
    expect(taskSchema.safeParse({ ...task, customer_id: null }).success).toBe(false)
  })
})
