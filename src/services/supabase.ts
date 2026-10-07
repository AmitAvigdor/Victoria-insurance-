import type { SupabaseClient } from '@supabase/supabase-js'
import type { Customer, DocumentRecord, Identity, Policy, Snapshot, Task } from '@/domain/types'
import {
  customerSchema,
  policySchema,
  taskSchema,
  validateFile,
  renewalSchema,
} from '@/domain/validation'
import type { Repository } from './repository'
function fail(error: { message: string; code?: string } | null) {
  if (!error) return
  if (error.code === 'PT409')
    throw new Error('הרשומה השתנתה. רעננו את הנתונים ובדקו שוב לפני השמירה')
  if (error.code === '23505')
    throw new Error('רשומה עם אותו מספר זהות, מספר פוליסה או שורת ייבוא כבר קיימת')
  if (error.code === '42501') throw new Error('אין הרשאה לפעולה זו. בדקו את שיוך המשתמש לסוכנות')
  if (error.code === '23503')
    throw new Error('לא ניתן לשמור: הרשומה המקושרת אינה זמינה או אינה שייכת לאותו לקוח')
  throw new Error('לא ניתן להשלים את הבקשה. בדקו את החיבור ונסו שוב.')
}
async function all<T>(client: SupabaseClient, table: string, order: string): Promise<T[]> {
  const rows: T[] = []
  const batch = 500
  for (let from = 0; ; from += batch) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .order(order, { ascending: false })
      .order('id')
      .range(from, from + batch - 1)
    fail(error)
    rows.push(...((data || []) as T[]))
    if (!data || data.length < batch) break
  }
  return rows
}
export function supabaseRepository(client: SupabaseClient, identity: Identity): Repository {
  const agencyId = identity.profile.agency_id
  const save = async <T>(table: string, input: object, id?: string): Promise<T> => {
    if (identity.profile.role === 'viewer') throw new Error('החשבון מוגדר לצפייה בלבד')
    const query = id
      ? client.from(table).update(input).eq('id', id)
      : client.from(table).insert({ ...input, agency_id: agencyId })
    const { data, error } = await query.select().single()
    fail(error)
    if (!data) throw new Error('הרשומה אינה זמינה')
    return data as T
  }
  return {
    async saveRenewal(policy, input) {
      const parsed = renewalSchema.parse(input)
      const { error } = await client
        .rpc('save_renewal', {
          policy_id: policy.id,
          expected_updated_at: policy.updated_at,
          stage: parsed.stage,
          follow_up: parsed.follow_up,
          note: parsed.note,
        })
        .abortSignal(AbortSignal.timeout(20000))
      fail(error)
    },
    async addContactNote(customerId, note) {
      const { error } = await client
        .rpc('add_contact_note', { customer_id: customerId, note })
        .abortSignal(AbortSignal.timeout(20000))
      fail(error)
    },
    async applyImportUpdates(updates) {
      const { error } = await client
        .rpc('apply_import_updates', { updates })
        .abortSignal(AbortSignal.timeout(20000))
      fail(error)
    },
    async load(): Promise<Snapshot> {
      const [customers, policies, tasks, documents, activities] = await Promise.all([
        all<Customer>(client, 'customers', 'created_at'),
        all<Policy>(client, 'policies', 'created_at'),
        all<Task>(client, 'tasks', 'created_at'),
        all<DocumentRecord>(client, 'documents', 'uploaded_at').then((rows) =>
          rows.filter((row) => !row.deleted_at),
        ),
        all<Snapshot['activities'][number]>(client, 'activities', 'created_at'),
      ])
      return { customers, policies, tasks, documents, activities }
    },
    saveCustomer: (input, id) => save<Customer>('customers', customerSchema.parse(input), id),
    async archiveCustomer(id, archived) {
      await save<Customer>(
        'customers',
        { archived_at: archived ? new Date().toISOString() : null },
        id,
      )
    },
    savePolicy: (input, id) => save<Policy>('policies', policySchema.parse(input), id),
    saveTask: (input, id) => save<Task>('tasks', taskSchema.parse(input), id),
    async uploadDocument(file, customerId, policyId, documentType) {
      validateFile(file)
      if (!documentType.trim() || documentType.length > 100)
        throw new Error('יש להזין סוג מסמך (עד 100 תווים)')
      const form = new FormData()
      form.set('file', file)
      form.set('customer_id', customerId)
      form.set('policy_id', policyId || '')
      form.set('document_type', documentType)
      const { data, error } = await client.functions.invoke('documents', { body: form })
      if (error || data?.error)
        throw new Error(data?.error || 'העלאת המסמך נכשלה. בדקו הרשאות, סוג קובץ וחיבור.')
    },
    async documentUrl(document, download = false) {
      const { data, error } = await client.functions.invoke('documents', {
        body: {
          document_id: document.id,
          download,
          accept_unscanned: document.scan_status === 'unscanned',
        },
      })
      if (error || !data?.url)
        throw new Error(data?.error || 'המסמך טרם אושר בסריקת אבטחה או שאינו זמין')
      return data.url
    },
    async deleteDocument(document) {
      const { error } = await client.rpc('archive_document', {
        document_id: document.id,
        archived: true,
      })
      fail(error)
    },
  }
}
