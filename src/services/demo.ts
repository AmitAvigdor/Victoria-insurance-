import { openDB } from 'idb'
import type {
  Customer,
  CustomerInput,
  Policy,
  PolicyInput,
  Snapshot,
  Task,
  TaskInput,
} from '@/domain/types'
import { customerSchema, policySchema, taskSchema, validateFile } from '@/domain/validation'
import { createDemoData, demoAgencyId, demoUserId } from './demo-seed'
import type { Repository } from './repository'
const database = () =>
  openDB('keshet-fictional-sandbox-v1', 1, {
    upgrade(db) {
      db.createObjectStore('data')
      db.createObjectStore('files')
    },
  })
async function read() {
  const db = await database()
  let data: Snapshot | undefined = await db.get('data', 'snapshot')
  if (!data) {
    data = createDemoData()
    await db.put('data', data, 'snapshot')
  }
  return data
}
async function mutate<T>(fn: (data: Snapshot) => T): Promise<T> {
  await read()
  const db = await database()
  const tx = db.transaction('data', 'readwrite')
  const data: Snapshot = await tx.store.get('snapshot')
  const result = fn(data)
  await tx.store.put(data, 'snapshot')
  await tx.done
  return result
}
function audit(s: Snapshot, customerId: string | null, action: string, description: string) {
  s.activities.unshift({
    id: crypto.randomUUID(),
    agency_id: demoAgencyId,
    customer_id: customerId,
    user_id: demoUserId,
    action_type: action,
    description,
    created_at: new Date().toISOString(),
  })
}
function base() {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), agency_id: demoAgencyId, created_at: now, updated_at: now }
}
function checkLinks(s: Snapshot, customerId: string | null, policyId: string | null = null) {
  if (customerId && !s.customers.some((c) => c.id === customerId))
    throw new Error('הלקוח אינו זמין')
  if (policyId && !s.policies.some((p) => p.id === policyId && p.customer_id === customerId))
    throw new Error('הפוליסה אינה שייכת ללקוח שנבחר')
}
export const demoRepository: Repository = {
  load: read,
  async saveCustomer(input: CustomerInput, id?: string) {
    const parsed = customerSchema.parse(input)
    return mutate((s) => {
      if (
        s.customers.some(
          (c) => c.identification_number === parsed.identification_number && c.id !== id,
        )
      )
        throw new Error('לקוח עם מספר הזהות הזה כבר קיים')
      const existing = s.customers.find((c) => c.id === id)
      if (id && !existing) throw new Error('הלקוח אינו זמין')
      const customer: Customer = {
        ...(existing || { ...base(), archived_at: null }),
        ...parsed,
        updated_at: new Date().toISOString(),
      }
      s.customers = id
        ? s.customers.map((c) => (c.id === id ? customer : c))
        : [customer, ...s.customers]
      audit(
        s,
        customer.id,
        id ? 'customer.updated' : 'customer.created',
        id ? 'פרטי הלקוח עודכנו' : 'נוצר כרטיס לקוח',
      )
      return customer
    })
  },
  async archiveCustomer(id, archived) {
    await mutate((s) => {
      const c = s.customers.find((c) => c.id === id)
      if (!c) throw new Error('הלקוח אינו זמין')
      c.archived_at = archived ? new Date().toISOString() : null
      c.updated_at = new Date().toISOString()
      audit(s, id, 'customer.updated', archived ? 'הלקוח הועבר לארכיון' : 'הלקוח שוחזר מהארכיון')
    })
  },
  async savePolicy(input: PolicyInput, id?: string) {
    const parsed = policySchema.parse(input)
    return mutate((s) => {
      checkLinks(s, parsed.customer_id)
      if (
        s.policies.some(
          (p) =>
            p.policy_number === parsed.policy_number &&
            p.insurance_company === parsed.insurance_company &&
            p.id !== id,
        )
      )
        throw new Error('מספר הפוליסה כבר קיים בחברה שנבחרה')
      const existing = s.policies.find((p) => p.id === id)
      if (id && !existing) throw new Error('הפוליסה אינה זמינה')
      if (existing && existing.customer_id !== parsed.customer_id)
        throw new Error('אין לשנות לקוח בפוליסה קיימת')
      const policy: Policy = {
        ...(existing || base()),
        ...parsed,
        updated_at: new Date().toISOString(),
      }
      s.policies = id ? s.policies.map((p) => (p.id === id ? policy : p)) : [policy, ...s.policies]
      audit(
        s,
        policy.customer_id,
        id ? 'policy.updated' : 'policy.created',
        `${id ? 'עודכנה' : 'נוצרה'} פוליסת ${policy.insurance_type} — ${policy.policy_number}`,
      )
      return policy
    })
  },
  async saveTask(input: TaskInput, id?: string) {
    const parsed = taskSchema.parse(input)
    return mutate((s) => {
      checkLinks(s, parsed.customer_id, parsed.policy_id)
      const existing = s.tasks.find((t) => t.id === id)
      if (id && !existing) throw new Error('המשימה אינה זמינה')
      const task: Task = {
        ...(existing || base()),
        ...parsed,
        updated_at: new Date().toISOString(),
      }
      s.tasks = id ? s.tasks.map((t) => (t.id === id ? task : t)) : [task, ...s.tasks]
      audit(
        s,
        task.customer_id,
        'task.updated',
        task.status === 'הושלמה'
          ? `הושלמה משימה: ${task.title}`
          : `${id ? 'עודכנה' : 'נוצרה'} משימה: ${task.title}`,
      )
      return task
    })
  },
  async uploadDocument(file, customerId, policyId, documentType) {
    validateFile(file)
    if (!documentType.trim() || documentType.length > 100)
      throw new Error('יש להזין סוג מסמך (עד 100 תווים)')
    const id = crypto.randomUUID()
    const db = await database()
    await db.put('files', file, id)
    try {
      await mutate((s) => {
        checkLinks(s, customerId, policyId)
        s.documents.unshift({
          id,
          agency_id: demoAgencyId,
          customer_id: customerId,
          policy_id: policyId,
          file_name: file.name,
          file_path: id,
          document_type: documentType,
          uploaded_at: new Date().toISOString(),
          uploaded_by: demoUserId,
          file_size: file.size,
          mime_type: file.type,
        })
        audit(s, customerId, 'document.created', `הועלה מסמך: ${file.name}`)
      })
    } catch (e) {
      await db.delete('files', id)
      throw e
    }
  },
  async documentUrl(document) {
    const db = await database()
    const file = await db.get('files', document.id)
    if (!file) throw new Error('הקובץ אינו זמין בסביבת ההדגמה')
    return URL.createObjectURL(file)
  },
  async deleteDocument(document) {
    const db = await database()
    await db.delete('files', document.id)
    await mutate((s) => {
      s.documents = s.documents.filter((d) => d.id !== document.id)
      audit(s, document.customer_id, 'document.deleted', `נמחק מסמך: ${document.file_name}`)
    })
  },
}
