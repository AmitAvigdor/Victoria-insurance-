import { Link } from 'react-router-dom'
import { Users, ShieldCheck, RefreshCw, CheckSquare, Plus, CalendarDays } from 'lucide-react'
import { useAuth } from '@/app/auth'
import { useData } from '@/app/data'
import { useEditors } from '@/components/editors'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/shared'
import { PoliciesTable, TaskItem } from '@/components/records'
import { statistics, renewals, isOverdue } from '@/domain/selectors'
export function Dashboard() {
  const { identity } = useAuth()
  const { data } = useData()
  const edit = useEditors()
  if (!data) return null
  const stats = statistics(data)
  const upcoming = renewals(data.policies, 30)
  const tasks = data.tasks
    .filter((t) => t.status !== 'הושלמה')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const overdue = tasks.filter(isOverdue).length
  const cards = [
    {
      title: 'לקוחות בסוכנות',
      value: stats.customers,
      icon: Users,
      note: 'כל הלקוחות הפעילים',
      path: '/customers',
    },
    {
      title: 'פוליסות פעילות',
      value: stats.active,
      icon: ShieldCheck,
      note: 'הכיסוי של הלקוחות שלך',
      path: '/policies?status=פעילה',
    },
    {
      title: 'חידושים קרובים',
      value: stats.renewals,
      icon: RefreshCw,
      note: 'ב־30 הימים הקרובים',
      path: '/renewals',
    },
    {
      title: 'משימות פתוחות',
      value: stats.tasks,
      icon: CheckSquare,
      note: overdue ? `${overdue} משימות דורשות טיפול באיחור` : 'הכול מתקדם לפי התכנון',
      path: '/tasks',
    },
  ]
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">יום טוב, {identity?.profile.full_name.split(' ')[0]}</div>
          <h1>התמונה המלאה של הסוכנות</h1>
          <p>הלקוחות, החידושים והמשימות שחשוב להכיר היום.</p>
        </div>
        <div className="actions">
          <Button asChild>
            <Link to="/today">מה דורש טיפול היום</Link>
          </Button>
          <Button variant="outline" onClick={() => edit({ kind: 'task' })}>
            <Plus size={16} />
            משימה חדשה
          </Button>
          <Button onClick={() => edit({ kind: 'customer' })}>
            <Plus size={16} />
            לקוח חדש
          </Button>
        </div>
      </div>
      <div className="stats">
        {cards.map((card) => (
          <Link to={card.path} className="stat-card" key={card.title}>
            <div className="stat-top">
              <span>{card.title}</span>
              <div className="stat-icon">
                <card.icon size={18} />
              </div>
            </div>
            <div className="stat-value">{card.value.toLocaleString('he-IL')}</div>
            <div className="stat-foot">{card.note}</div>
          </Link>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <div className="panel-title">
                <h2>חידושים קרובים</h2>
                <small>{upcoming.length}</small>
              </div>
              <p className="panel-subtitle">להישאר צעד אחד לפני תאריך החידוש</p>
            </div>
            <Link to="/renewals" className="text-link">
              כל החידושים
            </Link>
          </div>
          <PoliciesTable policies={upcoming.slice(0, 6)} renewal compact />
          <div className="panel-footer">
            <Link to="/renewals" className="text-link">
              צפייה בכל החידושים הקרובים
            </Link>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div className="panel-title">
              <h2>על סדר היום</h2>
              <small>{tasks.length}</small>
            </div>
            <Link to="/tasks" className="text-link">
              כל המשימות
            </Link>
          </div>
          {tasks.length ? (
            tasks.slice(0, 5).map((t) => <TaskItem key={t.id} task={t} />)
          ) : (
            <Empty title="סדר היום פנוי" description="אין כרגע משימות פתוחות." />
          )}
          <div className="panel-footer">
            <button className="text-link" onClick={() => edit({ kind: 'task' })}>
              + הוספת משימה
            </button>
          </div>
        </section>
      </div>
      <div className="overview-strip">
        <div className="strip-icon">
          <CalendarDays size={25} />
        </div>
        <div>
          <h3>
            {upcoming.length ? `${upcoming.length} הזדמנויות לחדש את הקשר` : 'כל החידושים בשליטה'}
          </h3>
          <p>
            {upcoming.length
              ? 'הפוליסות האלו מסתיימות בחודש הקרוב. זה הזמן להתחיל שיחה.'
              : 'אין פוליסות שמסתיימות ב־30 הימים הקרובים.'}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/renewals">לניהול החידושים</Link>
        </Button>
      </div>
    </>
  )
}
