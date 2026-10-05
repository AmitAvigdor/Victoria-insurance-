import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileSpreadsheet, Upload, Download, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/app/auth'
import { useRefresh } from '@/app/data'
import { Badge, Heading, Paginated } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import {
  fieldsFor,
  headersFor,
  importModes,
  prepareImport,
  suggestMapping,
  type ImportMode,
  type ImportOptions,
  type ImportPlan,
  type Mapping,
} from '@/domain/import'
import type { ImportSheet } from '@/domain/import-workbook'
import { executeImport, type ImportResult } from '@/services/import'
import { errorMessage } from '@/lib/utils'

const emptyPlan: ImportPlan = { rows: [], errors: [] }
export default function ImportPage() {
  const { repository } = useAuth()
  const refresh = useRefresh()
  const [sheets, setSheets] = useState<ImportSheet[]>([])
  const [sheetIndex, setSheetIndex] = useState(0)
  const [headerRow, setHeaderRow] = useState(0)
  const [fileName, setFileName] = useState('')
  const [mode, setMode] = useState<ImportMode>('customers')
  const [mapping, setMapping] = useState<Mapping>({})
  const [keepExtra, setKeepExtra] = useState(true)
  const [step, setStep] = useState<'configure' | 'preview' | 'result'>('configure')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<ImportPlan>(emptyPlan)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [progress, setProgress] = useState([0, 0])
  const [stopping, setStopping] = useState(false)
  const cancel = useRef(false)
  const workerRef = useRef<Worker | null>(null)
  const busyRef = useRef(false)
  useEffect(
    () => () => {
      workerRef.current?.terminate()
      cancel.current = true
    },
    [],
  )
  useEffect(() => {
    if (!busy) return
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [busy])
  const sheet = sheets[sheetIndex]
  const headers = useMemo(() => (sheet ? headersFor(sheet, headerRow) : []), [sheet, headerRow])
  const extras = headers.filter((_, i) => !Object.values(mapping).includes(i))
  const options: ImportOptions | undefined = sheet
    ? { sheet, headerRow, mode, mapping, keepExtra }
    : undefined
  const ready = plan.rows.filter((row) => row.action === 'ready')
  const invalid = plan.rows.filter((row) => row.action === 'error').length
  const skipped = plan.rows.filter((row) => row.action === 'skip').length

  function selectSheet(index: number, header = 0, nextMode = mode) {
    const selected = sheets[index]
    setSheetIndex(index)
    setHeaderRow(header)
    setMode(nextMode)
    setMapping(suggestMapping(headersFor(selected, header), nextMode))
    setError('')
    setConfirmed(false)
  }
  async function readFile(file?: File) {
    if (!file) return
    workerRef.current?.terminate()
    setError('')
    setSheets([])
    setResult(null)
    setStep('configure')
    setPlan(emptyPlan)
    setConfirmed(false)
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError('בחרו קובץ XLSX, XLS או CSV')
      return
    }
    if (!file.size || file.size > 10 * 1024 * 1024) {
      setError('יש לבחור קובץ שאינו ריק, עד 10MB')
      return
    }
    setReading(true)
    setFileName(file.name)
    try {
      const worker = new Worker(new URL('../services/import-worker.ts', import.meta.url), {
        type: 'module',
      })
      workerRef.current = worker
      const buffer = await file.arrayBuffer()
      const parsed = await new Promise<ImportSheet[]>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          worker.terminate()
          reject(new Error('קריאת הקובץ ארכה זמן רב. פצלו אותו לקבצים קטנים יותר.'))
        }, 30000)
        worker.onmessage = (event: MessageEvent<{ sheets?: ImportSheet[]; error?: string }>) => {
          clearTimeout(timeout)
          if (event.data.error) reject(new Error(event.data.error))
          else resolve(event.data.sheets || [])
        }
        worker.onerror = () => {
          clearTimeout(timeout)
          reject(new Error('לא ניתן לקרוא את הקובץ. נסו לשמור אותו כ־XLSX ולבחור שוב.'))
        }
        worker.postMessage(buffer, [buffer])
      })
      worker.terminate()
      if (!parsed.length) throw new Error('הקובץ אינו מכיל גיליונות')
      setSheets(parsed)
      setSheetIndex(0)
      const firstHeader = Math.max(
        0,
        parsed[0].rows.findIndex((row) => row.some((cell) => cell.text.trim())),
      )
      setHeaderRow(firstHeader)
      setMapping(suggestMapping(headersFor(parsed[0], firstHeader), mode))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setReading(false)
    }
  }
  async function preview() {
    if (!options || !repository || busyRef.current) return
    busyRef.current = true
    setReviewing(true)
    setError('')
    try {
      const snapshot = await repository.load()
      setPlan(prepareImport(options, snapshot))
      setConfirmed(false)
      setStep('preview')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      busyRef.current = false
      setReviewing(false)
    }
  }
  async function run() {
    if (!options || !repository || !confirmed || !ready.length || busyRef.current) return
    busyRef.current = true
    cancel.current = false
    setBusy(true)
    setStopping(false)
    setError('')
    setProgress([0, plan.rows.length])
    try {
      const output = await executeImport(
        repository,
        options,
        plan,
        (done, total) => setProgress([done, total]),
        () => cancel.current,
      )
      setResult(output)
      setStep('result')
      setConfirmed(false)
    } catch (e) {
      setError(errorMessage(e))
      setConfirmed(false)
    } finally {
      try {
        await refresh()
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    }
  }
  function downloadReport() {
    if (!result) return
    const escape = (text: string) =>
      `"${(/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`
    const text =
      '\uFEFF' +
      [
        ['שורה באקסל', 'תוצאה', 'פירוט'],
        ...result.rows.map((r) => [String(r.rowNumber), r.status, r.detail]),
      ]
        .map((row) => row.map(escape).join(','))
        .join('\r\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'victoria-import-report.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <>
      <Heading
        title="ייבוא מאקסל"
        subtitle="העברת הלקוחות והמידע שלכם לוויקטוריה, עם בדיקה לפני השמירה."
        actions={
          <Button variant="outline" asChild>
            <Link to="/customers">
              <ArrowRight size={16} />
              ללקוחות
            </Link>
          </Button>
        }
      />
      <ol className="import-steps" aria-label="שלבי הייבוא">
        {['בחירת קובץ והתאמת עמודות', 'בדיקה ואישור', 'תוצאות הייבוא'].map((label, i) => (
          <li
            key={label}
            aria-current={['configure', 'preview', 'result'][i] === step ? 'step' : undefined}
          >
            <span>{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      {step === 'configure' && (
        <section className="panel import-panel">
          <h2>
            <FileSpreadsheet size={21} /> מתחילים מהקובץ שלכם
          </h2>
          <p className="muted">
            XLSX, XLS או CSV · עד 10MB ו־10,000 שורות נתונים בכל גיליון. מייבאים גיליון אחד בכל פעם.
          </p>
          <label className="upload-zone field">
            <Upload size={27} />
            <span>{reading ? 'קורא את הקובץ…' : 'בחירת קובץ אקסל'}</span>
            <input
              type="file"
              aria-label="קובץ אקסל לייבוא"
              accept=".xlsx,.xls,.csv"
              disabled={reading || reviewing}
              onChange={(e) => {
                void readFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {fileName && <span className="small import-filename">{fileName}</span>}
          </label>
          <p className="small muted">
            הקובץ נקרא במכשיר שלכם. הנתונים יישמרו בסוכנות רק לאחר האישור בשלב הבא. תמונות וקבצים
            המצורפים לאקסל אינם מיובאים כמסמכים.
          </p>
          {sheet && (
            <fieldset disabled={reviewing} className="import-fieldset">
              <div className="form-grid">
                <label className="field">
                  <span>גיליון</span>
                  <select
                    aria-label="גיליון"
                    className="field-control"
                    value={sheetIndex}
                    onChange={(e) => selectSheet(Number(e.target.value))}
                  >
                    {sheets.map((s, i) => (
                      <option key={i} value={i}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>סוג הנתונים</span>
                  <select
                    aria-label="סוג הנתונים"
                    className="field-control"
                    value={mode}
                    onChange={(e) =>
                      selectSheet(sheetIndex, headerRow, e.target.value as ImportMode)
                    }
                  >
                    {Object.entries(importModes).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>מספר שורת הכותרות באקסל</span>
                  <input
                    type="number"
                    min={1}
                    max={Math.min(sheet.rows.length, 100)}
                    className="field-control"
                    value={headerRow + 1}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      if (n >= 1 && n <= Math.min(sheet.rows.length, 100))
                        selectSheet(sheetIndex, n - 1)
                    }}
                  />
                </label>
              </div>
              <h2 className="import-section-title">התאמת העמודות</h2>
              <p className="muted">
                זיהינו שמות מוכרים. בדקו שכל שדה מקבל את העמודה הנכונה. שם מלא מפוצל במילה הראשונה;
                אפשר לשייך שם פרטי ומשפחה בנפרד.
              </p>
              <p className="small">
                לקוח חדש דורש שם פרטי, שם משפחה, מספר זהות וטלפון. פוליסה דורשת חברה, מספר, סוג
                ביטוח, תאריכי התחלה וסיום ופרמיה שנתית. תאריכים: יום/חודש/שנה או YYYY-MM-DD. משימה
                דורשת כותרת ותאריך יעד.
              </p>
              <div className="import-mapping">
                {fieldsFor(mode).map(([key, label]) => (
                  <label className="field" key={key}>
                    <span>{label}</span>
                    <select
                      aria-label={label}
                      aria-describedby={`sample-${key}`}
                      className="field-control"
                      value={mapping[key] ?? ''}
                      onChange={(e) =>
                        setMapping((previous) => {
                          const next = { ...previous }
                          if (e.target.value === '') delete next[key]
                          else next[key] = Number(e.target.value)
                          return next
                        })
                      }
                    >
                      <option value="">ללא עמודה</option>
                      {headers.map((header, i) => (
                        <option
                          key={i}
                          value={i}
                          disabled={Object.entries(mapping).some(([k, v]) => k !== key && v === i)}
                        >
                          {i + 1}. {header}
                        </option>
                      ))}
                    </select>
                    <small className="import-sample" id={`sample-${key}`}>
                      דוגמה:{' '}
                      {sheet.rows.slice(headerRow + 1).find((r) => r[mapping[key]]?.text.trim())?.[
                        mapping[key]
                      ]?.text || '—'}
                    </small>
                  </label>
                ))}
              </div>
              {extras.length > 0 && (
                <div className="import-note">
                  <label className="import-check">
                    <input
                      type="checkbox"
                      checked={keepExtra}
                      onChange={(e) => setKeepExtra(e.target.checked)}
                    />
                    שמירת עמודות נוספות בהערות{' '}
                    {mode === 'policies' ? 'הפוליסה' : mode === 'tasks' ? 'המשימה' : 'הלקוח החדש'}
                  </label>
                  <p className="small">{extras.join(' · ')}</p>
                  {!keepExtra && <p>המידע בעמודות האלו לא יישמר.</p>}
                </div>
              )}
              <div className="form-actions">
                <Button onClick={() => void preview()} disabled={reviewing}>
                  {reviewing ? 'בודק נתונים…' : 'בדיקה ותצוגה מקדימה'}
                </Button>
              </div>
            </fieldset>
          )}
        </section>
      )}
      {step === 'preview' && (
        <section className="panel import-panel">
          <h2>בדיקה לפני השמירה</h2>
          <p className="muted">
            {fileName} · {sheet?.name} · {plan.rows.length} שורות
          </p>
          <div className="import-summary">
            <Badge tone="success">{ready.length} שורות מוכנות</Badge>
            <Badge tone="danger">{invalid} שורות עם שגיאות</Badge>
            <Badge>{skipped} שורות לדילוג</Badge>
          </div>
          <p>
            {ready.filter((r) => r.customer).length} לקוחות חדשים ·{' '}
            {ready.filter((r) => r.policy).length} פוליסות חדשות ·{' '}
            {ready.filter((r) => r.task).length} משימות חדשות
          </p>
          <p className="import-note">
            רשומות קיימות לא יעודכנו. לקוחות מזוהים לפי מספר זהות; פוליסות לפי חברה ומספר פוליסה;
            משימות לפי לקוח, כותרת ותאריך יעד. שורות עם שגיאות לא יישמרו. לתיקון, עדכנו את הקובץ
            ובחרו אותו שוב.
          </p>
          {plan.errors.map((message) => (
            <div className="form-error" role="alert" key={message}>
              {message}
            </div>
          ))}
          <Paginated items={plan.rows} pageSize={20}>
            {(rows) => (
              <div className="table-wrap">
                <table className="import-table">
                  <thead>
                    <tr>
                      <th>שורה</th>
                      <th>לקוח / מספר זהות</th>
                      <th>תוצאה צפויה</th>
                      <th>פירוט</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>
                          {row.name}
                          <br />
                          <span className="ltr">{row.identification}</span>
                        </td>
                        <td>
                          <Badge
                            tone={
                              row.action === 'ready'
                                ? 'success'
                                : row.action === 'error'
                                  ? 'danger'
                                  : 'neutral'
                            }
                          >
                            {row.action === 'ready'
                              ? 'מוכן לייבוא'
                              : row.action === 'error'
                                ? 'נדרש תיקון'
                                : 'דילוג'}
                          </Badge>
                        </td>
                        <td>
                          {[...row.errors, ...row.warnings].map((message, i) => (
                            <p key={i}>{message}</p>
                          ))}
                          <details>
                            <summary>
                              {row.action === 'ready' ? 'הנתונים שיישמרו' : 'פרטים לבדיקה'}
                            </summary>
                            {row.action !== 'ready' && <p>לא יישמרו נתונים משורה זו.</p>}
                            {[
                              { title: 'לקוח חדש', values: row.customer },
                              { title: 'פוליסה חדשה', values: row.policy },
                              { title: 'משימה חדשה', values: row.task },
                            ].map(
                              ({ title, values }) =>
                                values && (
                                  <section key={title}>
                                    <h3>{title}</h3>
                                    <dl className="import-details">
                                      {Object.entries(values).map(([key, value]) => (
                                        <div key={key}>
                                          <dt>
                                            {{ status: 'סטטוס', notes: 'הערות' }[key] ||
                                              fieldsFor(mode).find(([k]) => k === key)?.[1] ||
                                              key}
                                          </dt>
                                          <dd>{value === '' || value == null ? '—' : value}</dd>
                                        </div>
                                      ))}
                                    </dl>
                                  </section>
                                ),
                            )}
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Paginated>
          {ready.length > 0 && !plan.errors.length && (
            <label className="import-check import-note">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              בדקתי את ההתאמה ואת הנתונים. אני מאשר לייבא {ready.length} שורות מוכנות ולדלג על{' '}
              {invalid + skipped} שורות אחרות.
            </label>
          )}
          <div className="form-actions">
            <Button
              variant="outline"
              onClick={() => {
                setStep('configure')
                setError('')
              }}
            >
              חזרה להתאמה
            </Button>
            <Button
              disabled={!confirmed || !ready.length || !!plan.errors.length || busy}
              onClick={() => void run()}
            >
              ייבוא הנתונים
            </Button>
          </div>
        </section>
      )}
      {step === 'result' && result && (
        <section className="panel import-panel">
          <h2>
            <CheckCircle2 size={22} />
            {result.rows.some((r) => ['שגיאה', 'לא בוצע'].includes(r.status))
              ? 'הייבוא הסתיים באופן חלקי'
              : 'בדיקת תוצאות הייבוא'}
          </h2>
          <p role="status">
            נשמרו {result.customers} לקוחות, {result.policies} פוליסות ו־{result.tasks} משימות.
          </p>
          <p className="muted">
            רשומות שנשמרו זמינות כעת במערכת. אפשר להוריד דוח עם התוצאה של כל שורה. בייבוא נוסף
            רשומות שכבר קיימות ידולגו.
          </p>
          <Paginated items={result.rows} pageSize={20}>
            {(rows) => (
              <div className="table-wrap">
                <table className="import-table">
                  <thead>
                    <tr>
                      <th>שורה באקסל</th>
                      <th>תוצאה</th>
                      <th>פירוט</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.rowNumber}>
                        <td>{r.rowNumber}</td>
                        <td>{r.status}</td>
                        <td>{r.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Paginated>
          <div className="form-actions">
            <Button variant="outline" onClick={downloadReport}>
              <Download size={16} />
              הורדת דוח ייבוא
            </Button>
            <Button
              onClick={() => {
                setStep('configure')
                setPlan(emptyPlan)
                setError('')
              }}
            >
              ייבוא נוסף / ניסיון חוזר
            </Button>
          </div>
        </section>
      )}
      <Dialog
        open={busy}
        onOpenChange={() => {}}
        title="מייבא נתונים"
        description="השאירו את העמוד פתוח עד לסיום. אפשר לעצור אחרי שמירת השורה הנוכחית."
      >
        <p role="status">
          {progress[0]} מתוך {progress[1]} שורות נבדקו
        </p>
        <progress className="import-progress" value={progress[0]} max={progress[1] || 1} />
        <Button
          variant="outline"
          disabled={stopping}
          onClick={() => {
            cancel.current = true
            setStopping(true)
          }}
        >
          {stopping ? 'עוצר לאחר השורה הנוכחית…' : 'עצירת הייבוא'}
        </Button>
      </Dialog>
    </>
  )
}
