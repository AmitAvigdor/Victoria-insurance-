import { describe, expect, it } from 'vitest'
import { read, utils, SSF, type WorkBook } from 'xlsx'
import { createDemoData, demoAgencyId } from '@/services/demo-seed'
import {
  buildExportWorkbook,
  createExportBuffer,
  exportScope,
  exportSections,
  type ExportOptions,
} from './export'
import { readImportWorkbook } from './import-workbook'

const options: ExportOptions = {
  agencyId: demoAgencyId,
  includeArchived: false,
  sections: exportSections.map((s) => s.key),
}
function saved(data = createDemoData(), opts = options): WorkBook {
  return read(createExportBuffer(data, opts), { type: 'array', cellNF: true })
}
describe('Excel export confidentiality and data integrity', () => {
  it('omits foreign-agency rows and never joins names across agencies', () => {
    const data = createDemoData()
    const foreign = 'foreign-agency'
    const foreignCustomer = {
      ...data.customers[0],
      id: 'foreign-customer',
      agency_id: foreign,
      notes: 'FOREIGN SECRET',
    }
    data.customers.push(foreignCustomer)
    data.policies.push({
      ...data.policies[0],
      id: 'foreign-policy',
      agency_id: foreign,
      customer_id: foreignCustomer.id,
    })
    data.policies.push({ ...data.policies[0], id: 'invalid-link', customer_id: foreignCustomer.id })
    data.tasks.push({ ...data.tasks[0], id: 'foreign-task', agency_id: foreign })
    data.documents.push({ ...data.documents[0], id: 'foreign-doc', agency_id: foreign })
    data.activities.push({ ...data.activities[0], id: 'foreign-activity', agency_id: foreign })
    const scope = exportScope(data, options)
    for (const rows of Object.values(scope))
      expect(rows.every((row: { agency_id: string }) => row.agency_id === demoAgencyId)).toBe(true)
    expect(scope.policies.some((p) => p.id === 'invalid-link')).toBe(false)
    expect(JSON.stringify(saved(data))).not.toContain('FOREIGN SECRET')
  })
  it('applies the archive option to the customer and all related records', () => {
    const data = createDemoData()
    const id = data.customers[0].id
    data.customers[0].archived_at = new Date().toISOString()
    const scope = exportScope(data, options)
    expect(scope.customers.some((c) => c.id === id)).toBe(false)
    for (const rows of [scope.policies, scope.tasks, scope.documents, scope.activities])
      expect(rows.some((row) => row.customer_id === id)).toBe(false)
    const restored = exportScope(data, { ...options, includeArchived: true })
    expect(restored.customers).toHaveLength(data.customers.length)
    expect(restored.policies).toHaveLength(data.policies.length)
    expect(saved(data, { ...options, includeArchived: true }).Sheets['לקוחות'].K2.v).toBe('כן')
  })
  it('preserves leading zeroes, Hebrew, multiline notes and formula-like text as literal strings', () => {
    const data = createDemoData()
    data.customers[0].identification_number = '000009990'
    data.customers[0].phone = '+972500009990'
    data.customers[0].notes = '=HYPERLINK("https://example.invalid","פתיחה")\nשורה שנייה'
    data.policies[0].policy_number = '-00123'
    data.policies[0].commission = '@SUM(1,2)'
    const book = saved(data)
    expect(book.Sheets['לקוחות'].E2).toMatchObject({ t: 's', v: '000009990' })
    expect(book.Sheets['לקוחות'].F2).toMatchObject({ t: 's', v: '+972500009990' })
    expect(book.Sheets['לקוחות'].J2).toMatchObject({ t: 's', v: data.customers[0].notes })
    expect(book.Sheets['פוליסות'].F2).toMatchObject({ t: 's', v: '-00123' })
    for (const sheet of Object.values(book.Sheets))
      for (const [address, cell] of Object.entries(sheet))
        if (!address.startsWith('!')) {
          expect(cell.f).toBeUndefined()
          expect(cell.l).toBeUndefined()
        }
  })
  it('keeps calendar dates sortable and unchanged at Israel DST boundaries', () => {
    const data = createDemoData()
    data.policies[0].start_date = '2026-03-27'
    data.policies[0].end_date = '2026-10-25'
    const book = saved(data)
    for (const [address, day, month] of [
      ['H2', 27, 3],
      ['I2', 25, 10],
    ] as const) {
      const cell = book.Sheets['פוליסות'][address]
      expect(cell.t).toBe('n')
      expect(cell.z).toBe('dd/mm/yyyy')
      expect(SSF.parse_date_code(cell.v)).toMatchObject({ y: 2026, m: month, d: day, H: 0 })
    }
  })
  it('distinguishes missing amounts from zero and preserves commission percentages as entered', () => {
    const data = createDemoData()
    Object.assign(data.policies[0], {
      premium: null,
      commission: '12%',
      commission_expected_amount: null,
      commission_received_amount: 0,
    })
    Object.assign(data.policies[1], {
      premium: 0,
      commission_expected_amount: 150.25,
      commission_received_amount: 10.1,
    })
    const book = saved(data)
    expect(book.Sheets['פוליסות'].J2).toBeUndefined()
    expect(book.Sheets['פוליסות'].J3).toMatchObject({ t: 'n', v: 0 })
    expect(book.Sheets['עמלות'].G2.v).toBe('12%')
    expect(book.Sheets['עמלות'].I2).toBeUndefined()
    expect(book.Sheets['עמלות'].K2).toBeUndefined()
    expect(book.Sheets['עמלות'].J2).toMatchObject({ t: 'n', v: 0 })
    expect(book.Sheets['עמלות'].K3.v).toBeCloseTo(140.15, 2)
    expect(book.Sheets['עמלות'].I3.v).toBe(150.25)
  })
  it('exports the original ten-column vehicle layout with all source fields preserved', () => {
    const data = createDemoData()
    Object.assign(data.policies[0], {
      vehicle_registration: '01234567',
      compulsory_value: '1,200',
      comprehensive_value: 'יש כיסוי',
      commission: '12%',
      notes: 'הערה\nעמודה 7: ערך מקורי',
    })
    const buffer = createExportBuffer(data, { ...options, sections: ['vehicles'] })
    const [sheet] = readImportWorkbook(buffer)
    expect(sheet.name).toBe('ביטוחי רכב')
    expect(sheet.rows[0].map((c) => c.text)).toEqual([
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
    ])
    expect(sheet.rows[1][7].text).toBe('01234567')
    expect(sheet.rows[1][4].text).toBe('1,200')
    expect(sheet.rows[1][5].text).toBe('יש כיסוי')
    expect(sheet.rows[1][9].text).toBe(data.policies[0].notes)
    expect(sheet.rows[1][2].date).toBe(data.policies[0].start_date)
  })
  it('exports only requested sheets with headers even when there are no records', () => {
    const data = { customers: [], policies: [], tasks: [], documents: [], activities: [] }
    const book = saved(data, { ...options, sections: ['customers', 'tasks'] })
    expect(book.SheetNames).toEqual(['לקוחות', 'משימות'])
    expect(utils.decode_range(book.Sheets['לקוחות']['!ref']!).e.r).toBe(0)
    expect(book.Sheets['לקוחות']['!autofilter']).toBeDefined()
    expect(book.Workbook?.Views?.[0].RTL).toBe(true)
  })
  it('excludes deleted files, storage paths and uploader identities from document exports', () => {
    const data = createDemoData()
    data.documents.push({
      id: 'document',
      agency_id: demoAgencyId,
      customer_id: data.customers[0].id,
      policy_id: null,
      file_name: 'fictional.pdf',
      document_type: 'פוליסה',
      file_path: 'PRIVATE STORAGE PATH',
      uploaded_by: 'PRIVATE UPLOADER',
      uploaded_at: '2026-10-07T10:00:00.000Z',
      file_size: 100,
      mime_type: 'application/pdf',
    })
    data.documents.push({
      ...data.documents[0],
      id: 'deleted',
      file_name: 'DELETED SECRET',
      deleted_at: new Date().toISOString(),
    })
    const book = saved(data, { ...options, sections: ['documents'] })
    const contents = JSON.stringify(book)
    expect(contents).not.toContain('PRIVATE STORAGE PATH')
    expect(contents).not.toContain('PRIVATE UPLOADER')
    expect(contents).not.toContain('DELETED SECRET')
    expect(contents).toContain(data.documents[0].file_name)
  })
  it('rejects empty selections, missing identity and invalid values instead of creating partial exports', () => {
    const data = createDemoData()
    expect(() => buildExportWorkbook(data, { ...options, sections: [] })).toThrow()
    expect(() => buildExportWorkbook(data, { ...options, agencyId: '' })).toThrow()
    data.policies[0].premium = Number.NaN
    expect(() => saved(data)).toThrow()
    data.policies[0].premium = 0
    data.policies[0].end_date = '2026-02-30'
    expect(() => saved(data)).toThrow()
  })
})
