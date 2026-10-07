import { useLocation } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import { useData } from '@/app/data'
import { CustomerLink, Empty, Heading, Paginated } from '@/components/shared'
import { PoliciesTable } from '@/components/records'
import { Button } from '@/components/ui/button'
import { matchesCustomer } from './Customers'
import { matchesPolicy } from './Policies'
export function SearchPage() {
  const location = useLocation()
  return <SearchResults key={location.key} initialQuery={location.state?.query || ''} />
}
function SearchResults({ initialQuery }: { initialQuery: string }) {
  const [input, setInput] = useState(initialQuery)
  const [query, setQuery] = useState(initialQuery)
  const { data } = useData()
  if (!data) return null
  function search(e: FormEvent) {
    e.preventDefault()
    setQuery(input.trim())
  }
  const customers = query ? data.customers.filter((c) => matchesCustomer(c, query)) : []
  const policies = query
    ? data.policies.filter(
        (p) => matchesPolicy(p, query, data) || customers.some((c) => c.id === p.customer_id),
      )
    : []
  return (
    <>
      <Heading
        title="חיפוש בכל הנתונים"
        subtitle="שם, טלפון, אימייל, ת״ז, מספר רכב או מספר פוליסה."
      />
      <form onSubmit={search} className="toolbar">
        <input
          className="field-control search-input"
          aria-label="חיפוש בכל הנתונים"
          placeholder="מה מחפשים?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button>חיפוש</Button>
      </form>
      {!query ? (
        <Empty title="מה מחפשים?" description="הקלידו פרט מזהה ולחצו חיפוש." />
      ) : (
        <>
          <p>
            {customers.length} לקוחות · {policies.length} פוליסות
          </p>
          <section className="panel workflow-section">
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
          <section className="panel workflow-section">
            <div className="panel-heading">
              <h2>פוליסות</h2>
            </div>
            <PoliciesTable policies={policies} />
          </section>
        </>
      )}
    </>
  )
}
