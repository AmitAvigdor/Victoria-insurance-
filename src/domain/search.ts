import { fullName, type Customer, type Policy, type Snapshot } from './types'
const numericQuery = (query: string) =>
  /^[+\d\s()-]+$/.test(query) ? query.replace(/\D/g, '') : ''
export function matchesCustomer(customer: Customer, query: string) {
  const q = query.trim().toLocaleLowerCase()
  const digits = numericQuery(q)
  return [fullName(customer), customer.phone, customer.email, customer.identification_number].some(
    (value) =>
      value.toLocaleLowerCase().includes(q) ||
      (digits.length >= 3 && value.replace(/\D/g, '').includes(digits)),
  )
}
export function matchesPolicy(policy: Policy, query: string, data: Snapshot) {
  const q = query.trim().toLocaleLowerCase()
  const digits = numericQuery(q)
  return [
    policy.policy_number,
    policy.vehicle_registration || '',
    policy.insurance_company,
    policy.insurance_type,
    fullName(data.customers.find((c) => c.id === policy.customer_id)),
  ].some(
    (value) =>
      value.toLocaleLowerCase().includes(q) ||
      (digits.length >= 3 && value.replace(/\D/g, '').includes(digits)),
  )
}
