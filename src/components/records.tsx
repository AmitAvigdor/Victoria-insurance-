import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Pencil, Eye, Download, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useData, useRefresh } from '@/app/data'
import { useAuth } from '@/app/auth'
import { useEditors } from './editors'
import { Badge, CustomerLink, Empty, InsuranceLabel, Paginated, Status } from './shared'
import { Button } from './ui/button'
import { fullName, type Policy, type Task, type DocumentRecord } from '@/domain/types'
import { daysUntil, formatDate, money, today } from '@/domain/dates'
import { isOverdue } from '@/domain/selectors'
import { errorMessage } from '@/lib/utils'
export function PoliciesTable({
  policies,
  renewal = false,
  compact = false,
}: {
  policies: Policy[]
  renewal?: boolean
  compact?: boolean
}) {
  const { data } = useData()
  const edit = useEditors()
  return (
    <Paginated
      items={policies}
      pageSize={compact ? 6 : 10}
      empty={<Empty title={renewal ? 'אין חידושים בתקופה שנבחרה' : 'אין פוליסות להצגה'} />}
    >
      {(rows) => (
        <div className={`table-wrap ${compact ? 'compact-table' : ''}`}>
          <table>
            <thead>
              <tr>
                <th>לקוח</th>
                <th>סוג ביטוח</th>
                <th>חברה</th>
                {!compact && <th>מספר פוליסה</th>}
                <th>תום תקופה</th>
                {renewal ? <th>ימים לחידוש</th> : <th>פרמיה שנתית</th>}
                <th>סטטוס</th>
                {renewal && !compact && <th>טלפון</th>}
                {!compact && (
                  <th>
                    <span className="sr-only">פעולות</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const customer = data?.customers.find((c) => c.id === p.customer_id)
                const days = daysUntil(p.end_date)
                return (
                  <tr key={p.id}>
                    <td>
                      <CustomerLink customer={customer} />
                    </td>
                    <td>
                      <InsuranceLabel type={p.insurance_type} />
                    </td>
                    <td>{p.insurance_company}</td>
                    {!compact && (
                      <td>
                        <button
                          className="text-link"
                          onClick={() => edit({ kind: 'policy', record: p })}
                        >
                          {p.policy_number ||
                            (p.vehicle_registration
                              ? `רכב ${p.vehicle_registration}`
                              : 'ללא מספר פוליסה')}
                        </button>
                        {p.policy_number && p.vehicle_registration && (
                          <div className="small">רישוי: {p.vehicle_registration}</div>
                        )}
                        {(p.compulsory_value || p.comprehensive_value || p.commission) && (
                          <details className="small">
                            <summary>חובה, מקיף ועמלה</summary>
                            <p>חובה: {p.compulsory_value || 'לא צוין'}</p>
                            <p>מקיף: {p.comprehensive_value || 'לא צוין'}</p>
                            <p>עמלה: {p.commission || 'לא צוינה'}</p>
                          </details>
                        )}
                      </td>
                    )}
                    <td>
                      <span className="ltr">{formatDate(p.end_date)}</span>
                    </td>
                    {renewal ? (
                      <td>
                        <Badge tone={days < 0 ? 'danger' : days <= 7 ? 'warning' : 'neutral'}>
                          {days < 0
                            ? `לפני ${Math.abs(days)} ימים`
                            : days === 0
                              ? 'היום'
                              : `${days} ימים`}
                        </Badge>
                      </td>
                    ) : (
                      <td>{money(p.premium)}</td>
                    )}
                    <td>
                      <Status status={p.status} />
                    </td>
                    {renewal && !compact && (
                      <td>
                        {customer?.phone ? (
                          <a className="ltr" href={`tel:${customer.phone}`}>
                            {customer.phone}
                          </a>
                        ) : (
                          'לא צוין'
                        )}
                      </td>
                    )}
                    {!compact && (
                      <td>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`עריכת פוליסה ${p.policy_number}`}
                          onClick={() => edit({ kind: 'policy', record: p })}
                        >
                          <Pencil size={15} />
                        </Button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Paginated>
  )
}
export function TaskItem({ task }: { task: Task }) {
  const { repository } = useAuth()
  const { data } = useData()
  const refresh = useRefresh()
  const edit = useEditors()
  const [busy, setBusy] = useState(false)
  const customer = data?.customers.find((c) => c.id === task.customer_id)
  async function toggle() {
    if (!repository) return
    setBusy(true)
    try {
      await repository.saveTask(
        { ...task, status: task.status === 'הושלמה' ? 'פתוחה' : 'הושלמה' },
        task.id,
      )
      await refresh()
      toast.success(task.status === 'הושלמה' ? 'המשימה נפתחה מחדש' : 'המשימה הושלמה')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="task-item">
      <button
        className={`task-check ${task.status === 'הושלמה' ? 'completed' : ''}`}
        disabled={busy}
        onClick={() => void toggle()}
        aria-label={`${task.status === 'הושלמה' ? 'פתיחה מחדש' : 'השלמת משימה'}: ${task.title}`}
      >
        {task.status === 'הושלמה' && <Check size={13} />}
      </button>
      <div className="task-copy">
        <button
          className={`task-title ${task.status === 'הושלמה' ? 'done' : ''}`}
          onClick={() => edit({ kind: 'task', record: task })}
        >
          {task.title}
        </button>
        <div className="task-meta">
          {customer ? (
            <Link to={`/customers/${customer.id}`}>{fullName(customer)}</Link>
          ) : (
            <span>משימה כללית</span>
          )}
          <span>·</span>
          <span>
            {task.priority === 'גבוהה' && <span className="priority-dot" />} עדיפות {task.priority}
          </span>
          {task.status === 'בטיפול' && <Badge tone="warning">בטיפול</Badge>}
        </div>
      </div>
      <span className={`task-date ${isOverdue(task) ? 'overdue' : ''}`}>
        {task.due_date === today() ? 'היום' : formatDate(task.due_date)}
        {isOverdue(task) && (
          <>
            <br />
            באיחור
          </>
        )}
      </span>
    </div>
  )
}
export function TasksList({ tasks }: { tasks: Task[] }) {
  return (
    <Paginated
      items={tasks}
      empty={<Empty title="אין משימות להצגה" description="הוסיפו משימה חדשה או שנו את הסינון." />}
    >
      {(rows) => rows.map((t) => <TaskItem key={t.id} task={t} />)}
    </Paginated>
  )
}
export function DocumentsTable({ documents }: { documents: DocumentRecord[] }) {
  const { data } = useData()
  const { repository, identity } = useAuth()
  const edit = useEditors()
  const [busy, setBusy] = useState<string | null>(null)
  async function open(doc: DocumentRecord, download: boolean) {
    if (!repository) return
    if (doc.scan_status === 'unscanned') {
      if (
        !window.confirm(
          'המסמך לא עבר סריקת אנטיוירוס. הורד אותו רק אם אתה מכיר וסומך על המקור שלו. להמשיך בהורדה?',
        )
      )
        return
      download = true
    }
    setBusy(doc.id)
    const tab = !download ? window.open('about:blank', '_blank') : null
    if (tab) tab.opener = null
    try {
      const url = await repository.documentUrl(doc, download)
      if (tab) tab.location.href = url
      else {
        const link = document.createElement('a')
        link.href = url
        if (download) link.download = doc.file_name
        else {
          link.target = '_blank'
          link.rel = 'noopener noreferrer'
        }
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
      if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      tab?.close()
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }
  return (
    <Paginated
      items={documents}
      empty={
        <Empty
          title="עדיין אין מסמכים"
          description="העלו פוליסות, הצעות ומסמכים כדי לשמור את התיק מסודר."
        />
      }
    >
      {(rows) => (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>שם המסמך</th>
                <th>לקוח</th>
                <th>סוג</th>
                <th>תאריך העלאה</th>
                <th>גודל</th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.file_name}</strong>
                    {d.scan_status === 'unscanned' && (
                      <p className="small muted">לא נסרק באנטיוירוס · הורדה באישור המעלה בלבד</p>
                    )}
                    {d.scan_status === 'pending' && (
                      <p className="small muted">ממתין לסריקת אבטחה — הפתיחה חסומה</p>
                    )}
                    {d.scan_status === 'rejected' && (
                      <p className="form-error">המסמך נחסם בבדיקת האבטחה</p>
                    )}
                  </td>
                  <td>
                    <CustomerLink customer={data?.customers.find((c) => c.id === d.customer_id)} />
                  </td>
                  <td>
                    <Badge>{d.document_type}</Badge>
                  </td>
                  <td>{formatDate(d.uploaded_at)}</td>
                  <td>
                    <span className="ltr">
                      {d.file_size >= 1048576
                        ? `${(d.file_size / 1048576).toFixed(1)} MB`
                        : `${Math.ceil(d.file_size / 1024)} KB`}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={
                          busy === d.id ||
                          (d.scan_status !== undefined &&
                            d.scan_status !== 'clean' &&
                            !(
                              d.scan_status === 'unscanned' &&
                              d.uploaded_by === identity?.profile.id
                            ))
                        }
                        aria-label={`צפייה במסמך ${d.file_name}`}
                        onClick={() => void open(d, false)}
                      >
                        <Eye size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={
                          busy === d.id ||
                          (d.scan_status !== undefined &&
                            d.scan_status !== 'clean' &&
                            !(
                              d.scan_status === 'unscanned' &&
                              d.uploaded_by === identity?.profile.id
                            ))
                        }
                        aria-label={`הורדת מסמך ${d.file_name}`}
                        onClick={() => void open(d, true)}
                      >
                        <Download size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`מחיקת מסמך ${d.file_name}`}
                        disabled={identity?.profile.role !== 'admin'}
                        onClick={() => edit({ kind: 'delete-document', record: d })}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Paginated>
  )
}
