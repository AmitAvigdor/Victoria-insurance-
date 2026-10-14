import { customerSchema, policySchema, taskSchema } from './validation'
import {
  insuranceTypes,
  policyStatuses,
  taskStatuses,
  priorities,
  type ReviewedUpdate,
  type CustomerInput,
  type PolicyInput,
  type Snapshot,
  type TaskInput,
} from './types'
import { MAX_IMPORT_ROWS, type ImportCell, type ImportSheet } from './import-workbook'
import { today } from './dates'
import { fullName } from './types'

export type ImportMode = 'customers' | 'combined' | 'policies' | 'tasks' | 'vehicles' | 'report'
export const importModes: Record<ImportMode, string> = {
  report: 'דוח לקוחות ופוליסות — גם עם פרטים חסרים',
  vehicles: 'ביטוחי רכב — מבוטח, חובה, מקיף ורישוי',
  customers: 'לקוחות',
  combined: 'לקוחות ופוליסות באותה שורה',
  policies: 'פוליסות ללקוחות קיימים',
  tasks: 'משימות ללקוחות קיימים',
}
const customerFields = [
  ['first_name', 'שם פרטי', 'first name'],
  ['last_name', 'שם משפחה', 'last name'],
  ['full_name', 'שם מלא', 'שם לקוח', 'שם מבוטח', 'שם המבוטח', 'שם', 'full name'],
  ['phone', 'טלפון', 'נייד', 'טלפון נייד', 'מספר טלפון', 'mobile'],
  ['email', 'אימייל', 'דואל', 'דואר אלקטרוני', 'e-mail'],
  ['date_of_birth', 'תאריך לידה', 'לידה', 'birth date'],
  ['address', 'כתובת', 'כתובת מגורים'],
  ['notes', 'הערות לקוח', 'הערות'],
] as const
const policyFields = [
  ['insurance_company', 'חברת ביטוח', 'חברת הביטוח', 'מבטח', 'חברה מבטחת'],
  ['policy_number', 'מספר פוליסה', 'מס פוליסה', 'פוליסה'],
  ['insurance_type', 'סוג ביטוח', 'ענף'],
  ['start_date', 'תאריך התחלה', 'תחילת ביטוח', 'תחילת הביטוח', 'מתאריך'],
  ['end_date', 'תאריך סיום', 'סיום ביטוח', 'סיום הביטוח', 'עד תאריך', 'תאריך חידוש'],
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
const vehicleFields = [
  customerFields[2],
  policyFields[0],
  policyFields[3],
  policyFields[4],
  ['compulsory_value', 'חובה', 'ביטוח חובה'],
  ['comprehensive_value', 'מקיף', 'ביטוח מקיף'],
  ['vehicle_registration', 'מספר רישוי', "מס' רישוי", 'מס רישוי', 'מספר רכב', 'מס רכב'],
  ['commission', 'עמלה'],
  ['policy_notes', 'הערות', 'הערות פוליסה'],
] as const
const reportFields = [
  ['identification_number', 'מספר זהות', 'תז', 'תעודת זהות'],
  ...customerFields,
  [
    'last_first_name',
    'שם משפחה ופרטי בדוח',
    'שם משפחה ושם פרטי (כפי שמופיע בנושא)',
    'שם לקוח (משפחה פרטי)',
  ],
  ...policyFields.filter(([key]) => key !== 'premium' && key !== 'policy_notes'),
  ['premium', 'פרמיה לתשלום', 'פרמיה', 'פרמיה שנתית', 'פרמיה שנתית (₪)', 'סה"כ (מחושב מהשתיים)'],
  ['compulsory_value', 'פרמיה חובה', 'חובה', 'ביטוח חובה'],
  ['comprehensive_value', 'פרמיה מקיף', 'מקיף', 'ביטוח מקיף'],
  ['vehicle_registration', 'מספר רישוי', "מס' רישוי", 'מספר רכב'],
  ['commission', 'עמלה'],
  ['policy_notes', 'הערות / לבדיקה', 'הערות פוליסה'],
] as const
export function fieldsFor(mode: ImportMode): readonly (readonly string[])[] {
  if (mode === 'report') return reportFields
  if (mode === 'vehicles') return vehicleFields
  return [
    ['identification_number', 'מספר זהות', 'תז', 'תעודת זהות', 'מספר תעודת זהות'],
    ...(mode === 'customers' || mode === 'combined' ? customerFields : []),
    ...(mode === 'policies' || mode === 'combined' ? policyFields : []),
    ...(mode === 'tasks' ? taskFields : []),
  ]
}
export type Mapping = Record<string, number>
const normalizeHeader = (value: string) =>
  value
    .toLowerCase()
    .replace(/&#(?:x0*a0|160);|&nbsp;/gi, '')
    .replace(/[\s"'״׳_.\-:()\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
export function detectImportMode(
  headers: string[],
  fallback: ImportMode = 'customers',
): ImportMode {
  const report = suggestMapping(headers, 'report')
  if (
    report.last_first_name != null ||
    (headers.some((h) => normalizeHeader(h) === normalizeHeader('חברה מבטחת')) &&
      (report.full_name != null || (report.first_name != null && report.last_name != null)))
  )
    return 'report'
  const mapping = suggestMapping(headers, 'vehicles')
  return mapping.full_name != null &&
    mapping.vehicle_registration != null &&
    (mapping.compulsory_value != null || mapping.comprehensive_value != null)
    ? 'vehicles'
    : fallback
}
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
export function detectHeaderRow(sheet: ImportSheet): number {
  let best = 0,
    score = 0
  for (let i = 0; i < Math.min(100, sheet.rows.length); i++) {
    const headers = headersFor(sheet, i)
    const matches = Math.max(
      ...Object.keys(importModes).map(
        (mode) => Object.keys(suggestMapping(headers, mode as ImportMode)).length,
      ),
    )
    if (matches > score) {
      best = i
      score = matches
    }
  }
  return score
    ? best
    : Math.max(
        0,
        sheet.rows.findIndex((row) => row.some((cell) => cell.text.trim())),
      )
}
export interface ImportOptions {
  sheet: ImportSheet
  headerRow: number
  mode: ImportMode
  mapping: Mapping
  keepExtra: boolean
  vehicleLinks?: Record<number, string>
  updateExisting?: boolean
  selectedChanges?: Record<string, boolean>
  vehiclePolicyLinks?: Record<number, string>
  groupReportNames?: boolean
}
export interface ImportChange {
  key: string
  table: 'customers' | 'policies'
  id: string
  field: string
  before: unknown
  after: unknown
  updated_at: string
  selected: boolean
}
export interface ImportRow {
  changes?: ImportChange[]
  updates?: ReviewedUpdate[]
  policyCandidates?: { id: string; label: string }[]
  rowNumber: number
  identification: string
  name: string
  customer?: CustomerInput
  suggestedCustomerIds?: string[]
  existingPolicyId?: string
  customerId?: string
  customerKey?: string
  policy?: Omit<PolicyInput, 'customer_id'>
  task?: Omit<TaskInput, 'customer_id' | 'policy_id'>
  errors: string[]
  warnings: string[]
  action: 'ready' | 'skip' | 'error'
  sourceValues?: { label: string; value: string }[]
  reviewOnly?: boolean
  unassignedTask?: boolean
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

function prepareBaseImport(options: ImportOptions, snapshot: Snapshot): ImportPlan {
  if (options.mode === 'report') return prepareReportImport(options, snapshot)
  if (options.mode === 'vehicles') return prepareVehicleImport(options, snapshot)
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
      if (!value('policy_number'))
        row.errors.push(
          'מספר פוליסה: יש להזין מספר פוליסה, או לבחור במסלול ייבוא ביטוחי רכב ללא מספר פוליסה',
        )
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

function prepareReportImport(options: ImportOptions, snapshot: Snapshot): ImportPlan {
  const { sheet, headerRow, mapping, keepExtra, vehicleLinks = {} } = options
  const headers = headersFor(sheet, headerRow)
  const selected = Object.values(mapping)
  const errors: string[] = []
  if (new Set(selected).size !== selected.length) errors.push('אין לשייך עמודה אחת ליותר משדה אחד')
  if (mapping.full_name == null && mapping.first_name == null && mapping.last_first_name == null)
    errors.push('יש לשייך עמודה לשם הלקוח')
  if (sheet.rows.length - headerRow - 1 > MAX_IMPORT_ROWS)
    errors.push('עד 10,000 שורות נתונים בכל ייבוא')
  if (errors.length) return { rows: [], errors }
  const rows: ImportRow[] = []
  const byId = new Map(snapshot.customers.map((c) => [c.id, c]))
  const byIdentity = new Map(
    snapshot.customers
      .filter((c) => c.identification_number)
      .map((c) => [c.identification_number, c]),
  )
  const byImport = new Map(
    snapshot.customers.filter((c) => c.import_key).map((c) => [c.import_key!, c]),
  )
  const plannedCustomers = new Map<string, CustomerInput>()
  const plannedPolicies = new Map<string, string>()
  const plannedTasks = new Set<string>()
  const normalized = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase()
  const insuranceAliases: Record<string, (typeof insuranceTypes)[number]> = {
    'ביטוח רכב': 'רכב',
    'ביטוח נגרר (חובה בלבד)': 'רכב',
    'ביטוח דירה/מבנה': 'דירה',
    'ביטוח דירה': 'דירה',
    'ביטוח בריאות': 'בריאות',
    'ביטוח עסק': 'עסק',
    'ביטוח חיים': 'חיים',
    'ביטוח נסיעות': 'נסיעות',
    'אחריות מקצועית': 'אחר',
  }
  const hasPolicyColumns = [
    'insurance_company',
    'insurance_type',
    'policy_number',
    'start_date',
    'end_date',
    'vehicle_registration',
  ].some((key) => mapping[key] != null)
  sheet.rows.slice(headerRow + 1).forEach((cells, index) => {
    if (!cells.some((c) => c.text.trim() || c.error)) return
    const get = (key: string) => cells[mapping[key]] || blank
    const value = (key: string) => asText(get(key))
    const rowNumber = headerRow + index + 2
    const parts = (value('last_first_name') || value('full_name')).split(/\s+/)
    const first =
      value('first_name') ||
      (mapping.last_first_name != null ? parts.slice(1).join(' ') || parts[0] : parts[0])
    const last =
      value('last_name') ||
      (mapping.last_first_name != null && parts.length > 1
        ? parts[0]
        : mapping.full_name != null
          ? parts.slice(1).join(' ')
          : '')
    const name = `${first} ${last}`.trim()
    // The supplied reports use surname-first names. The source spelling stays in the notes.
    const canonicalName = normalized(`${last} ${first}`)
    const rawIdentity = value('identification_number').replace(/[\s-]/g, '')
    const identification = /^\d{1,9}$/.test(rawIdentity)
      ? rawIdentity.padStart(9, '0')
      : rawIdentity
    const start = value('start_date') ? importDate(get('start_date')) : ''
    const end = value('end_date') ? importDate(get('end_date')) : ''
    const company = value('insurance_company'),
      number = value('policy_number')
    const registration = value('vehicle_registration')
    const sourceType = value('insurance_type')
    const type = insuranceAliases[sourceType] || insuranceTypes.find((t) => t === sourceType)
    const cancellation = sourceType === 'ביטול' || value('policy_status') === 'בוטלה'
    const mailDate = cells.find((_, i) => /תאריך.*מייל/.test(headers[i]))?.text.trim() || ''
    // End dates, premiums and notes can be corrected without changing the row's identity.
    const rowKey = JSON.stringify([
      'report-row-v1',
      canonicalName,
      registration.replace(/[\s-]/g, ''),
      number,
      start || mailDate,
      sourceType,
    ])
    const policyImportKey = JSON.stringify([
      'report-policy-v1',
      canonicalName,
      normalized(company),
      registration.replace(/[\s-]/g, ''),
      number,
      start,
      sourceType,
    ])
    const customerImportKey = identification
      ? JSON.stringify(['report-identity-v1', identification])
      : options.groupReportNames || !hasPolicyColumns
        ? JSON.stringify(['report-name-v1', canonicalName])
        : rowKey
    const row: ImportRow = {
      rowNumber,
      identification,
      name,
      customerKey: identification || `import:${customerImportKey}`,
      errors: [],
      warnings: [],
      action: 'ready',
      suggestedCustomerIds: snapshot.customers
        .filter((c) => !c.archived_at && normalized(fullName(c)) === normalized(name))
        .map((c) => c.id),
      sourceValues: cells.flatMap((c, i) =>
        c.text.trim() || c.error ? [{ label: headers[i], value: c.text || c.error! }] : [],
      ),
    }
    const allSource = row.sourceValues!.map((c) => `${c.label}: ${c.value}`).join('\n')
    const notes = cells
      .flatMap((c, i) =>
        c.text.trim() && (keepExtra || selected.includes(i))
          ? [`${headers[i]}: ${c.text.trim()}`]
          : [],
      )
      .join('\n')
    if (identification && !/^\d{9}$/.test(identification)) row.errors.push('מספר זהות לא תקין')
    cells.forEach((cell, i) => {
      if (cell.error && (selected.includes(i) || keepExtra))
        row.errors.push(`${headers[i]}: ${cell.error}`)
    })
    if (mapping.last_first_name != null)
      row.warnings.push('השם בדוח הוא משפחה ואז פרטי. בדקו את הפיצול; השם המקורי יישמר בהערות.')
    const previousPolicy = snapshot.policies.find(
      (p) =>
        (number &&
          company &&
          policyKey(p) === policyKey({ insurance_company: company, policy_number: number })) ||
        p.import_key === policyImportKey,
    )
    row.existingPolicyId = previousPolicy?.id
    let existing = identification ? byIdentity.get(identification) : byImport.get(customerImportKey)
    if (previousPolicy) {
      const owner = byId.get(previousPolicy.customer_id)
      if (
        (existing && owner?.id !== existing.id) ||
        (identification && owner?.identification_number !== identification)
      )
        row.errors.push('הפוליסה כבר משויכת ללקוח אחר')
      else if (
        !existing &&
        owner &&
        first &&
        normalized(fullName(owner)) !== normalized(name) &&
        vehicleLinks[rowNumber] !== `record:${owner.id}`
      )
        row.errors.push('שם הלקוח אינו תואם לבעל הפוליסה הקיימת; יש לבדוק את השורה')
      else existing = owner
    }
    const choice = vehicleLinks[rowNumber] || ''
    if (choice.startsWith('record:')) {
      const chosen = byId.get(choice.slice(7))
      if (
        !chosen ||
        (existing && chosen.id !== existing.id) ||
        (identification && chosen.identification_number !== identification)
      )
        row.errors.push('שיוך הלקוח אינו תואם לרשומה הקיימת')
      else existing = chosen
    } else if (choice.startsWith('row:')) {
      const chosen = rows.find(
        (r) => r.rowNumber === Number(choice.slice(4)) && r.action !== 'error',
      )
      if (
        !chosen?.customerKey ||
        (existing && existing.id !== chosen.customerId) ||
        (identification && identification !== chosen.identification)
      )
        row.errors.push('שורת הלקוח שנבחרה אינה תואמת או אינה מוכנה לייבוא')
      else {
        row.customerKey = chosen.customerKey
        row.customerId = chosen.customerId
        if (!first) row.name = chosen.name
      }
    } else if (choice) row.errors.push('שיוך הלקוח אינו תקין')
    if (existing) {
      row.customerId = existing.id
      row.customerKey = `record:${existing.id}`
      row.identification = existing.identification_number
      if (!first) row.name = fullName(existing)
      if (existing.archived_at) row.errors.push('הלקוח בארכיון; יש לשחזר אותו לפני הייבוא')
      row.warnings.push(`ישויך ללקוח הקיים: ${fullName(existing)}`)
    } else if (
      !row.customerId &&
      !!first &&
      !plannedCustomers.has(row.customerKey!) &&
      !choice.startsWith('row:')
    ) {
      let phone = value('phone')
      if (typeof get('phone').value === 'number') phone = String(get('phone').value)
      if (/^[1-9]\d{7,8}$/.test(phone)) phone = `0${phone}`
      const parsed = customerSchema.safeParse({
        first_name: first,
        last_name: last,
        identification_number: identification,
        phone,
        email: value('email').toLowerCase(),
        date_of_birth: value('date_of_birth') ? importDate(get('date_of_birth')) : null,
        address: value('address'),
        notes,
        import_key: customerImportKey,
      })
      if (parsed.success) row.customer = parsed.data
      else row.errors.push(...parsed.error.issues.map((i) => `פרטי לקוח: ${i.message}`))
      if (!identification)
        row.warnings.push(
          'אין מספר זהות בדוח. בדקו אם הלקוח כבר קיים ובחרו שיוך במידת הצורך; אין איחוד אוטומטי לפי שם עם לקוחות קיימים.',
        )
    }
    const planned = plannedCustomers.get(row.customerKey!)
    const unassigned = !first && !row.customerId && !choice.startsWith('row:')
    if (unassigned) {
      row.customerKey = undefined
      row.unassignedTask = true
      row.warnings.push(
        'שם הלקוח חסר. תיווצר משימת בדיקה ללא שיוך ללקוח, עם כל פרטי השורה; אפשר לבחור לקוח קיים כאן.',
      )
    }
    if (planned && normalized(`${planned.first_name} ${planned.last_name}`) !== normalized(name))
      row.warnings.push('השורה תשויך ללקוח משורה קודמת לפי בחירתכם')
    const missing: string[] = []
    const policyPresent =
      hasPolicyColumns &&
      [
        'insurance_company',
        'insurance_type',
        'policy_number',
        'start_date',
        'end_date',
        'vehicle_registration',
      ].some((k) => !!value(k))
    if (policyPresent || unassigned) {
      if (unassigned) missing.push('שם הלקוח / שיוך ללקוח')
      if (!company) missing.push('חברה מבטחת')
      if (!start) missing.push('תאריך התחלה')
      if (!end) missing.push('תאריך סיום')
      if (!type) missing.push('סוג ביטוח מוכר')
      if (!number && !registration) missing.push('מספר פוליסה או מספר רישוי')
      const parsed = policySchema.safeParse({
        customer_id: placeholderId,
        insurance_company: company,
        policy_number: number,
        insurance_type: type,
        start_date: start,
        end_date: end,
        premium: value('premium') ? importPremium(get('premium')) : null,
        status: value('policy_status') || (end && end < today() ? 'הסתיימה' : 'פעילה'),
        vehicle_registration: registration,
        compulsory_value: value('compulsory_value'),
        comprehensive_value: value('comprehensive_value'),
        commission: value('commission'),
        notes,
        import_key: policyImportKey,
      })
      if (cancellation || missing.length || !parsed.success) {
        row.reviewOnly = true
        const reasons = cancellation
          ? ['רשומת ביטול בדוח — יש לבדוק את הפוליסה לפני שינוי במערכת']
          : [
              ...missing,
              ...(parsed.success
                ? []
                : parsed.error.issues
                    .filter(
                      (i) =>
                        !missing.length ||
                        !['insurance_company', 'insurance_type', 'start_date', 'end_date'].includes(
                          String(i.path[0]),
                        ),
                    )
                    .map((i) => i.message)),
            ]
        row.warnings.push(`תיווצר משימה לבדיקה ולהשלמה, ללא יצירת פוליסה: ${reasons.join(', ')}`)
        // This stable source marker also survives editing a task title or completing it.
        const marker = `מקור בדוח: ${canonicalName || 'ללא שם'} · רישוי: ${registration || 'לא צוין'} · פוליסה: ${number || 'לא צוינה'} · תחילה / מייל: ${start || mailDate || 'לא צוין'} · סוג: ${sourceType || 'לא צוין'}`
        const duplicate =
          snapshot.tasks.some(
            (t) =>
              t.customer_id === (row.customerId || null) &&
              t.description.split('\n').includes(marker),
          ) || plannedTasks.has(rowKey)
        if (!duplicate) {
          const task = taskSchema.safeParse({
            customer_id: placeholderId,
            policy_id: null,
            title: `${cancellation ? 'בדיקת ביטול ביטוח' : 'השלמת פרטי ביטוח'}${registration || number ? ` — ${registration || number}` : ''}`,
            description: `${reasons.join('; ')}\n\n${allSource}\n\n${marker}`,
            due_date: today(),
            priority: 'רגילה',
            status: 'פתוחה',
          })
          if (task.success) {
            const { customer_id, policy_id, ...input } = task.data
            void customer_id
            void policy_id
            row.task = input
          } else row.errors.push(...task.error.issues.map((i) => `משימת השלמה: ${i.message}`))
        } else row.warnings.push('משימת בדיקה לשורה הזו כבר נשמרה; לא תיווצר שוב')
      } else {
        const duplicateKey = number ? policyKey(parsed.data) : policyImportKey
        const plannedOwner = plannedPolicies.get(duplicateKey)
        if (plannedOwner && plannedOwner !== row.customerKey)
          row.errors.push('פוליסה כפולה בקובץ עם שיוך לקוח שונה')
        else if (previousPolicy || plannedOwner)
          row.warnings.push(
            'פוליסה קיימת או כפולה בדוח; נתוני הפוליסה לא יעודכנו ללא בחירת שדות לעדכון',
          )
        else {
          const { customer_id, ...policy } = parsed.data
          void customer_id
          row.policy = policy
        }
        if (sourceType && sourceType !== type)
          row.warnings.push(
            `סוג הביטוח ״${sourceType}״ יישמר כסוג ״${type}״. הנוסח המקורי נשמר בהערות.`,
          )
        if (!value('premium'))
          row.warnings.push(
            'פרמיה כוללת לא צוינה — תישאר ריקה; חובה ומקיף נשמרים בנפרד ללא חיבור אוטומטי',
          )
        if (start > today())
          row.warnings.push('תחילת הביטוח עתידית. בדקו את התאריך לפני אישור הייבוא.')
      }
    }
    row.action = row.errors.length
      ? 'error'
      : row.customer || row.policy || row.task
        ? 'ready'
        : 'skip'
    if (row.action === 'ready') {
      if (row.customer) plannedCustomers.set(row.customerKey!, row.customer)
      if (row.policy)
        plannedPolicies.set(number ? policyKey(row.policy) : policyImportKey, row.customerKey!)
      if (row.task) plannedTasks.add(rowKey)
    }
    rows.push(row)
  })
  if (!rows.length) errors.push('לא נמצאו שורות נתונים אחרי שורת הכותרות')
  return { rows, errors }
}

function prepareVehicleImport(options: ImportOptions, snapshot: Snapshot): ImportPlan {
  const { sheet, headerRow, mapping, keepExtra, vehicleLinks = {} } = options
  const rows: ImportRow[] = []
  const errors: string[] = []
  const headers = headersFor(sheet, headerRow)
  const labels = Object.fromEntries(vehicleFields.map(([key, label]) => [key, label]))
  const selected = Object.values(mapping)
  if (new Set(selected).size !== selected.length) errors.push('אין לשייך עמודה אחת ליותר משדה אחד')
  for (const key of [
    'full_name',
    'insurance_company',
    'start_date',
    'end_date',
    'vehicle_registration',
  ]) {
    if (mapping[key] == null) errors.push(`יש לשייך עמודה לשדה ${labels[key]}`)
  }
  if (sheet.rows.length - headerRow - 1 > MAX_IMPORT_ROWS)
    errors.push('עד 10,000 שורות נתונים בכל ייבוא')
  if (errors.length) return { rows, errors }
  const existingPolicies = new Map(
    snapshot.policies.filter((p) => p.import_key).map((p) => [p.import_key!, p]),
  )
  const importedCustomers = new Map(
    snapshot.customers.filter((c) => c.import_key).map((c) => [c.import_key!, c]),
  )
  const customersById = new Map(snapshot.customers.map((c) => [c.id, c]))
  const seen = new Set<string>()
  const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
  sheet.rows.slice(headerRow + 1).forEach((cells, index) => {
    if (!cells.some((c) => c.text.trim() || c.error)) return
    const get = (key: string) => cells[mapping[key]] || blank
    const value = (key: string) => asText(get(key))
    const rowNumber = headerRow + index + 2
    const name = value('full_name').replace(/\s+/g, ' ')
    const start = importDate(get('start_date')),
      end = importDate(get('end_date'))
    const registration = value('vehicle_registration')
    const sourceKey = JSON.stringify([
      'vehicle-v1',
      normalized(name),
      normalized(value('insurance_company')),
      start,
      end,
      normalized(registration).replace(/[\s-]/g, ''),
    ])
    const row: ImportRow = {
      rowNumber,
      name,
      identification: '',
      customerKey: `import:${sourceKey}`,
      suggestedCustomerIds: snapshot.customers
        .filter((c) => !c.archived_at && normalized(fullName(c)) === normalized(name))
        .map((c) => c.id),
      errors: [],
      warnings: [],
      action: 'ready',
    }
    cells.forEach((cell, i) => {
      if (cell.error && (selected.includes(i) || keepExtra))
        row.errors.push(`${headers[i]}: ${cell.error}`)
    })
    if (!name) row.errors.push('שם המבוטח חסר')
    if (!registration)
      row.errors.push('מספר הרישוי חסר; נדרש לזיהוי שורת הביטוח ולמניעת ייבוא חוזר')
    const extra = keepExtra
      ? cells
          .flatMap((c, i) =>
            !selected.includes(i) && c.text.trim() ? [`${headers[i]}: ${c.text.trim()}`] : [],
          )
          .join('\n')
      : ''
    const parsedPolicy = policySchema.safeParse({
      customer_id: placeholderId,
      insurance_company: value('insurance_company'),
      policy_number: '',
      insurance_type: 'רכב',
      start_date: start,
      end_date: end,
      premium: null,
      status: end < today() ? 'הסתיימה' : 'פעילה',
      vehicle_registration: registration,
      compulsory_value: value('compulsory_value'),
      comprehensive_value: value('comprehensive_value'),
      commission: value('commission'),
      notes: [value('policy_notes'), extra].filter(Boolean).join('\n'),
      import_key: sourceKey,
    })
    if (!parsedPolicy.success)
      parsedPolicy.error.issues.forEach((issue) =>
        row.errors.push(`${labels[String(issue.path[0])] || 'פרטי ביטוח'}: ${issue.message}`),
      )
    else {
      const { customer_id, ...policy } = parsedPolicy.data
      void customer_id
      row.policy = policy
    }

    const previousPolicy = existingPolicies.get(sourceKey)
    row.existingPolicyId = previousPolicy?.id
    const partialCustomer = importedCustomers.get(sourceKey)
    const choice = vehicleLinks[rowNumber] || ''
    let existing = previousPolicy ? customersById.get(previousPolicy.customer_id) : partialCustomer
    if (choice.startsWith('record:')) {
      const chosen = customersById.get(choice.slice(7))
      if (!chosen) row.errors.push('הלקוח שנבחר אינו זמין')
      else if (existing && existing.id !== chosen.id)
        row.errors.push(
          'השורה כבר שויכה ללקוח אחר בייבוא קודם; לא ניתן לשנות שיוך באמצעות ייבוא חוזר',
        )
      else existing = chosen
    } else if (choice.startsWith('row:')) {
      const previousRow = rows.find(
        (r) => r.rowNumber === Number(choice.slice(4)) && r.action !== 'error',
      )
      if (!previousRow?.customerKey) row.errors.push('שורת המבוטח שנבחרה אינה מוכנה לייבוא')
      else if (existing && previousRow.customerId !== existing.id)
        row.errors.push('השורה כבר שויכה בייבוא קודם; יש לבחור את הלקוח הקיים או את ברירת המחדל')
      else {
        row.customerKey = previousRow.customerKey
        row.customerId = previousRow.customerId
        row.warnings.push(`ישויך למבוטח משורה ${previousRow.rowNumber}: ${previousRow.name}`)
      }
    } else if (choice) row.errors.push('שיוך המבוטח אינו תקין')
    if (existing) {
      row.customerId = existing.id
      row.customerKey = `record:${existing.id}`
      row.identification = existing.identification_number
      if (existing.archived_at) row.errors.push('הלקוח בארכיון; יש לשחזר אותו לפני הייבוא')
      else row.warnings.push(`ישויך ללקוח הקיים: ${fullName(existing)}`)
    } else if (!choice.startsWith('row:')) {
      const [first, ...rest] = name.split(' ')
      const parsedCustomer = customerSchema.safeParse({
        first_name: first,
        last_name: rest.join(' '),
        identification_number: '',
        phone: '',
        email: '',
        date_of_birth: null,
        address: '',
        notes: '',
        import_key: sourceKey,
      })
      if (!parsedCustomer.success)
        parsedCustomer.error.issues.forEach((issue) =>
          row.errors.push(`פרטי מבוטח: ${issue.message}`),
        )
      else row.customer = parsedCustomer.data
      row.warnings.push(
        'ייווצר לקוח חדש ללא ת״ז וטלפון. אפשר לבחור שיוך ללקוח קיים או לשורה קודמת.',
      )
      if (snapshot.customers.some((c) => normalized(fullName(c)) === normalized(name)))
        row.warnings.push('נמצא במערכת שם זהה; לא בוצע איחוד אוטומטי. בדקו את שיוך המבוטח.')
    }
    if (previousPolicy || seen.has(sourceKey)) {
      row.customer = undefined
      row.policy = undefined
      row.warnings.push('שורה לאותו מבוטח, רכב, חברה ותקופת ביטוח כבר קיימת; הנתונים לא יעודכנו')
      row.action = row.errors.length ? 'error' : 'skip'
    } else {
      row.action = row.errors.length ? 'error' : 'ready'
      if (row.action === 'ready') seen.add(sourceKey)
    }
    rows.push(row)
  })
  if (!rows.length) errors.push('לא נמצאו שורות נתונים אחרי שורת הכותרות')
  return { rows, errors }
}

// Existing records are matched by identity, never merged by a shared name.
export function prepareImport(options: ImportOptions, snapshot: Snapshot): ImportPlan {
  const plan = prepareBaseImport(options, snapshot)
  if (!options.updateExisting || plan.errors.length) return plan
  const { mapping, selectedChanges = {}, vehiclePolicyLinks = {} } = options
  const reserved = new Map<string, number>()
  for (const row of plan.rows) {
    if (row.errors.length) continue
    const cells = options.sheet.rows[row.rowNumber - 1]
    const get = (key: string) => cells[mapping[key]] || blank
    const value = (key: string) => asText(get(key))
    const selectedColumns = Object.values(mapping)
    const extraNotes = options.keepExtra
      ? cells
          .flatMap((cell, i) =>
            !selectedColumns.includes(i) && cell.text.trim()
              ? [`${headersFor(options.sheet, options.headerRow)[i]}: ${cell.text.trim()}`]
              : [],
          )
          .join('\n')
      : ''
    const reportNotes =
      options.mode === 'report'
        ? cells
            .flatMap((cell, i) =>
              cell.text.trim() && (options.keepExtra || selectedColumns.includes(i))
                ? [`${headersFor(options.sheet, options.headerRow)[i]}: ${cell.text.trim()}`]
                : [],
            )
            .join('\n')
        : ''
    const changes: ImportChange[] = []
    function propose(
      table: 'customers' | 'policies',
      existing: Snapshot['customers'][number] | Snapshot['policies'][number],
      patch: Record<string, unknown>,
    ) {
      const parsed =
        table === 'customers'
          ? customerSchema.safeParse({ ...existing, ...patch })
          : policySchema.safeParse({ ...existing, ...patch })
      if (!parsed.success) {
        row.errors.push(
          'נתוני העדכון אינם תקינים: ' + parsed.error.issues.map((i) => i.message).join('; '),
        )
        return
      }
      for (const [field, after] of Object.entries(patch)) {
        const before = (existing as unknown as Record<string, unknown>)[field] ?? null
        if (String(before ?? '') === String(after ?? '')) continue
        const key = `${row.rowNumber}:${table}:${field}`
        const selected = !!selectedChanges[key]
        if (
          selected &&
          reserved.has(`${table}:${existing.id}`) &&
          reserved.get(`${table}:${existing.id}`) !== row.rowNumber
        ) {
          row.errors.push('אותה רשומה נבחרה לעדכון בשורה קודמת; בחרו שורה אחת לעדכון הרשומה')
          continue
        }
        if (selected) reserved.set(`${table}:${existing.id}`, row.rowNumber)
        changes.push({
          key,
          table,
          id: existing.id,
          field,
          before,
          after,
          updated_at: existing.updated_at,
          selected,
        })
      }
    }
    const existingCustomer = snapshot.customers.find(
      (c) =>
        c.id === row.customerId ||
        (!!row.identification && c.identification_number === row.identification),
    )
    if (
      existingCustomer &&
      (options.mode === 'customers' || options.mode === 'combined' || options.mode === 'report')
    ) {
      const patch: Record<string, unknown> = {}
      const parts = value('full_name').split(/\s+/)
      if (mapping.first_name != null || mapping.full_name != null)
        patch.first_name = value('first_name') || parts[0]
      if (mapping.last_name != null || mapping.full_name != null)
        patch.last_name = value('last_name') || parts.slice(1).join(' ')
      if (options.mode === 'report' && mapping.last_first_name != null) {
        const surnameFirst = value('last_first_name').split(/\s+/)
        patch.first_name = surnameFirst.slice(1).join(' ') || surnameFirst[0]
        patch.last_name = surnameFirst.length > 1 ? surnameFirst[0] : ''
      }
      for (const key of ['phone', 'email', 'address', 'notes'])
        if (mapping[key] != null) patch[key] = value(key)
      if (mapping.notes != null || extraNotes)
        patch.notes =
          options.mode === 'report'
            ? reportNotes
            : [value('notes'), extraNotes].filter(Boolean).join('\n')
      if (typeof patch.phone === 'string' && /^[1-9]\d{7,8}$/.test(patch.phone))
        patch.phone = '0' + patch.phone
      if (typeof patch.email === 'string') patch.email = patch.email.toLowerCase()
      if (mapping.date_of_birth != null)
        patch.date_of_birth = value('date_of_birth') ? importDate(get('date_of_birth')) : null
      propose('customers', existingCustomer, patch)
    }
    let existingPolicy = snapshot.policies.find((p) =>
      options.mode === 'vehicles' || options.mode === 'report'
        ? p.id === row.existingPolicyId
        : !!value('policy_number') &&
          policyKey(p) ===
            policyKey({
              policy_number: value('policy_number'),
              insurance_company: value('insurance_company'),
            }),
    )
    if (options.mode === 'vehicles') {
      // Previously imported rows may have no proposed policy because the base plan skipped them.
      const candidates = snapshot.policies.filter(
        (p) =>
          p.insurance_type === 'רכב' &&
          p.vehicle_registration?.replace(/[\s-]/g, '') ===
            value('vehicle_registration').replace(/[\s-]/g, '') &&
          p.insurance_company === value('insurance_company') &&
          p.start_date === importDate(get('start_date')),
      )
      row.policyCandidates = candidates.map((p) => ({
        id: p.id,
        label: `${fullName(snapshot.customers.find((c) => c.id === p.customer_id))} · ${p.vehicle_registration} · ${p.end_date}`,
      }))
      const selectedId = vehiclePolicyLinks[row.rowNumber]
      if (selectedId) {
        const chosen = candidates.find((p) => p.id === selectedId)
        if (
          !chosen ||
          (existingPolicy && existingPolicy.id !== chosen.id) ||
          (row.customerId && row.customerId !== chosen.customer_id)
        )
          row.errors.push('שיוך הפוליסה אינו תואם לרכב, לחברה, לתאריך ההתחלה או למבוטח שנבחר')
        else {
          existingPolicy = chosen
          row.customerId = chosen.customer_id
          row.customerKey = `record:${chosen.customer_id}`
          row.customer = undefined
          row.policy = undefined
        }
      }
    }
    if (
      existingPolicy &&
      !row.reviewOnly &&
      (options.mode === 'policies' ||
        options.mode === 'combined' ||
        options.mode === 'vehicles' ||
        options.mode === 'report')
    ) {
      if (
        options.mode !== 'vehicles' &&
        options.mode !== 'report' &&
        snapshot.customers.find((c) => c.id === existingPolicy.customer_id)
          ?.identification_number !== row.identification
      )
        row.errors.push('אין לעדכן פוליסה של לקוח אחר')
      else {
        const patch: Record<string, unknown> = {}
        for (const key of ['compulsory_value', 'comprehensive_value', 'commission'])
          if (mapping[key] != null) patch[key] = value(key)
        for (const key of ['start_date', 'end_date'])
          if (mapping[key] != null) patch[key] = importDate(get(key))
        if (mapping.premium != null)
          patch.premium = value('premium') ? importPremium(get('premium')) : null
        if (mapping.policy_status != null) patch.status = value('policy_status')
        if (mapping.policy_notes != null || (options.mode !== 'combined' && extraNotes))
          patch.notes =
            options.mode === 'report'
              ? reportNotes
              : [value('policy_notes'), options.mode !== 'combined' ? extraNotes : '']
                  .filter(Boolean)
                  .join('\n')
        propose('policies', existingPolicy, patch)
      }
    }
    row.changes = changes
    row.updates = []
    for (const c of changes.filter((c) => c.selected)) {
      let update = row.updates.find((u) => u.id === c.id && u.table === c.table)
      if (!update) {
        update = { table: c.table, id: c.id, updated_at: c.updated_at, patch: {} }
        row.updates.push(update)
      }
      update.patch[c.field] = c.after
    }
    row.action = row.errors.length
      ? 'error'
      : row.customer || row.policy || row.task || row.updates.length
        ? 'ready'
        : 'skip'
    if (changes.length) {
      row.warnings = row.warnings.filter((warning) => !/לא יישמרו|לא יעודכנו/.test(warning))
      row.warnings.push(
        'רק השדות שסומנו ברשימת השינויים יעודכנו. ערך ריק שסומן מוחק את הערך הקודם.',
      )
    }
  }
  return plan
}
