import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  FolderOpen,
  RotateCcw,
  Car,
  House,
  HeartPulse,
  BriefcaseBusiness,
  Plane,
  Shield,
  Heart,
} from 'lucide-react'
import { Button } from './ui/button'
import { fullName, type Customer, type InsuranceType } from '@/domain/types'
import { useData } from '@/app/data'
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>
}
export function Status({ status }: { status: string }) {
  return (
    <Badge
      tone={
        ['פעילה', 'הושלמה'].includes(status)
          ? 'success'
          : ['עומדת לחידוש', 'בטיפול'].includes(status)
            ? 'warning'
            : ['הסתיימה', 'בוטלה'].includes(status)
              ? 'danger'
              : 'info'
      }
    >
      {status}
    </Badge>
  )
}
export function CustomerLink({ customer }: { customer?: Customer }) {
  return customer ? (
    <div className="person">
      <span className="avatar">
        {customer.first_name[0]}
        {customer.last_name[0]}
      </span>
      <div>
        <Link to={`/customers/${customer.id}`} className="person-name">
          {fullName(customer)}
        </Link>
        {customer.archived_at && <div className="person-meta">בארכיון</div>}
      </div>
    </div>
  ) : (
    <span className="muted">ללא לקוח</span>
  )
}
export function InsuranceLabel({ type }: { type: InsuranceType }) {
  const Icon = {
    רכב: Car,
    דירה: House,
    חיים: Heart,
    בריאות: HeartPulse,
    עסק: BriefcaseBusiness,
    נסיעות: Plane,
    אחר: Shield,
  }[type]
  return (
    <span className="type-icon">
      <Icon size={14} />
      {type}
    </span>
  )
}
export function Empty({
  title = 'אין רשומות להצגה',
  description = 'אפשר לשנות את הסינון או להוסיף רשומה חדשה.',
  action,
}: {
  title?: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <FolderOpen size={28} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
export function DataBoundary({ children }: { children: ReactNode }) {
  const query = useData()
  if (query.isPending)
    return (
      <div aria-label="טוען נתונים" role="status">
        <div className="stats">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="skeleton" />
          ))}
        </div>
        <div className="skeleton" style={{ height: 340 }} />
      </div>
    )
  if (query.isError)
    return (
      <div className="error-panel" role="alert">
        <h2>לא ניתן לטעון את הנתונים</h2>
        <p>{query.error.message}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          <RotateCcw size={16} />
          ניסיון נוסף
        </Button>
      </div>
    )
  return children
}
export function Heading({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  )
}
export function Paginated<T>({
  items,
  children,
  empty,
  pageSize = 10,
}: {
  items: T[]
  children: (page: T[]) => ReactNode
  empty?: ReactNode
  pageSize?: number
}) {
  const [page, setPage] = useState(0)
  const count = Math.ceil(items.length / pageSize)
  const current = Math.min(page, Math.max(0, count - 1))
  if (!items.length) return empty || <Empty />
  return (
    <>
      {children(items.slice(current * pageSize, (current + 1) * pageSize))}
      {items.length > pageSize && (
        <div className="pagination">
          <span>
            {current * pageSize + 1}–{Math.min((current + 1) * pageSize, items.length)} מתוך{' '}
            {items.length}
          </span>
          <div className="actions">
            <Button
              variant="ghost"
              size="sm"
              disabled={!current}
              onClick={() => setPage(current - 1)}
            >
              הקודם
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={current >= count - 1}
              onClick={() => setPage(current + 1)}
            >
              הבא
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
