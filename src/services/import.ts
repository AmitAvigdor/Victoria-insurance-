import { prepareImport, type ImportOptions, type ImportPlan } from '@/domain/import'
import type { Repository } from './repository'

export interface ImportResult {
  customers: number
  policies: number
  tasks: number
  rows: { rowNumber: number; status: string; detail: string }[]
}
export async function executeImport(
  repository: Repository,
  options: ImportOptions,
  reviewed: ImportPlan,
  onProgress: (done: number, total: number) => void,
  cancelled: () => boolean,
): Promise<ImportResult> {
  const snapshot = await repository.load()
  const fresh = prepareImport(options, snapshot)
  if (JSON.stringify(fresh) !== JSON.stringify(reviewed))
    throw new Error(
      'הנתונים במערכת השתנו מאז התצוגה המקדימה. חזרו להתאמת העמודות וצרו תצוגה מקדימה חדשה.',
    )
  if (fresh.errors.length) throw new Error(fresh.errors.join('; '))
  const result: ImportResult = { customers: 0, policies: 0, tasks: 0, rows: [] }
  const customerIds = new Map(snapshot.customers.map((c) => [c.identification_number, c.id]))
  for (const customer of snapshot.customers) {
    customerIds.set(`record:${customer.id}`, customer.id)
    if (customer.import_key) customerIds.set(`import:${customer.import_key}`, customer.id)
  }
  let stopped = false
  for (const [index, row] of fresh.rows.entries()) {
    if (row.action !== 'ready') {
      result.rows.push({
        rowNumber: row.rowNumber,
        status: 'דולג',
        detail: [...row.errors, ...row.warnings].join('; '),
      })
    } else if (stopped || cancelled()) {
      result.rows.push({
        rowNumber: row.rowNumber,
        status: 'לא בוצע',
        detail: 'הייבוא נעצר. ניתן לבדוק ולייבא שוב את אותו הקובץ.',
      })
    } else {
      const saved: string[] = []
      try {
        const customerKey = row.customerKey || row.identification
        let customerId = customerIds.get(customerKey)
        if (row.customer && !customerId) {
          const customer = await repository.saveCustomer(row.customer)
          customerId = customer.id
          customerIds.set(customerKey, customerId)
          result.customers++
          saved.push('לקוח')
        }
        if (!customerId) throw new Error('הלקוח לא נשמר; לא ניתן לשייך אליו נתונים')
        if (row.policy) {
          await repository.savePolicy({ ...row.policy, customer_id: customerId })
          result.policies++
          saved.push('פוליסה')
        }
        if (row.task) {
          await repository.saveTask({ ...row.task, customer_id: customerId, policy_id: null })
          result.tasks++
          saved.push('משימה')
        }
        result.rows.push({ rowNumber: row.rowNumber, status: 'נשמר', detail: saved.join(', ') })
      } catch (error) {
        stopped = true
        result.rows.push({
          rowNumber: row.rowNumber,
          status: 'שגיאה',
          detail: [
            saved.length ? `כבר נשמר: ${saved.join(', ')}` : '',
            error instanceof Error ? error.message : 'השמירה נכשלה',
            'הייבוא נעצר. אחרי בדיקת החיבור אפשר ליצור תצוגה מקדימה ולנסות שוב; רשומות קיימות ידולגו.',
          ]
            .filter(Boolean)
            .join('. '),
        })
      }
    }
    onProgress(index + 1, fresh.rows.length)
  }
  return result
}
