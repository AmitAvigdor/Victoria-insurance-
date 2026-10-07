import { utils, write, type CellObject, type WorkBook } from 'xlsx'
import { fullName, type Snapshot } from './types'

export const exportSections = [
  { key: 'customers', label: 'לקוחות' },
  { key: 'policies', label: 'פוליסות וחידושים' },
  { key: 'vehicles', label: 'ביטוחי רכב במבנה האקסל המקורי' },
  { key: 'tasks', label: 'משימות' },
  { key: 'commissions', label: 'עמלות' },
  { key: 'documents', label: 'רשימת מסמכים' },
  { key: 'activities', label: 'היסטוריית פעילות' },
] as const
export type ExportSection = (typeof exportSections)[number]['key']
export interface ExportOptions {
  agencyId: string
  sections: ExportSection[]
  includeArchived: boolean
}

// Defense in depth: use only the authenticated agency's RLS-filtered snapshot.
export function exportScope(data: Snapshot, options: ExportOptions): Snapshot {
  if (!options.agencyId) throw new Error('יש להתחבר לסוכנות לפני ייצוא הנתונים')
  const customers = data.customers.filter(
    (c) => c.agency_id === options.agencyId && (options.includeArchived || !c.archived_at),
  )
  const customerIds = new Set(customers.map((c) => c.id))
  const policies = data.policies.filter(
    (p) => p.agency_id === options.agencyId && customerIds.has(p.customer_id),
  )
  const policyIds = new Set(policies.map((p) => p.id))
  return {
    customers,
    policies,
    tasks: data.tasks.filter(
      (t) =>
        t.agency_id === options.agencyId &&
        (!t.customer_id || customerIds.has(t.customer_id)) &&
        (!t.policy_id || policyIds.has(t.policy_id)),
    ),
    documents: data.documents.filter(
      (d) =>
        d.agency_id === options.agencyId &&
        !d.deleted_at &&
        customerIds.has(d.customer_id) &&
        (!d.policy_id || policyIds.has(d.policy_id)),
    ),
    activities: data.activities.filter(
      (a) => a.agency_id === options.agencyId && (!a.customer_id || customerIds.has(a.customer_id)),
    ),
  }
}

export function exportCounts(data: Snapshot) {
  return {
    customers: data.customers.length,
    policies: data.policies.length,
    vehicles: data.policies.filter((p) => p.insurance_type === 'רכב').length,
    tasks: data.tasks.length,
    commissions: data.policies.length,
    documents: data.documents.length,
    activities: data.activities.length,
  }
}

type Value = string | number | null | undefined | CellObject
const text = (value: string | null | undefined): CellObject => {
  const v = value ?? ''
  if (v.length > 32767) throw new Error('טקסט ברשומה ארוך ממגבלת אקסל; לא נוצר קובץ חלקי')
  // Explicit strings preserve leading zeroes and keep =,+,-,@ text inert.
  return { t: 's', v, z: '@' }
}
const amount = (value: number | null | undefined): CellObject | null => {
  if (value == null) return null
  if (!Number.isFinite(Number(value))) throw new Error('נמצא סכום לא תקין; לא נוצר קובץ חלקי')
  return { t: 'n', v: Number(value), z: '#,##0.00' }
}
const date = (value: string | null | undefined): CellObject | null => {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('נמצא תאריך לא תקין')
  const [y, m, d] = value.split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d)
  if (new Date(utc).toISOString().slice(0, 10) !== value) throw new Error('נמצא תאריך לא תקין')
  // Calendar serials avoid timezone/DST shifts; account for Excel's fictional leap day.
  const serial = (utc - Date.UTC(1899, 11, 31)) / 86400000 + (value >= '1900-03-01' ? 1 : 0)
  return { t: 'n', v: serial, z: 'dd/mm/yyyy' }
}

export function buildExportWorkbook(input: Snapshot, options: ExportOptions): WorkBook {
  if (!options.sections.length) throw new Error('יש לבחור לפחות גיליון אחד')
  if (options.sections.some((s) => !exportSections.some((section) => section.key === s)))
    throw new Error('נבחר גיליון לא תקין')
  const data = exportScope(input, options)
  const customers = new Map(data.customers.map((c) => [c.id, c]))
  const policies = new Map(data.policies.map((p) => [p.id, p]))
  const customerName = (id: string | null) => (id ? fullName(customers.get(id)) : '')
  const policyName = (id: string | null) => {
    const p = id ? policies.get(id) : undefined
    return p ? p.policy_number || p.vehicle_registration || '' : ''
  }
  const book = utils.book_new()
  book.Props = { Title: 'ויקטוריה — ייצוא נתונים', Author: 'ויקטוריה' }
  book.Workbook = { Views: [{ RTL: true }], WBProps: { date1904: false } }
  function sheet(key: ExportSection, name: string, headers: string[], rows: () => Value[][]) {
    if (!options.sections.includes(key)) return
    const values = rows()
    if (values.length > 1048575) throw new Error('מספר הרשומות גדול ממגבלת הגיליון באקסל')
    const result = utils.aoa_to_sheet([
      headers.map(text),
      ...values.map((row) => row.map((v) => (typeof v === 'string' ? text(v) : v))),
    ])
    result['!cols'] = headers.map((h) => ({
      wch:
        h.includes('הערות') || h.includes('תיאור') ? 48 : Math.max(18, Math.min(38, h.length + 4)),
    }))
    result['!autofilter'] = { ref: result['!ref']! }
    utils.book_append_sheet(book, result, name)
  }
  sheet(
    'customers',
    'לקוחות',
    [
      'מזהה לקוח',
      'שם פרטי',
      'שם משפחה',
      'שם המבוטח',
      'מספר זהות',
      'טלפון',
      'אימייל',
      'תאריך לידה',
      'כתובת',
      'הערות',
      'בארכיון',
    ],
    () =>
      data.customers.map((c) => [
        c.id,
        c.first_name,
        c.last_name,
        fullName(c),
        c.identification_number,
        c.phone,
        c.email,
        date(c.date_of_birth),
        c.address,
        c.notes,
        c.archived_at ? 'כן' : 'לא',
      ]),
  )
  sheet(
    'policies',
    'פוליסות',
    [
      'מזהה פוליסה',
      'מזהה לקוח',
      'שם המבוטח',
      'מספר זהות',
      'חברת הביטוח',
      'מספר פוליסה',
      'סוג ביטוח',
      'תחילת הביטוח',
      'סיום הביטוח',
      'פרמיה שנתית (₪)',
      'מספר רישוי',
      'חובה',
      'מקיף',
      'עמלה מקורית',
      'סטטוס פוליסה',
      'שלב חידוש',
      'תאריך מעקב',
      'הערות חידוש',
      'הערות',
    ],
    () =>
      data.policies.map((p) => [
        p.id,
        p.customer_id,
        customerName(p.customer_id),
        customers.get(p.customer_id)?.identification_number,
        p.insurance_company,
        p.policy_number,
        p.insurance_type,
        date(p.start_date),
        date(p.end_date),
        amount(p.premium),
        p.vehicle_registration,
        p.compulsory_value,
        p.comprehensive_value,
        p.commission,
        p.status,
        p.renewal_stage || 'טרם טופל',
        date(p.renewal_follow_up),
        p.renewal_notes,
        p.notes,
      ]),
  )
  sheet(
    'vehicles',
    'ביטוחי רכב',
    [
      'שם המבוטח',
      'חברת הביטוח',
      'תחילת הביטוח',
      'סיום הביטוח',
      'חובה',
      'מקיף',
      '',
      "מס' רישוי -",
      'עמלה',
      'הערות',
    ],
    () =>
      data.policies
        .filter((p) => p.insurance_type === 'רכב')
        .map((p) => [
          customerName(p.customer_id),
          p.insurance_company,
          date(p.start_date),
          date(p.end_date),
          p.compulsory_value,
          p.comprehensive_value,
          '',
          p.vehicle_registration,
          p.commission,
          p.notes,
        ]),
  )
  sheet(
    'tasks',
    'משימות',
    [
      'מזהה משימה',
      'מזהה לקוח',
      'שם המבוטח',
      'פוליסה / רכב',
      'כותרת',
      'תיאור',
      'תאריך יעד',
      'עדיפות',
      'סטטוס',
    ],
    () =>
      data.tasks.map((t) => [
        t.id,
        t.customer_id,
        customerName(t.customer_id),
        policyName(t.policy_id),
        t.title,
        t.description,
        date(t.due_date),
        t.priority,
        t.status,
      ]),
  )
  sheet(
    'commissions',
    'עמלות',
    [
      'מזהה פוליסה',
      'מזהה לקוח',
      'שם המבוטח',
      'חברת הביטוח',
      'מספר פוליסה',
      'מספר רישוי',
      'עמלה מקורית מהאקסל',
      'תאריך זכאות',
      'עמלה צפויה (₪)',
      'סך עמלה שהתקבלה (₪)',
      'יתרה לקבלה (₪)',
    ],
    () =>
      data.policies.map((p) => [
        p.id,
        p.customer_id,
        customerName(p.customer_id),
        p.insurance_company,
        p.policy_number,
        p.vehicle_registration,
        p.commission,
        date(p.commission_due_date),
        amount(p.commission_expected_amount),
        amount(p.commission_received_amount ?? 0),
        amount(
          p.commission_expected_amount == null
            ? null
            : Math.max(
                0,
                Number(p.commission_expected_amount) - Number(p.commission_received_amount ?? 0),
              ),
        ),
      ]),
  )
  sheet(
    'documents',
    'רשימת מסמכים',
    [
      'שם המבוטח',
      'מזהה לקוח',
      'פוליסה / רכב',
      'שם קובץ',
      'סוג מסמך',
      'גודל בבתים',
      'מועד העלאה (UTC)',
    ],
    () =>
      data.documents.map((d) => [
        customerName(d.customer_id),
        d.customer_id,
        policyName(d.policy_id),
        d.file_name,
        d.document_type,
        d.file_size,
        d.uploaded_at,
      ]),
  )
  sheet(
    'activities',
    'פעילות',
    ['שם המבוטח', 'מזהה לקוח', 'סוג פעולה', 'תיאור', 'מועד פעולה (UTC)'],
    () =>
      data.activities.map((a) => [
        customerName(a.customer_id),
        a.customer_id,
        a.action_type,
        a.description,
        a.created_at,
      ]),
  )
  return book
}

export function createExportBuffer(data: Snapshot, options: ExportOptions): ArrayBuffer {
  return write(buildExportWorkbook(data, options), {
    bookType: 'xlsx',
    type: 'array',
    compression: true,
    cellDates: false,
  }) as ArrayBuffer
}
