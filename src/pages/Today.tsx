import { Link } from 'react-router-dom'
import { useData } from '@/app/data'
import { Heading, Empty } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { TasksList } from '@/components/records'
import { RenewalCards } from '@/components/workflows'
import { today, daysUntil } from '@/domain/dates'
import { renewalOpen } from '@/domain/selectors'
export function Today() {
  const { data } = useData()
  if (!data) return null
  const now = today()
  const tasks = data.tasks
    .filter((t) => t.status !== 'הושלמה' && t.due_date <= now)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const policies = data.policies
    .filter(
      (p) =>
        renewalOpen(p) &&
        ((p.renewal_follow_up && p.renewal_follow_up <= now) ||
          (!p.renewal_follow_up && daysUntil(p.end_date) <= 7)),
    )
    .sort((a, b) =>
      (a.renewal_follow_up || a.end_date).localeCompare(b.renewal_follow_up || b.end_date),
    )
  return (
    <>
      <Heading
        title="מה דורש טיפול היום"
        subtitle="שיחות ומעקבים שהגיע מועד הטיפול בהם, חידושים דחופים ומשימות באיחור."
        actions={
          <Button variant="outline" asChild>
            <Link to="/renewals">כל החידושים</Link>
          </Button>
        }
      />
      <div className="import-summary">
        <span>{policies.length} חידושים לטיפול</span>
        <span>{tasks.length} משימות להיום ובאיחור</span>
      </div>
      {!policies.length && !tasks.length && (
        <Empty
          title="הטיפול להיום הושלם"
          description="אין כרגע מעקבים או משימות שהגיע מועד הטיפול בהם."
        />
      )}
      <section className="panel workflow-section">
        <div className="panel-heading">
          <h2>שיחות וחידושים</h2>
        </div>
        <RenewalCards policies={policies} />
      </section>
      <section className="panel workflow-section">
        <div className="panel-heading">
          <h2>משימות להיום ובאיחור</h2>
        </div>
        <TasksList tasks={tasks} />
      </section>
    </>
  )
}
