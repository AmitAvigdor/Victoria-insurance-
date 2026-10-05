import { describe, expect, it, vi } from 'vitest'
import { utils, write } from 'xlsx'
import { readImportWorkbook } from './import-workbook'
import {
  headersFor,
  detectImportMode,
  importPremium,
  prepareImport,
  suggestMapping,
  type ImportMode,
  type ImportOptions,
} from './import'
import type { Customer, CustomerInput, Policy, PolicyInput, Snapshot } from './types'
import { executeImport } from '@/services/import'
import type { Repository } from '@/services/repository'

const customerHeaders = ['שם פרטי', 'שם משפחה', 'ת״ז', 'טלפון', 'אימייל', 'תאריך לידה', 'מידע נוסף']
const policyHeaders = [
  'חברת ביטוח',
  'מספר פוליסה',
  'סוג ביטוח',
  'תאריך התחלה',
  'תאריך סיום',
  'פרמיה',
]
const customer = [
  'דוגמה',
  'בדיקה',
  '000007777',
  '0500007777',
  'TEST@example.invalid',
  '31/12/1990',
  'נתון לשימור',
]
const policy = ['חברת בדיקה', 'P-001', 'רכב', '01/01/2026', '31/12/2026', '₪ 1,250.50']
const empty = (): Snapshot => ({
  customers: [],
  policies: [],
  tasks: [],
  documents: [],
  activities: [],
})
function options(
  rows: (string | number)[][],
  mode: ImportMode = 'customers',
  headerRow = 0,
): ImportOptions {
  const book = utils.book_new()
  utils.book_append_sheet(book, utils.aoa_to_sheet(rows), 'לקוחות')
  const sheet = readImportWorkbook(write(book, { type: 'array', bookType: 'xlsx' }))[0]
  return {
    sheet,
    headerRow,
    mode,
    mapping: suggestMapping(headersFor(sheet, headerRow), mode),
    keepExtra: true,
  }
}
const customerInput: CustomerInput = {
  first_name: 'דוגמה',
  last_name: 'בדיקה',
  identification_number: '000007777',
  phone: '0500007777',
  email: '',
  date_of_birth: null,
  address: '',
  notes: '',
}
const record = (): Customer => ({
  ...customerInput,
  id: '11111111-1111-4111-8111-111111111111',
  agency_id: 'agency',
  created_at: '',
  updated_at: '',
  archived_at: null,
})
function memoryRepository(snapshot: Snapshot) {
  const repository = {
    load: vi.fn(async () => structuredClone(snapshot)),
    saveCustomer: vi.fn(async (input: CustomerInput) => {
      const c = {
        ...record(),
        ...input,
        id: snapshot.customers.length ? crypto.randomUUID() : record().id,
      }
      snapshot.customers.push(c)
      return c
    }),
    savePolicy: vi.fn(async (input: PolicyInput) => {
      const p: Policy = {
        ...input,
        id: crypto.randomUUID(),
        agency_id: 'agency',
        created_at: '',
        updated_at: '',
      }
      snapshot.policies.push(p)
      return p
    }),
  }
  return { repository: repository as unknown as Repository, calls: repository }
}
describe('Excel import parsing and review', () => {
  it('preserves raw currency precision and rejects ambiguous decimal commas', () => {
    expect(importPremium({ value: 1250.5, text: '1,251' })).toBe(1250.5)
    expect(importPremium({ value: '1250,50', text: '1250,50' })).toBeNaN()
    expect(importPremium({ value: '1,250.50', text: '₪ 1,250.50' })).toBe(1250.5)
    expect(importPremium({ value: 1.234, text: '1.23' })).toBeNaN()
  })
  it('reads CSV dates as day/month/year without automatic US conversion', () => {
    const csv =
      '\uFEFF' +
      [customerHeaders, [...customer.slice(0, 5), '01/02/1990', '']]
        .map((r) => r.join(','))
        .join('\n')
    const sheet = readImportWorkbook(new TextEncoder().encode(csv).buffer)[0]
    const row = prepareImport(
      {
        sheet,
        headerRow: 0,
        mode: 'customers',
        mapping: suggestMapping(customerHeaders, 'customers'),
        keepExtra: true,
      },
      empty(),
    ).rows[0]
    expect(row.customer?.date_of_birth).toBe('1990-02-01')
  })
  it('maps Hebrew punctuation, restores identifier and phone zeros, and preserves unknown data', () => {
    const o = options([
      customerHeaders,
      ['דוגמה', 'בדיקה', 7777, 500007777, 'TEST@example.invalid', '31/12/1990', 'נתון לשימור'],
    ])
    const row = prepareImport(o, empty()).rows[0]
    expect(row.errors).toEqual([])
    expect(row.customer).toMatchObject({
      identification_number: '000007777',
      phone: '0500007777',
      email: 'test@example.invalid',
      date_of_birth: '1990-12-31',
      notes: 'מידע נוסף: נתון לשימור',
    })
    expect(row.warnings).toHaveLength(2)
  })
  it.each(['xlsx', 'xls'] as const)(
    'reads %s multiple sheets and Excel serial dates',
    (bookType) => {
      const book = utils.book_new()
      utils.book_append_sheet(
        book,
        utils.aoa_to_sheet([customerHeaders, [...customer.slice(0, 5), 45292, '']]),
        'ראשון',
      )
      utils.book_append_sheet(book, utils.aoa_to_sheet([['אחר'], ['תוכן']]), 'שני')
      const sheets = readImportWorkbook(write(book, { type: 'array', bookType }))
      expect(sheets.map((s) => s.name)).toEqual(['ראשון', 'שני'])
      const row = prepareImport(
        {
          sheet: sheets[0],
          headerRow: 0,
          mode: 'customers',
          mapping: suggestMapping(customerHeaders, 'customers'),
          keepExtra: true,
        },
        empty(),
      ).rows[0]
      expect(row.customer?.date_of_birth).toBe('2024-01-01')
    },
  )
  it('respects the 1904 date system', () => {
    const book = utils.book_new()
    book.Workbook = { WBProps: { date1904: true } }
    utils.book_append_sheet(
      book,
      utils.aoa_to_sheet([customerHeaders, [...customer.slice(0, 5), 43830, '']]),
      'ראשון',
    )
    const sheet = readImportWorkbook(write(book, { type: 'array', bookType: 'xlsx' }))[0]
    expect(sheet.rows[1][5].date).toBe('2024-01-01')
  })
  it('parses UTF-8 CSV and keeps identifiers as readable strings', () => {
    const csv = '\uFEFF' + [customerHeaders, customer].map((r) => r.join(',')).join('\n')
    const sheet = readImportWorkbook(new TextEncoder().encode(csv).buffer)[0]
    expect(sheet.rows[0][0].text).toBe('שם פרטי')
    expect(
      prepareImport(
        {
          sheet,
          mode: 'customers',
          headerRow: 0,
          mapping: suggestMapping(headersFor(sheet, 0), 'customers'),
          keepExtra: true,
        },
        empty(),
      ).rows[0].customer?.identification_number,
    ).toBe('000007777')
  })
  it('rejects invalid dates and missing required data without reserving an identity', () => {
    const invalid = [...customer]
    invalid[5] = '31/02/2020'
    const plan = prepareImport(options([customerHeaders, invalid, customer]), empty())
    expect(plan.rows[0].action).toBe('error')
    expect(plan.rows[1].action).toBe('ready')
    expect(
      prepareImport(options([customerHeaders, ['', ...customer.slice(1)]]), empty()).rows[0].action,
    ).toBe('error')
  })
  it('requires explicit mapping of identity and rejects duplicate mappings', () => {
    const o = options([customerHeaders, customer])
    delete o.mapping.identification_number
    expect(prepareImport(o, empty()).errors).toContain('יש לשייך עמודה למספר זהות')
    o.mapping.identification_number = o.mapping.phone
    expect(prepareImport(o, empty()).errors).toContain('אין לשייך עמודה אחת ליותר משדה אחד')
    expect(suggestMapping(['מספר לקוח'], 'customers')).toEqual({})
  })
  it('preserves source row numbers after title rows and blanks', () => {
    const o = options([['דוח'], customerHeaders, [], customer], 'customers', 1)
    expect(prepareImport(o, empty()).rows[0].rowNumber).toBe(4)
  })
  it('creates one customer for multiple policies and flags conflicting customer data', () => {
    const o = options(
      [
        [...customerHeaders, ...policyHeaders],
        [...customer, ...policy],
        [...customer, policy[0], 'P-002', ...policy.slice(2)],
        ['אחר', ...customer.slice(1), policy[0], 'P-003', ...policy.slice(2)],
      ],
      'combined',
    )
    const rows = prepareImport(o, empty()).rows
    expect(rows.map((r) => r.action)).toEqual(['ready', 'ready', 'error'])
    expect(rows.filter((r) => r.customer)).toHaveLength(1)
    expect(rows[0].policy?.premium).toBe(1250.5)
    expect(rows[1].customer).toBeUndefined()
  })
  it('skips existing customers without overwriting them and blocks archived customers', () => {
    const snapshot = empty()
    snapshot.customers.push(record())
    const o = options([customerHeaders, customer])
    expect(prepareImport(o, snapshot).rows[0].action).toBe('skip')
    snapshot.customers[0].archived_at = '2026-01-01'
    expect(prepareImport(o, snapshot).rows[0].action).toBe('error')
  })
  it('links policy-only rows to existing customers, skips duplicates and blocks a different owner', () => {
    const o = options(
      [
        ['תז', ...policyHeaders],
        ['000007777', ...policy],
        ['000007777', ...policy],
      ],
      'policies',
    )
    const snapshot = empty()
    snapshot.customers.push(record())
    expect(prepareImport(o, snapshot).rows.map((r) => r.action)).toEqual(['ready', 'skip'])
    expect(prepareImport(o, empty()).rows[0].action).toBe('error')
    snapshot.policies.push({
      ...policyInput(),
      id: 'p',
      agency_id: 'agency',
      created_at: '',
      updated_at: '',
      customer_id: 'another-customer',
    })
    expect(prepareImport(o, snapshot).rows[0].errors).toContain(
      'מספר הפוליסה בחברה הזו כבר שייך ללקוח אחר',
    )
  })
  it('does not invent a premium or silently accept invalid insurance types', () => {
    const o = options(
      [
        [...customerHeaders, ...policyHeaders],
        [...customer, ...policy.slice(0, 5), ''],
      ],
      'combined',
    )
    expect(prepareImport(o, empty()).rows[0].action).toBe('error')
    o.sheet.rows[1][12] = { text: '0', value: 0 }
    expect(prepareImport(o, empty()).rows[0].policy?.premium).toBe(0)
    o.sheet.rows[1][9] = { text: 'ביטוח לא מוכר', value: 'ביטוח לא מוכר' }
    expect(prepareImport(o, empty()).rows[0].action).toBe('error')
  })
  it('rejects oversized notes instead of truncating source data', () => {
    const row = [...customer]
    row[6] = 'א'.repeat(5001)
    expect(prepareImport(options([customerHeaders, row]), empty()).rows[0].action).toBe('error')
  })
  it('rejects formula errors and does not execute formulas', () => {
    const book = utils.book_new()
    const sheet = utils.aoa_to_sheet([customerHeaders, customer])
    sheet.A2 = { t: 'n', f: '1/0' }
    utils.book_append_sheet(book, sheet, 'לקוחות')
    const parsed = readImportWorkbook(write(book, { type: 'array', bookType: 'xlsx' }))[0]
    const o = {
      sheet: parsed,
      headerRow: 0,
      mode: 'customers' as const,
      mapping: suggestMapping(customerHeaders, 'customers'),
      keepExtra: true,
    }
    expect(prepareImport(o, empty()).rows[0].action).toBe('error')
  })
  it('blocks oversized sheet ranges instead of silently truncating', () => {
    const book = utils.book_new()
    const sheet = utils.aoa_to_sheet([['כותרת']])
    sheet['!ref'] = 'A1:CZ1'
    utils.book_append_sheet(book, sheet, 'רחב')
    expect(() => readImportWorkbook(write(book, { type: 'array', bookType: 'xlsx' }))).toThrow(
      'גדול מדי',
    )
  })
  it('detects task duplicates by customer, title and due date', () => {
    const snapshot = empty()
    snapshot.customers.push(record())
    const o = options(
      [
        ['תז', 'כותרת משימה', 'תאריך יעד', 'פרט נוסף'],
        ['000007777', 'להתקשר', '10/10/2026', 'בערב'],
        ['000007777', 'להתקשר', '10/10/2026', 'בערב'],
      ],
      'tasks',
    )
    const rows = prepareImport(o, snapshot).rows
    expect(rows.map((r) => r.action)).toEqual(['ready', 'skip'])
    expect(rows[0].task?.description).toBe('פרט נוסף: בערב')
  })
})
function policyInput(): PolicyInput {
  return {
    customer_id: record().id,
    insurance_company: 'חברת בדיקה',
    policy_number: 'P-001',
    insurance_type: 'רכב',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    premium: 1250.5,
    status: 'פעילה',
    notes: '',
  }
}
describe('import persistence and recovery', () => {
  const combined = () =>
    options(
      [
        [...customerHeaders, ...policyHeaders],
        [...customer, ...policy],
      ],
      'combined',
    )
  it('saves customers before dependent policies and skips them on retry', async () => {
    const snapshot = empty()
    const { repository, calls } = memoryRepository(snapshot)
    const o = combined()
    const plan = prepareImport(o, snapshot)
    const result = await executeImport(repository, o, plan, vi.fn(), () => false)
    expect(result).toMatchObject({ customers: 1, policies: 1, tasks: 0 })
    expect(calls.savePolicy).toHaveBeenCalledWith({ ...policyInput(), customer_id: record().id })
    expect(prepareImport(o, snapshot).rows[0].action).toBe('skip')
  })
  it('reports partial success and safely resumes when a policy write fails', async () => {
    const snapshot = empty()
    const { repository, calls } = memoryRepository(snapshot)
    const o = combined()
    calls.savePolicy.mockRejectedValueOnce(new Error('החיבור נקטע'))
    const result = await executeImport(
      repository,
      o,
      prepareImport(o, snapshot),
      vi.fn(),
      () => false,
    )
    expect(result.customers).toBe(1)
    expect(result.policies).toBe(0)
    expect(result.rows[0].detail).toContain('כבר נשמר: לקוח')
    const retry = await executeImport(
      repository,
      o,
      prepareImport(o, snapshot),
      vi.fn(),
      () => false,
    )
    expect(retry).toMatchObject({ customers: 0, policies: 1 })
    expect(calls.saveCustomer).toHaveBeenCalledTimes(1)
  })
  it('requires a fresh review if records change after preview', async () => {
    const snapshot = empty()
    const { repository, calls } = memoryRepository(snapshot)
    const o = combined()
    const plan = prepareImport(o, snapshot)
    snapshot.customers.push(record())
    await expect(executeImport(repository, o, plan, vi.fn(), () => false)).rejects.toThrow(
      'הנתונים במערכת השתנו',
    )
    expect(calls.saveCustomer).not.toHaveBeenCalled()
    expect(calls.savePolicy).not.toHaveBeenCalled()
  })
  it('does not save rows after cancellation or invalid rows', async () => {
    const snapshot = empty()
    const { repository, calls } = memoryRepository(snapshot)
    const o = combined()
    const result = await executeImport(
      repository,
      o,
      prepareImport(o, snapshot),
      vi.fn(),
      () => true,
    )
    expect(result.rows[0].status).toBe('לא בוצע')
    expect(calls.saveCustomer).not.toHaveBeenCalled()
    const bad = options([customerHeaders, ['', ...customer.slice(1)]])
    const badResult = await executeImport(
      repository,
      bad,
      prepareImport(bad, snapshot),
      vi.fn(),
      () => false,
    )
    expect(badResult.rows[0].status).toBe('דולג')
    expect(calls.saveCustomer).not.toHaveBeenCalled()
  })
})

const vehicleHeaders = [
  'שם המבוטח\u00a0',
  'חברת הביטוח\u00a0',
  'תחילת הביטוח\u00a0',
  'סיום הביטוח\u00a0',
  'חובה',
  'מקיף',
  '',
  "מס' רישוי -\u00a0",
  'עמלה',
  'הערות',
]
const vehicleRow = [
  'דנה לוי',
  'חברת בדיקה',
  '01/01/2026',
  '31/12/2026',
  '1,200',
  'יש כיסוי',
  'מידע ללא כותרת',
  '12-345-67',
  '12%',
  'הערה מקורית',
]
describe('vehicle workbook without identity, phone or policy number', () => {
  it('detects the exact supplied headers including nonbreaking spaces', () => {
    expect(detectImportMode(vehicleHeaders)).toBe('vehicles')
    expect(suggestMapping(vehicleHeaders, 'vehicles')).toMatchObject({
      full_name: 0,
      insurance_company: 1,
      start_date: 2,
      end_date: 3,
      compulsory_value: 4,
      comprehensive_value: 5,
      vehicle_registration: 7,
      commission: 8,
      policy_notes: 9,
    })
    expect(suggestMapping(['שם המבוטח&#xA0;'], 'vehicles').full_name).toBe(0)
  })
  it('preserves coverage, commission and unnamed cells without inventing numbers', () => {
    const plan = prepareImport(options([vehicleHeaders, vehicleRow], 'vehicles'), empty())
    expect(plan.errors).toEqual([])
    expect(plan.rows[0].errors).toEqual([])
    expect(plan.rows[0].customer).toMatchObject({
      first_name: 'דנה',
      last_name: 'לוי',
      identification_number: '',
      phone: '',
    })
    expect(plan.rows[0].policy).toMatchObject({
      policy_number: '',
      premium: null,
      compulsory_value: '1,200',
      comprehensive_value: 'יש כיסוי',
      commission: '12%',
      vehicle_registration: '12-345-67',
      notes: 'הערה מקורית\nעמודה 7: מידע ללא כותרת',
    })
  })
  it('does not merge two vehicles by name, but allows an explicit link to a prior row', () => {
    const other = [...vehicleRow]
    other[7] = '98-765-43'
    const o = options([vehicleHeaders, vehicleRow, other], 'vehicles')
    const independent = prepareImport(o, empty())
    expect(independent.rows.filter((r) => r.customer)).toHaveLength(2)
    o.vehicleLinks = { 3: 'row:2' }
    const linked = prepareImport(o, empty())
    expect(linked.rows.filter((r) => r.customer)).toHaveLength(1)
    expect(linked.rows[1].customerKey).toBe(linked.rows[0].customerKey)
    expect(linked.rows[1].action).toBe('ready')
  })
  it('requires an explicit selection to use an existing same-name customer', () => {
    const snapshot = empty()
    snapshot.customers.push({ ...record(), first_name: 'דנה', last_name: 'לוי' })
    const o = options([vehicleHeaders, vehicleRow], 'vehicles')
    expect(prepareImport(o, snapshot).rows[0].customer).toBeDefined()
    o.vehicleLinks = { 2: `record:${record().id}` }
    const row = prepareImport(o, snapshot).rows[0]
    expect(row.customer).toBeUndefined()
    expect(row.customerId).toBe(record().id)
    snapshot.customers[0].archived_at = '2026-01-01'
    expect(prepareImport(o, snapshot).rows[0].action).toBe('error')
  })
  it('reports bad dates, missing registrations and unavailable customer links', () => {
    const missing = [...vehicleRow]
    missing[7] = ''
    expect(
      prepareImport(options([vehicleHeaders, missing], 'vehicles'), empty()).rows[0].action,
    ).toBe('error')
    const badDate = [...vehicleRow]
    badDate[2] = '31/02/2026'
    expect(
      prepareImport(options([vehicleHeaders, badDate], 'vehicles'), empty()).rows[0].action,
    ).toBe('error')
    const o = options([vehicleHeaders, vehicleRow], 'vehicles')
    o.vehicleLinks = { 2: 'row:9' }
    expect(prepareImport(o, empty()).rows[0].action).toBe('error')
  })
  it('persists missing values and safely skips duplicate/reimported source rows', async () => {
    const snapshot = empty()
    const { repository } = memoryRepository(snapshot)
    const o = options([vehicleHeaders, vehicleRow, vehicleRow], 'vehicles')
    const plan = prepareImport(o, snapshot)
    expect(plan.rows.map((r) => r.action)).toEqual(['ready', 'skip'])
    const result = await executeImport(repository, o, plan, vi.fn(), () => false)
    expect(result).toMatchObject({ customers: 1, policies: 1 })
    expect(snapshot.policies[0]).toMatchObject({
      premium: null,
      policy_number: '',
      commission: '12%',
    })
    expect(prepareImport(o, snapshot).rows.map((r) => r.action)).toEqual(['skip', 'skip'])
    o.sheet.rows[1][4] = { value: '9999', text: '9999' }
    expect(prepareImport(o, snapshot).rows[0].action).toBe('skip')
    expect(snapshot.policies[0].compulsory_value).toBe('1,200')
  })
  it('recovers after a partial save without creating another nameless-identity customer', async () => {
    const snapshot = empty()
    const { repository, calls } = memoryRepository(snapshot)
    const other = [...vehicleRow]
    other[7] = '98-765-43'
    const o = options([vehicleHeaders, vehicleRow, other], 'vehicles')
    o.vehicleLinks = { 3: 'row:2' }
    calls.savePolicy.mockRejectedValueOnce(new Error('connection lost'))
    const first = await executeImport(
      repository,
      o,
      prepareImport(o, snapshot),
      vi.fn(),
      () => false,
    )
    expect(first).toMatchObject({ customers: 1, policies: 0 })
    const retry = await executeImport(
      repository,
      o,
      prepareImport(o, snapshot),
      vi.fn(),
      () => false,
    )
    expect(retry).toMatchObject({ customers: 0, policies: 2 })
    expect(calls.saveCustomer).toHaveBeenCalledTimes(1)
    expect(snapshot.policies[0].customer_id).toBe(snapshot.policies[1].customer_id)
    expect(prepareImport(o, snapshot).rows.map((r) => r.action)).toEqual(['skip', 'skip'])
  })
  it('supports a one-word customer name without a fabricated surname', () => {
    const single = [...vehicleRow]
    single[0] = 'בדיקה'
    const row = prepareImport(options([vehicleHeaders, single], 'vehicles'), empty()).rows[0]
    expect(row.action).toBe('ready')
    expect(row.customer?.last_name).toBe('')
  })
})
