import { createContext, useContext, useState, type ReactNode, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import { ZodError } from 'zod'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { useAuth } from '@/app/auth'
import { useData, useRefresh } from '@/app/data'
import {
  insuranceTypes,
  policyStatuses,
  taskStatuses,
  priorities,
  fullName,
  type Customer,
  type Policy,
  type Task,
  type DocumentRecord,
} from '@/domain/types'
import { addDays, today } from '@/domain/dates'
import { errorMessage } from '@/lib/utils'
type Editor =
  | { kind: 'customer'; record?: Customer }
  | { kind: 'policy'; record?: Policy; customerId?: string }
  | { kind: 'task'; record?: Task; customerId?: string }
  | { kind: 'document'; customerId?: string }
  | { kind: 'archive'; record: Customer }
  | { kind: 'delete-document'; record: DocumentRecord }
const EditorsContext = createContext<(editor: Editor) => void>(() => {})
export const useEditors = () => useContext(EditorsContext)
function Field({
  label,
  children,
  wide = false,
}: {
  label: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <label className={`field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}
const Input = ({
  name,
  value = '',
  required = false,
  type = 'text',
  maxLength,
  ...rest
}: {
  name: string
  value?: string | number
  required?: boolean
  type?: string
  maxLength?: number
  min?: string
  step?: string
  dir?: 'rtl' | 'ltr'
  autoComplete?: string
}) => (
  <input
    className="field-control"
    name={name}
    defaultValue={value}
    required={required}
    type={type}
    maxLength={maxLength}
    {...rest}
  />
)
export function EditorsProvider({ children }: { children: ReactNode }) {
  const [editor, setEditor] = useState<Editor | null>(null)
  return (
    <EditorsContext.Provider value={setEditor}>
      {children}
      {editor && <EditorDialog editor={editor} close={() => setEditor(null)} />}
    </EditorsContext.Provider>
  )
}
function EditorDialog({ editor, close }: { editor: Editor; close: () => void }) {
  const { repository } = useAuth()
  const { data } = useData()
  const refresh = useRefresh()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const initialCustomer =
    editor.kind === 'policy' || editor.kind === 'task'
      ? editor.record?.customer_id || editor.customerId || ''
      : editor.kind === 'document'
        ? editor.customerId || ''
        : ''
  const [customerId, setCustomerId] = useState(initialCustomer || '')
  const [policyId, setPolicyId] = useState(
    editor.kind === 'task' ? editor.record?.policy_id || '' : '',
  )
  const [file, setFile] = useState<File | null>(null)
  const c = editor.kind === 'customer' ? editor.record : undefined
  const p = editor.kind === 'policy' ? editor.record : undefined
  const t = editor.kind === 'task' ? editor.record : undefined
  const titles = {
    customer: c ? 'עריכת לקוח' : 'לקוח חדש',
    policy: p ? 'פרטי פוליסה ועריכה' : 'פוליסה חדשה',
    task: t ? 'עריכת משימה' : 'משימה חדשה',
    document: 'העלאת מסמך',
    archive:
      'record' in editor && editor.kind === 'archive' && editor.record.archived_at
        ? 'שחזור לקוח'
        : 'העברה לארכיון',
    'delete-document': 'מחיקת מסמך',
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!repository) return
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const get = (name: string) => String(form.get(name) || '').trim()
    let newCustomer: string | undefined
    try {
      switch (editor.kind) {
        case 'customer': {
          const saved = await repository.saveCustomer(
            {
              first_name: get('first_name'),
              last_name: get('last_name'),
              identification_number: get('identification_number'),
              phone: get('phone'),
              email: get('email'),
              date_of_birth: get('date_of_birth') || null,
              address: get('address'),
              notes: get('notes'),
            },
            c?.id,
          )
          if (!c) newCustomer = saved.id
          break
        }
        case 'policy':
          await repository.savePolicy(
            {
              customer_id: customerId,
              insurance_company: get('insurance_company'),
              policy_number: get('policy_number'),
              insurance_type: get('insurance_type') as Policy['insurance_type'],
              start_date: get('start_date'),
              end_date: get('end_date'),
              premium: Number(get('premium')),
              status: get('status') as Policy['status'],
              notes: get('notes'),
            },
            p?.id,
          )
          break
        case 'task':
          await repository.saveTask(
            {
              customer_id: customerId || null,
              policy_id: policyId || null,
              title: get('title'),
              description: get('description'),
              due_date: get('due_date'),
              priority: get('priority') as Task['priority'],
              status: get('status') as Task['status'],
            },
            t?.id,
          )
          break
        case 'document':
          if (!file) throw new Error('יש לבחור קובץ')
          await repository.uploadDocument(file, customerId, policyId || null, get('document_type'))
          break
        case 'archive':
          await repository.archiveCustomer(editor.record.id, !editor.record.archived_at)
          break
        case 'delete-document':
          await repository.deleteDocument(editor.record)
          break
      }
      await refresh()
      toast.success(editor.kind === 'delete-document' ? 'המסמך נמחק' : 'השינויים נשמרו בהצלחה')
      close()
      if (newCustomer) navigate(`/customers/${newCustomer}`)
    } catch (e) {
      setError(e instanceof ZodError ? e.issues[0].message : errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const customerSelect = (
    <Field label="לקוח *" wide>
      <select
        aria-label="לקוח"
        className="field-control"
        value={customerId}
        required
        disabled={!!p}
        onChange={(e) => {
          setCustomerId(e.target.value)
          setPolicyId('')
        }}
      >
        <option value="">בחירת לקוח</option>
        {data?.customers
          .filter((c) => !c.archived_at || c.id === customerId)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {fullName(c)}
            </option>
          ))}
      </select>
    </Field>
  )
  const optionalCustomerSelect = (
    <Field label="לקוח" wide>
      <select
        aria-label="לקוח"
        className="field-control"
        value={customerId}
        onChange={(e) => {
          setCustomerId(e.target.value)
          setPolicyId('')
        }}
      >
        <option value="">ללא שיוך ללקוח</option>
        {data?.customers
          .filter((c) => !c.archived_at || c.id === customerId)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {fullName(c)}
            </option>
          ))}
      </select>
    </Field>
  )
  const policySelect = (
    <Field label="פוליסה משויכת" wide>
      <select
        className="field-control"
        value={policyId}
        disabled={!customerId}
        onChange={(e) => setPolicyId(e.target.value)}
      >
        <option value="">ללא שיוך לפוליסה</option>
        {data?.policies
          .filter((p) => p.customer_id === customerId)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.insurance_type} · {p.insurance_company} · {p.policy_number}
            </option>
          ))}
      </select>
    </Field>
  )
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close()
      }}
      title={titles[editor.kind]}
      description={
        editor.kind === 'document'
          ? 'קבצים נשמרים בגישה פרטית לסוכנות. PDF, תמונות או DOCX, עד 10MB.'
          : editor.kind === 'customer'
            ? 'כל הפרטים שצריך כדי לתת שירות אישי. שדות עם * הם חובה.'
            : undefined
      }
    >
      <form onSubmit={submit}>
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="form-grid">
            {editor.kind === 'customer' && (
              <>
                <Field label="שם פרטי *">
                  <Input name="first_name" value={c?.first_name} required maxLength={80} />
                </Field>
                <Field label="שם משפחה *">
                  <Input name="last_name" value={c?.last_name} required maxLength={80} />
                </Field>
                <Field label="מספר זהות *">
                  <Input
                    name="identification_number"
                    value={c?.identification_number}
                    required
                    maxLength={9}
                    dir="ltr"
                  />
                </Field>
                <Field label="טלפון *">
                  <Input
                    name="phone"
                    value={c?.phone}
                    required
                    type="tel"
                    maxLength={25}
                    dir="ltr"
                  />
                </Field>
                <Field label="אימייל">
                  <Input name="email" value={c?.email} type="email" maxLength={254} dir="ltr" />
                </Field>
                <Field label="תאריך לידה">
                  <Input name="date_of_birth" value={c?.date_of_birth || ''} type="date" />
                </Field>
                <Field label="כתובת" wide>
                  <Input name="address" value={c?.address} maxLength={300} />
                </Field>
                <Field label="הערות" wide>
                  <textarea
                    className="field-control"
                    name="notes"
                    defaultValue={c?.notes}
                    maxLength={5000}
                  />
                </Field>
              </>
            )}
            {editor.kind === 'policy' && (
              <>
                {customerSelect}
                <Field label="חברת ביטוח *">
                  <Input
                    name="insurance_company"
                    value={p?.insurance_company}
                    required
                    maxLength={100}
                  />
                </Field>
                <Field label="מספר פוליסה *">
                  <Input
                    name="policy_number"
                    value={p?.policy_number}
                    required
                    maxLength={100}
                    dir="ltr"
                  />
                </Field>
                <Field label="סוג ביטוח">
                  <select
                    name="insurance_type"
                    className="field-control"
                    defaultValue={p?.insurance_type || 'רכב'}
                  >
                    {insuranceTypes.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="סטטוס">
                  <select
                    name="status"
                    className="field-control"
                    defaultValue={p?.status || 'פעילה'}
                  >
                    {policyStatuses.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="תאריך התחלה *">
                  <Input name="start_date" value={p?.start_date || today()} required type="date" />
                </Field>
                <Field label="תאריך סיום *">
                  <Input name="end_date" value={p?.end_date || addDays(365)} required type="date" />
                </Field>
                <Field label="פרמיה שנתית (₪) *" wide>
                  <Input
                    name="premium"
                    value={p?.premium ?? ''}
                    required
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </Field>
                <Field label="הערות" wide>
                  <textarea
                    name="notes"
                    className="field-control"
                    defaultValue={p?.notes}
                    maxLength={5000}
                  />
                </Field>
              </>
            )}
            {editor.kind === 'task' && (
              <>
                <Field label="כותרת המשימה *" wide>
                  <Input name="title" value={t?.title} required maxLength={200} />
                </Field>
                {optionalCustomerSelect}
                {policySelect}
                <Field label="תאריך יעד *">
                  <Input name="due_date" value={t?.due_date || today()} required type="date" />
                </Field>
                <Field label="עדיפות">
                  <select
                    className="field-control"
                    name="priority"
                    defaultValue={t?.priority || 'רגילה'}
                  >
                    {priorities.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="סטטוס" wide>
                  <select
                    className="field-control"
                    name="status"
                    defaultValue={t?.status || 'פתוחה'}
                  >
                    {taskStatuses.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="תיאור" wide>
                  <textarea
                    className="field-control"
                    name="description"
                    defaultValue={t?.description}
                    maxLength={5000}
                  />
                </Field>
              </>
            )}
            {editor.kind === 'document' && (
              <>
                {customerSelect}
                {policySelect}
                <Field label="סוג מסמך *" wide>
                  <select className="field-control" name="document_type" required>
                    <option>פוליסה</option>
                    <option>טופס הצטרפות</option>
                    <option>הצעה</option>
                    <option>אישור</option>
                    <option>אחר</option>
                  </select>
                </Field>
                <label className="upload-zone field wide">
                  <UploadCloud size={28} />
                  <span>בחירת מסמך מהמחשב</span>
                  <input
                    aria-label="קובץ להעלאה"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.docx"
                    required
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <span className="small">
                    {file
                      ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB`
                      : 'עד 10MB לכל קובץ'}
                  </span>
                </label>
              </>
            )}
            {editor.kind === 'archive' && (
              <p className="field wide">
                {editor.record.archived_at
                  ? 'הלקוח יוחזר לרשימת הלקוחות הפעילים.'
                  : 'הלקוח יוסר מהרשימה הפעילה. הפוליסות, המסמכים וההיסטוריה יישמרו ויהיה אפשר לשחזר אותו מהארכיון.'}
              </p>
            )}
            {editor.kind === 'delete-document' && (
              <p className="field wide">
                למחוק את ״{editor.record.file_name}״? הקובץ יימחק לצמיתות ולא ניתן יהיה לשחזר אותו.
              </p>
            )}
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="form-actions">
            <Button type="button" variant="outline" onClick={close}>
              ביטול
            </Button>
            <Button
              type="submit"
              variant={editor.kind === 'delete-document' ? 'destructive' : 'default'}
            >
              {busy
                ? 'שומר…'
                : editor.kind === 'document'
                  ? 'העלאת מסמך'
                  : editor.kind === 'delete-document'
                    ? 'מחיקת מסמך'
                    : editor.kind === 'archive'
                      ? editor.record.archived_at
                        ? 'שחזור לקוח'
                        : 'העברה לארכיון'
                      : 'שמירה'}
            </Button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  )
}
