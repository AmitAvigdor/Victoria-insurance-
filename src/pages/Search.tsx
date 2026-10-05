import { useSearchParams } from 'react-router-dom'
import { useData } from '@/app/data'
import { CustomerLink, Empty, Heading, Paginated } from '@/components/shared'
import { PoliciesTable } from '@/components/records'
import { matchesCustomer } from './Customers'
import { matchesPolicy } from './Policies'
export function SearchPage() {
  const [params] = useSearchParams()
  const query = params.get('q') || ''
  const { data } = useData()
  if (!data) return null
  if (!query)
    return (
      <Empty
        title="מה מחפשים?"
        description="הקלידו שם לקוח, פרטי קשר או מספר פוליסה בשורת החיפוש למעלה ולחצו Enter."
      />
    )
  const customers = data.customers.filter((c) => matchesCustomer(c, query))
  const policies = data.policies.filter((p) => matchesPolicy(p, query, data))
  return (
    <>
      <Heading
        title={`תוצאות חיפוש: ${query}`}
        subtitle={`${customers.length} לקוחות · ${policies.length} פוליסות`}
      />
      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-heading">
          <h2>לקוחות</h2>
        </div>
        <Paginated items={customers}>
          {(rows) => (
            <div className="detail-grid">
              {rows.map((c) => (
                <CustomerLink key={c.id} customer={c} />
              ))}
            </div>
          )}
        </Paginated>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>פוליסות</h2>
        </div>
        <PoliciesTable policies={policies} />
      </section>
    </>
  )
}
