import { customerSchema, policySchema, taskSchema } from './validation'
import {
  insuranceTypes,
  policyStatuses,
  taskStatuses,
  priorities,
  type CustomerInput,
  type PolicyInput,
  type Snapshot,
  type TaskInput,
} from './types'
import { MAX_IMPORT_ROWS, type ImportCell, type ImportSheet } from './import-workbook'

export type ImportMode = 'customers' | 'combined' | 'policies' | 'tasks'
export const importModes: Record<ImportMode, string> = {
  customers: 'לקוחות',
  combined: 'לקוחות ופוליסות באותה שורה',
  policies: 'פוליסות ללקוחות קיימים',
  tasks: 'משימות ללקוחות קיימים',
}
const customerFields = [
  ['first_name', 'שם פרטי', 'first name'],
  ['last_name', 'שם משפחה', 'last name'],
  ['full_name', 'שם מלא', 'שם לקוח', 'שם מבוטח', 'שם', 'full name'],
  ['phone', 'טלפון', 'נייד', 'טלפון נייד', 'מספר טלפון', 'mobile'],
  ['email', 'אימייל', 'דואל', 'דואר אלקטרוני', 'e-mail'],
  ['date_of_birth', 'תאריך לידה', 'לידה', 'birth date'],
  ['address', 'כתובת', 'כתובת מגורים'],
  ['notes', 'הערות לקוח', 'הערות'],
] as const
const policyFields = [
  ['insurance_company', 'חברת ביטוח', 'מבטח'],
  ['policy_number', 'מספר פוליסה', 'מס פוליסה', 'פוליסה'],
  ['insurance_type', 'סוג ביטוח', 'ענף'],
  ['start_date', 'תאריך התחלה', 'תחילת ביטוח', 'מתאריך'],
  ['end_date', 'תאריך סיום', 'סיום ביטוח', 'עד תאריך', 'תאריך חידוש'],
  ['premium', 'פרמיה שנתית', 'פרמיה', 'פרמיה שנתית (₪)'],
  ['policy_status', 'סטטוס פוליסה', 'סטטוס'],
  ['policy_notes', 'הערות פוליסה'],
] as const
const taskFields = [
  ['title', 'כותרת משימה', 'משימה', 'כותרת'],
  ['description', 'תיאור משימה', 'תיאור', 'הערות'],
  ['due_date', 'תאריך יעד'],
  ['priority', 'עדיפות'],
  ['task_status', 'סטטוס משימה', 'סטטוס'],
] as const
export function fieldsFor(mode: ImportMode): readonly (readonly string[])[] {
  return [
    ['identification_number', 'מספר זהות', 'תז', 'תעודת זהות', 'מספר תעודת זהות'],
    ...(mode === 'customers' || mode === 'combined' ? customerFields : []),
    ...(mode === 'policies' || mode === 'combined' ? policyFields : []),
    ...(mode === 'tasks' ? taskFields : []),
  ]
}
export type Mapping = Record<string, number>
const normalizeHeader = (value: string) => value.toLowerCase().replace(/[\s"'״׳_.\-:()]/g, '')
export function suggestMapping(headers: string[], mode: ImportMode): Mapping {
  const used = new Set<number>()
  const mapping: Mapping = {}
  for (const field of fieldsFor(mode)) {
    const aliases = field.map(normalizeHeader)
    const index = headers.findIndex((h, i) => !used.has(i) && aliases.includes(normalizeHeader(h)))
    if (index >= 0) {
      mapping[field[0]] = index
      used.add(index)
    }
  }
  return mapping
}
export function headersFor(sheet: ImportSheet, headerRow: number) {
  return sheet.rows[headerRow]?.map((cell, i) => cell.text.trim() || `עמודה ${i + 1}`) || []
}
export interface ImportOptions {
  sheet: ImportSheet
  headerRow: number
  mode: ImportMode
  mapping: Mapping
  keepExtra: boolean
}
export interface ImportRow {
  rowNumber: number
  identification: string
  name: string
  customer?: CustomerInput
  customerId?: string
  policy?: Omit<PolicyInput, 'customer_id'>
  task?: Omit<TaskInput, 'customer_id' | 'policy_id'>
  errors: string[]
  warnings: string[]
  action: 'ready' | 'skip' | 'error'
}
export interface ImportPlan {
  rows: ImportRow[]
  errors: string[]
}
const placeholderId = '11111111-1111-4111-8111-111111111111'
const blank: ImportCell = { text: '', value: '' }
const asText = (cell: ImportCell) => cell.text.trim()
export function importDate(cell: ImportCell): string {
  if (typeof cell.value === 'number') return cell.date || 'תאריך לא תקין'
  const text = asText(cell)
  const local = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  return local ? `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}` : text
}
export const policyKey = (p: { insurance_company: string; policy_number: string }) =>
  JSON.stringify([p.insurance_company, p.policy_number])
export const taskKey = (t: { customer_id: string | null; title: string; due_date: string }) =>
  JSON.stringify([t.customer_id, t.title, t.due_date])

export function importPremium(cell: ImportCell): number {
  const text = (typeof cell.value === 'number' ? String(cell.value) : cell.text).replace(
    /[₪\s]/g,
    '',
  )
  // A comma is accepted only as a thousands separator; never reinterpret a decimal comma.
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return NaN
  return Number(text.replaceAll(',', ''))
}

export function prepareImport(options: ImportOptions, snapshot: Snapshot): ImportPlan {
  const { sheet, headerRow, mapping, mode, keepExtra } = options
  const errors: string[] = []
  const selected = Object.values(mapping).filter((v) => v >= 0)
  if (new Set(selected).size !== selected.length) errors.push('אין לשייך עמודה אחת ליותר משדה אחד')
  if (mapping.identification_number == null) errors.push('יש לשייך עמודה למספר זהות')
  const sourceRows = sheet.rows.slice(headerRow + 1)
  if (sourceRows.length > MAX_IMPORT_ROWS) errors.push('עד 10,000 שורות נתונים בכל ייבוא')
  if (errors.length) return { rows: [], errors }
  const headers = headersFor(sheet, headerRow)
  const customers = new Map(snapshot.customers.map((c) => [c.identification_number, c]))
  const identificationById = new Map(snapshot.customers.map((c) => [c.id, c.identification_number]))
  const plannedCustomers = new Map<string, CustomerInput>()
  const policyOwners = new Map(
    snapshot.policies.map((p) => [policyKey(p), identificationById.get(p.customer_id)]),
  )
  const taskKeys = new Set(snapshot.tasks.map(taskKey))
  const labels = Object.fromEntries(fieldsFor(mode).map(([key, label]) => [key, label]))
  const rows: ImportRow[] = []
  sourceRows.forEach((cells, index) => {
    if (!cells.some((c) => c.text.trim() || c.error)) return
    const get = (key: string) => cells[mapping[key]] || blank
    const value = (key: string) => asText(get(key))
    const row: ImportRow = {
      rowNumber: headerRow + index + 2,
      identification: '',
      name: '',
      errors: [],
      warnings: [],
      action: 'ready',
    }
    const idCell = get('identification_number')
    const idText = (
      typeof idCell.value === 'number' ? String(idCell.value) : value('identification_number')
    ).replace(/[\s-]/g, '')
    row.identification = /^\d{1,9}$/.test(idText) ? idText.padStart(9, '0') : idText
    if (!/^\d{9}$/.test(row.identification))
      row.errors.push('מספר זהות: נדרשות עד 9 ספרות; אפסים מובילים יושלמו')
    if (idText !== row.identification) row.warnings.push('הושלמו אפסים מובילים במספר הזהות')
    const existing = customers.get(row.identification)
    const planned = plannedCustomers.get(row.identification)
    row.customerId = existing?.id
    row.name = existing ? `${existing.first_name} ${existing.last_name}` : ''
    if (existing?.archived_at) row.errors.push('הלקוח בארכיון; יש לשחזר אותו לפני הייבוא')
    const extra = keepExtra
      ? cells
          .flatMap((c, i) =>
            !selected.includes(i) && c.text.trim() ? [`${headers[i]}: ${c.text.trim()}`] : [],
          )
          .join('\n')
      : ''
    cells.forEach((cell, i) => {
      if (cell.error && (selected.includes(i) || keepExtra))
        row.errors.push(`עמודה ${headers[i]}: ${cell.error}`)
    })
    function addIssues(issues: { path: PropertyKey[]; message: string }[]) {
      issues.forEach((issue) => {
        const key = String(issue.path[0])
        const label = key === 'status' ? 'סטטוס' : labels[key] || key
        const messages: Record<string, string> = {
          insurance_type: `יש לבחור אחד מהסוגים: ${insuranceTypes.join(', ')}`,
          premium:
            'נדרשת פרמיה שנתית מספרית בין 0 ל־999999999, עד שתי ספרות אחרי הנקודה (למשל 1,250.50)',
          status: `יש לבחור: ${(mode === 'tasks' ? taskStatuses : policyStatuses).join(', ')}`,
          priority: `יש לבחור: ${priorities.join(', ')}`,
        }
        row.errors.push(`${label}: ${messages[key] || issue.message}`)
      })
    }
    if (mode === 'customers' || mode === 'combined') {
      const full = value('full_name').split(/\s+/)
      const first = value('first_name') || (mapping.full_name != null ? full[0] : '')
      const last = value('last_name') || (mapping.full_name != null ? full.slice(1).join(' ') : '')
      let phone = value('phone')
      if (typeof get('phone').value === 'number') phone = String(get('phone').value)
      if (/^[1-9]\d{7,8}$/.test(phone)) {
        phone = `0${phone}`
        row.warnings.push('הושלם אפס מוביל בטלפון — יש לבדוק בתצוגה המקדימה')
      }
      const customer = {
        first_name: first,
        last_name: last,
        identification_number: row.identification,
        phone,
        email: value('email').toLowerCase(),
        date_of_birth: value('date_of_birth') ? importDate(get('date_of_birth')) : null,
        address: value('address'),
        notes: [value('notes'), extra].filter(Boolean).join('\n'),
      }
      row.name = `${first} ${last}`.trim() || row.name
      if (existing) {
        row.warnings.push(
          'לקוח קיים: פרטי הלקוח וההערות מהשורה לא יישמרו; ניתן להוסיף לו פוליסה חדשה',
        )
      } else if (planned) {
        const conflicts = Object.entries(customer).filter(
          ([key, v]) => v && v !== planned[key as keyof CustomerInput],
        )
        if (conflicts.length)
          row.errors.push(
            `פרטי לקוח שונים בשורות עם אותו מספר זהות: ${conflicts.map(([k]) => labels[k]).join(', ')}`,
          )
        else row.warnings.push('הלקוח מופיע קודם בקובץ וייווצר פעם אחת')
      } else {
        const parsed = customerSchema.safeParse(customer)
        if (parsed.success) row.customer = parsed.data
        else addIssues(parsed.error.issues)
      }
    } else if (!existing) row.errors.push('לא נמצא לקוח עם מספר הזהות הזה. יש לייבא את הלקוח תחילה')
    const hasPolicy =
      mode === 'policies' || (mode === 'combined' && policyFields.some(([key]) => !!value(key)))
    if (hasPolicy) {
      const parsed = policySchema.safeParse({
        customer_id: placeholderId,
        insurance_company: value('insurance_company'),
        policy_number: value('policy_number'),
        insurance_type: value('insurance_type'),
        start_date: importDate(get('start_date')),
        end_date: importDate(get('end_date')),
        premium: importPremium(get('premium')),
        status: value('policy_status') || 'פעילה',
        notes: [value('policy_notes'), mode === 'policies' ? extra : ''].filter(Boolean).join('\n'),
      })
      if (!parsed.success) addIssues(parsed.error.issues)
      else {
        const key = policyKey(parsed.data)
        if (policyOwners.has(key)) {
          if (policyOwners.get(key) !== row.identification)
            row.errors.push('מספר הפוליסה בחברה הזו כבר שייך ללקוח אחר')
          else row.warnings.push('פוליסה קיימת או כפולה בקובץ: נתוני הפוליסה מהשורה לא יישמרו')
        } else {
          const { customer_id, ...policy } = parsed.data
          void customer_id
          row.policy = policy
        }
      }
    }
    if (mode === 'tasks') {
      const parsed = taskSchema.safeParse({
        customer_id: existing?.id || placeholderId,
        policy_id: null,
        title: value('title'),
        description: [value('description'), extra].filter(Boolean).join('\n'),
        due_date: importDate(get('due_date')),
        priority: value('priority') || 'רגילה',
        status: value('task_status') || 'פתוחה',
      })
      if (!parsed.success) addIssues(parsed.error.issues)
      else if (taskKeys.has(taskKey(parsed.data)))
        row.warnings.push('משימה באותה כותרת ותאריך כבר קיימת ללקוח; השורה לא תיובא')
      else {
        const { customer_id, policy_id, ...task } = parsed.data
        void customer_id
        void policy_id
        row.task = task
      }
    }
    row.action = row.errors.length
      ? 'error'
      : row.customer || row.policy || row.task
        ? 'ready'
        : 'skip'
    // Only valid rows can reserve identities for subsequent rows.
    if (row.action === 'ready') {
      if (row.customer) plannedCustomers.set(row.identification, row.customer)
      if (row.policy) policyOwners.set(policyKey(row.policy), row.identification)
      if (row.task) taskKeys.add(taskKey({ ...row.task, customer_id: row.customerId || null }))
    }
    rows.push(row)
  })
  if (!rows.length) errors.push('לא נמצאו שורות נתונים אחרי שורת הכותרות')
  return { rows, errors }
}
