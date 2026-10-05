import { useSearchParams, useParams, Link } from 'react-router-dom'
import { Pencil, Plus, Phone, Mail, Contact, Upload, Activity as ActivityIcon } from 'lucide-react'
import { useData } from '@/app/data'
import { useEditors } from '@/components/editors'
import { Button } from '@/components/ui/button'
import { Badge, Empty, Paginated } from '@/components/shared'
import { PoliciesTable, TasksList, DocumentsTable } from '@/components/records'
import { fullName } from '@/domain/types'
import { formatDate } from '@/domain/dates'
const tabs = [
  ['details', 'פרטים'],
  ['policies', 'פוליסות'],
  ['documents', 'מסמכים'],
  ['tasks', 'משימות'],
  ['activity', 'פעילות'],
]
export function CustomerProfile() {
  const { id } = useParams()
  const { data } = useData()
  const edit = useEditors()
  const [params, setParams] = useSearchParams()
  const tab = tabs.some(([key]) => key === params.get('tab')) ? params.get('tab')! : 'details'
  const customer = data?.customers.find((c) => c.id === id)
  if (!customer)
    return (
      <Empty
        title="הלקוח לא נמצא"
        description="ייתכן שהקישור אינו תקין או שאין לך הרשאה לצפות בלקוח."
        action={
          <Button asChild variant="outline">
            <Link to="/customers">לכל הלקוחות</Link>
          </Button>
        }
      />
    )
  const policies = data!.policies.filter((p) => p.customer_id === id)
  const tasks = data!.tasks
    .filter((t) => t.customer_id === id)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const documents = data!.documents.filter((d) => d.customer_id === id)
  const activities = data!.activities
    .filter((a) => a.customer_id === id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  return (
    <>
      <Link
        to="/customers"
        className="text-link"
        style={{ display: 'inline-block', marginBottom: 17 }}
      >
        לקוחות / תיק לקוח
      </Link>
      <section className="panel profile-card">
        <div className="avatar">
          {customer.first_name[0]}
          {customer.last_name[0]}
        </div>
        <div style={{ flex: 1 }}>
          <h1>
            {fullName(customer)} {customer.archived_at && <Badge>בארכיון</Badge>}
          </h1>
          <div className="contact-details">
            <span>
              <Phone size={14} />
              <a href={`tel:${customer.phone}`} className="ltr">
                {customer.phone}
              </a>
            </span>
            <span>
              <Mail size={14} />
              <a href={`mailto:${customer.email}`} className="ltr">
                {customer.email || 'לא צוין אימייל'}
              </a>
            </span>
            <span>
              <Contact size={14} />
              <span className="ltr">{customer.identification_number}</span>
            </span>
          </div>
        </div>
        <div className="actions">
          <Button variant="outline" onClick={() => edit({ kind: 'customer', record: customer })}>
            <Pencil size={15} />
            עריכת פרטים
          </Button>
        </div>
      </section>
      <div className="tabs" role="tablist" aria-label="תיק לקוח">
        {tabs.map(([key, label]) => (
          <button
            role="tab"
            aria-selected={tab === key}
            aria-controls="customer-tabpanel"
            id={`tab-${key}`}
            key={key}
            className={tab === key ? 'active' : ''}
            onClick={() => setParams({ tab: key })}
          >
            {label}
            {key === 'policies'
              ? ` (${policies.length})`
              : key === 'documents'
                ? ` (${documents.length})`
                : key === 'tasks'
                  ? ` (${tasks.length})`
                  : ''}
          </button>
        ))}
      </div>
      <section
        role="tabpanel"
        id="customer-tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="panel"
      >
        {tab === 'details' && (
          <>
            <div className="panel-heading">
              <h2>פרטי הלקוח</h2>
              <span className="small muted">נוסף ב־{formatDate(customer.created_at)}</span>
            </div>
            <dl className="detail-grid">
              {[
                ['שם מלא', fullName(customer)],
                ['מספר זהות', customer.identification_number],
                ['טלפון', customer.phone],
                ['אימייל', customer.email || 'לא צוין'],
                [
                  'תאריך לידה',
                  customer.date_of_birth ? formatDate(customer.date_of_birth) : 'לא צוין',
                ],
                ['כתובת', customer.address || 'לא צוינה'],
                ['הערות', customer.notes || 'אין הערות'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="panel-footer actions">
              <Button variant="outline" onClick={() => edit({ kind: 'policy', customerId: id })}>
                <Plus size={15} />
                פוליסה חדשה
              </Button>
              <Button variant="outline" onClick={() => edit({ kind: 'task', customerId: id })}>
                <Plus size={15} />
                משימה חדשה
              </Button>
              <Button variant="outline" onClick={() => edit({ kind: 'document', customerId: id })}>
                <Upload size={15} />
                העלאת מסמך
              </Button>
            </div>
          </>
        )}
        {tab === 'policies' && (
          <>
            <div className="panel-heading">
              <h2>פוליסות הלקוח</h2>
              <Button size="sm" onClick={() => edit({ kind: 'policy', customerId: id })}>
                <Plus size={15} />
                פוליסה חדשה
              </Button>
            </div>
            <PoliciesTable policies={policies} />
          </>
        )}
        {tab === 'tasks' && (
          <>
            <div className="panel-heading">
              <h2>משימות הלקוח</h2>
              <Button size="sm" onClick={() => edit({ kind: 'task', customerId: id })}>
                <Plus size={15} />
                משימה חדשה
              </Button>
            </div>
            <TasksList tasks={tasks} />
          </>
        )}
        {tab === 'documents' && (
          <>
            <div className="panel-heading">
              <h2>מסמכי הלקוח</h2>
              <Button size="sm" onClick={() => edit({ kind: 'document', customerId: id })}>
                <Upload size={15} />
                העלאת מסמך
              </Button>
            </div>
            <DocumentsTable documents={documents} />
          </>
        )}
        {tab === 'activity' && (
          <>
            <div className="panel-heading">
              <h2>היסטוריית פעילות</h2>
            </div>
            <Paginated items={activities} empty={<Empty title="אין פעילות מתועדת" />}>
              {(rows) =>
                rows.map((a) => (
                  <div className="activity-row" key={a.id}>
                    <div className="activity-icon">
                      <ActivityIcon size={18} />
                    </div>
                    <div>
                      <p>{a.description}</p>
                      <small>
                        {formatDate(a.created_at)} ·{' '}
                        {new Intl.DateTimeFormat('he-IL', {
                          timeZone: 'Asia/Jerusalem',
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(new Date(a.created_at))}
                      </small>
                    </div>
                  </div>
                ))
              }
            </Paginated>
          </>
        )}
      </section>
    </>
  )
}
