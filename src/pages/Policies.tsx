import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useData } from '@/app/data'
import { useEditors } from '@/components/editors'
import { Button } from '@/components/ui/button'
import { Heading } from '@/components/shared'
import { PoliciesTable } from '@/components/records'
import {
  insuranceTypes,
  policyStatuses,
  fullName,
  type Policy,
  type Snapshot,
} from '@/domain/types'
import { isActive } from '@/domain/selectors'
export function matchesPolicy(p: Policy, q: string, data: Snapshot) {
  const query = q.trim().toLowerCase()
  return [
    p.policy_number,
    p.vehicle_registration || '',
    p.insurance_company,
    p.insurance_type,
    fullName(data.customers.find((c) => c.id === p.customer_id)),
  ].some((v) => v.toLowerCase().includes(query))
}
export function Policies() {
  const { data } = useData()
  const edit = useEditors()
  const [params] = useSearchParams()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(params.get('status') || '')
  const [type, setType] = useState('')
  const rows =
    data?.policies.filter(
      (p) =>
        (!status || (status === 'פעילה' ? isActive(p) : p.status === status)) &&
        (!type || p.insurance_type === type) &&
        matchesPolicy(p, search, data),
    ) || []
  return (
    <>
      <Heading
        title="פוליסות"
        subtitle="תמונת הכיסוי של הלקוחות, לאורך כל תקופת הביטוח."
        actions={
          <Button onClick={() => edit({ kind: 'policy' })}>
            <Plus size={17} />
            פוליסה חדשה
          </Button>
        }
      />
      <div className="toolbar">
        <input
          className="field-control search-input"
          aria-label="חיפוש פוליסות"
          placeholder="מספר פוליסה או רישוי, לקוח או חברת ביטוח…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filters">
          <select
            className="field-control filter-select"
            aria-label="סינון לפי סוג ביטוח"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">כל סוגי הביטוח</option>
            {insuranceTypes.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            className="field-control filter-select"
            aria-label="סינון סטטוס פוליסה"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">כל הסטטוסים</option>
            {policyStatuses.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>פוליסות הסוכנות</h2>
          <span className="small muted">{rows.length} פוליסות</span>
        </div>
        <PoliciesTable policies={rows} />
      </section>
    </>
  )
}
