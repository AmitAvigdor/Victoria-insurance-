import { useState } from 'react'
import { useData } from '@/app/data'
import { Heading } from '@/components/shared'
import { RenewalCards } from '@/components/workflows'
import { renewalStages } from '@/domain/types'
import { renewals } from '@/domain/selectors'
import { matchesPolicy } from './Policies'
export function Renewals() {
  const { data } = useData()
  const [window, setWindow] = useState<number | 'expired'>(30)
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState('')
  const policies = data
    ? (stage === 'חודש' || stage === 'לא חודש'
        ? data.policies
        : renewals(data.policies, window)
      ).filter(
        (p) =>
          matchesPolicy(p, search, data) && (!stage || (p.renewal_stage || 'טרם טופל') === stage),
      )
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
      <label className="field workflow-filter">
        <span>שלב הטיפול</span>
        <select
          className="field-control"
          aria-label="סינון שלב הטיפול"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
        >
          <option value="">כל החידושים הפתוחים</option>
          {renewalStages.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <section className="panel">
        <div className="panel-heading">
          <h2>
            {stage === 'חודש' || stage === 'לא חודש'
              ? `טיפול שהסתיים — ${stage}`
              : window === 'expired'
                ? 'פוליסות שהסתיימו'
                : `חידושים ב־${window} הימים הקרובים`}
          </h2>
          <span className="small muted">{policies.length} פוליסות</span>
        </div>
        <RenewalCards policies={policies} />
      </section>
    </>
  )
}
