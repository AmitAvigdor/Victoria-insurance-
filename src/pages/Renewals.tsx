import { useState } from 'react'
import { useData } from '@/app/data'
import { Heading } from '@/components/shared'
import { PoliciesTable } from '@/components/records'
import { renewals } from '@/domain/selectors'
import { matchesPolicy } from './Policies'
export function Renewals() {
  const { data } = useData()
  const [window, setWindow] = useState<number | 'expired'>(30)
  const [search, setSearch] = useState('')
  const policies = data
    ? renewals(data.policies, window).filter((p) => matchesPolicy(p, search, data))
    : []
  return (
    <>
      <Heading title="חידושים" subtitle="תזמון נכון הופך תאריך סיום להזדמנות לשיחה." />
      <div className="toolbar">
        <div className="segmented" aria-label="תקופת חידושים">
          {[7, 30, 60, 90, 'expired'].map((v) => (
            <button
              key={v}
              className={window === v ? 'selected' : ''}
              onClick={() => setWindow(v as number | 'expired')}
            >
              {v === 'expired' ? 'פג תוקף' : `${v} ימים`}
            </button>
          ))}
        </div>
        <input
          className="field-control search-input"
          aria-label="חיפוש חידושים"
          placeholder="חיפוש לקוח או פוליסה…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>{window === 'expired' ? 'פוליסות שהסתיימו' : `חידושים ב־${window} הימים הקרובים`}</h2>
          <span className="small muted">{policies.length} פוליסות</span>
        </div>
        <PoliciesTable policies={policies} renewal />
      </section>
    </>
  )
}
