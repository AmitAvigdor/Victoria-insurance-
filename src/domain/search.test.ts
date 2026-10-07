import { expect, it } from 'vitest'
import { matchesCustomer, matchesPolicy } from './search'
import { createDemoData } from '@/services/demo-seed'
it('alphanumeric policy queries cannot match unrelated numeric vehicle registrations', () => {
  const snapshot = createDemoData()
  const policy = {
    ...snapshot.policies[0],
    policy_number: 'OTHER',
    vehicle_registration: '12-345-67',
  }
  expect(matchesPolicy(policy, 'ENHANCEMENT-123', snapshot)).toBe(false)
  expect(matchesPolicy(policy, '1234567', snapshot)).toBe(true)
  expect(matchesPolicy(policy, '12-345-67', snapshot)).toBe(true)
})
it('phone formatting normalizes numeric searches without extracting digits from names', () => {
  const customer = { ...createDemoData().customers[0], phone: '050-000-1234' }
  expect(matchesCustomer(customer, '0500001234')).toBe(true)
  expect(matchesCustomer(customer, 'CODE-1234')).toBe(false)
})
