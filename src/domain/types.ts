export const insuranceTypes = ['רכב', 'דירה', 'חיים', 'בריאות', 'עסק', 'נסיעות', 'אחר'] as const
export const policyStatuses = ['פעילה', 'עומדת לחידוש', 'הסתיימה', 'בוטלה'] as const
export const taskStatuses = ['פתוחה', 'בטיפול', 'הושלמה'] as const
export const priorities = ['נמוכה', 'רגילה', 'גבוהה'] as const
export type InsuranceType = (typeof insuranceTypes)[number]
export type PolicyStatus = (typeof policyStatuses)[number]
export type TaskStatus = (typeof taskStatuses)[number]
export type Priority = (typeof priorities)[number]
export interface BaseRecord {
  id: string
  agency_id: string
  created_at: string
  updated_at: string
}
export interface Agency {
  id: string
  name: string
}
export interface Profile {
  id: string
  agency_id: string
  full_name: string
}
export interface Customer extends BaseRecord {
  first_name: string
  last_name: string
  identification_number: string
  phone: string
  email: string
  date_of_birth: string | null
  address: string
  notes: string
  archived_at: string | null
}
export interface Policy extends BaseRecord {
  customer_id: string
  insurance_company: string
  policy_number: string
  insurance_type: InsuranceType
  start_date: string
  end_date: string
  premium: number
  status: PolicyStatus
  notes: string
}
export interface Task extends BaseRecord {
  customer_id: string | null
  policy_id: string | null
  title: string
  description: string
  due_date: string
  priority: Priority
  status: TaskStatus
}
export interface DocumentRecord {
  id: string
  agency_id: string
  customer_id: string
  policy_id: string | null
  file_name: string
  file_path: string
  document_type: string
  uploaded_at: string
  uploaded_by: string
  file_size: number
  mime_type: string
}
export interface Activity {
  id: string
  agency_id: string
  customer_id: string | null
  user_id: string | null
  action_type: string
  description: string
  created_at: string
}
export interface Snapshot {
  customers: Customer[]
  policies: Policy[]
  tasks: Task[]
  documents: DocumentRecord[]
  activities: Activity[]
}
export type CustomerInput = Omit<Customer, keyof BaseRecord | 'archived_at'>
export type PolicyInput = Omit<Policy, keyof BaseRecord>
export type TaskInput = Omit<Task, keyof BaseRecord>
export interface Identity {
  profile: Profile
  agency: Agency
  email: string
}
export const fullName = (customer?: Customer) =>
  customer ? `${customer.first_name} ${customer.last_name}` : 'לקוח לא זמין'
