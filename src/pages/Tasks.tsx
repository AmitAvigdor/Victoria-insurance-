import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useData } from '@/app/data'
import { useEditors } from '@/components/editors'
import { Button } from '@/components/ui/button'
import { Heading } from '@/components/shared'
import { TasksList } from '@/components/records'
import { isOverdue } from '@/domain/selectors'
export function Tasks() {
  const { data } = useData()
  const edit = useEditors()
  const [status, setStatus] = useState('active')
  const [query, setQuery] = useState('')
  const tasks =
    data?.tasks
      .filter(
        (t) =>
          (status === 'all' ||
            (status === 'active'
              ? t.status !== 'הושלמה'
              : status === 'overdue'
                ? isOverdue(t)
                : t.status === status)) &&
          (t.title + t.description).toLowerCase().includes(query.toLowerCase().trim()),
      )
      .sort((a, b) => a.due_date.localeCompare(b.due_date)) || []
  return (
    <>
      <Heading
        title="משימות"
        subtitle="כל מה שצריך לעשות, בלי להשאיר קצוות פתוחים."
        actions={
          <Button onClick={() => edit({ kind: 'task' })}>
            <Plus size={17} />
            משימה חדשה
          </Button>
        }
      />
      <div className="toolbar">
        <div className="segmented">
          {[
            ['active', 'פתוחות ובטיפול'],
            ['פתוחה', 'פתוחה'],
            ['בטיפול', 'בטיפול'],
            ['overdue', 'באיחור'],
            ['הושלמה', 'הושלמו'],
            ['all', 'הכול'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={status === value ? 'selected' : ''}
              onClick={() => setStatus(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          className="field-control search-input"
          aria-label="חיפוש משימות"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש משימה…"
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>רשימת המשימות</h2>
          <span className="small muted">{tasks.length} משימות</span>
        </div>
        <TasksList tasks={tasks} />
      </section>
    </>
  )
}
