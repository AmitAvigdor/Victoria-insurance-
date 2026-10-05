import { readImportWorkbook } from '@/domain/import-workbook'

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try {
    self.postMessage({ sheets: readImportWorkbook(event.data) })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'לא ניתן לקרוא את הקובץ' })
  }
}
