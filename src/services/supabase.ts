import type { SupabaseClient } from '@supabase/supabase-js'
import type { Customer, DocumentRecord, Identity, Policy, Snapshot, Task } from '@/domain/types'
import { customerSchema, policySchema, taskSchema, validateFile } from '@/domain/validation'
import type { Repository } from './repository'
function fail(error: { message: string; code?: string } | null) {
  if (!error) return
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
    const query = id
      ? client.from(table).update(input).eq('id', id)
      : client.from(table).insert({ ...input, agency_id: agencyId })
    const { data, error } = await query.select().single()
    fail(error)
    if (!data) throw new Error('הרשומה אינה זמינה')
    return data as T
  }
  return {
    async load(): Promise<Snapshot> {
      const [customers, policies, tasks, documents, activities] = await Promise.all([
        all<Customer>(client, 'customers', 'created_at'),
        all<Policy>(client, 'policies', 'created_at'),
        all<Task>(client, 'tasks', 'created_at'),
        all<DocumentRecord>(client, 'documents', 'uploaded_at'),
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
      const id = crypto.randomUUID()
      const extensions: Record<string, string> = {
        'application/pdf': 'pdf',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      }
      const filePath = `${agencyId}/${customerId}/${id}.${extensions[file.type]}`
      const { error: uploadError } = await client.storage
        .from('customer-documents')
        .upload(filePath, file, { contentType: file.type, upsert: false })
      fail(uploadError)
      const { error } = await client.from('documents').insert({
        id,
        agency_id: agencyId,
        customer_id: customerId,
        policy_id: policyId,
        file_name: file.name,
        file_path: filePath,
        document_type: documentType.trim(),
        uploaded_by: identity.profile.id,
        file_size: file.size,
        mime_type: file.type,
      })
      if (error) {
        const { error: cleanupError } = await client.storage
          .from('customer-documents')
          .remove([filePath])
        if (cleanupError)
          throw new Error(
            'שמירת פרטי המסמך נכשלה. נותר קובץ באחסון; יש לפנות למנהל הסוכנות לניקוי.',
          )
        fail(error)
      }
    },
    async documentUrl(document, download = false) {
      const { data, error } = await client.storage
        .from('customer-documents')
        .createSignedUrl(document.file_path, 60, download ? { download: document.file_name } : {})
      fail(error)
      if (!data) throw new Error('לא ניתן לפתוח את המסמך')
      return data.signedUrl
    },
    async deleteDocument(document) {
      const { error: storageError } = await client.storage
        .from('customer-documents')
        .remove([document.file_path])
      fail(storageError)
      const { data, error } = await client
        .from('documents')
        .delete()
        .eq('id', document.id)
        .select('id')
      fail(error)
      if (!data?.length) throw new Error('הקובץ הוסר אך עדכון הרשומה נכשל. רעננו ונסו שוב.')
    },
  }
}
