import { read, utils, SSF } from 'xlsx'

export const MAX_IMPORT_ROWS = 10000
export const MAX_IMPORT_COLUMNS = 100
export interface ImportCell {
  text: string
  value: string | number
  date?: string
  error?: string
}
export interface ImportSheet {
  name: string
  rows: ImportCell[][]
}
export function readImportWorkbook(buffer: ArrayBuffer): ImportSheet[] {
  const book = read(buffer, {
    type: 'array',
    raw: true,
    cellDates: false,
    cellFormula: true,
    sheetRows: MAX_IMPORT_ROWS + 102,
  })
  if (book.SheetNames.length > 50) throw new Error('אפשר לייבא קובץ עם עד 50 גיליונות')
  return book.SheetNames.map((name) => {
    const sheet = book.Sheets[name]
    const range = utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1')
    if (range.e.r >= MAX_IMPORT_ROWS + 100 || range.e.c >= MAX_IMPORT_COLUMNS)
      throw new Error(
        `הגיליון ״${name}״ גדול מדי. עד 10,000 שורות נתונים ו־100 עמודות; פצלו את הקובץ.`,
      )
    const rows: ImportCell[][] = []
    for (let r = 0; r <= range.e.r; r++) {
      const row: ImportCell[] = []
      for (let c = 0; c <= range.e.c; c++) {
        const cell = sheet[utils.encode_cell({ r, c })]
        const value = cell?.v ?? ''
        const output: ImportCell = {
          value: typeof value === 'number' ? value : String(value),
          text: cell ? utils.format_cell(cell) || '' : '',
        }
        if (cell?.t === 'e' || (cell?.f && cell.v == null))
          output.error = 'תא עם שגיאת אקסל או נוסחה ללא ערך שמור; חשבו מחדש ושמרו באקסל'
        if (typeof value === 'number') {
          const date = SSF.parse_date_code(value, { date1904: !!book.Workbook?.WBProps?.date1904 })
          if (date)
            output.date = `${String(date.y).padStart(4, '0')}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
        }
        row.push(output)
      }
      rows.push(row)
    }
    return { name, rows }
  })
}
