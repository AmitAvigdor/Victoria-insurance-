import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Archive, RotateCcw, FileSpreadsheet } from 'lucide-react'
import { useData } from '@/app/data'
import { useEditors } from '@/components/editors'
import { Button } from '@/components/ui/button'
import { CustomerLink, Empty, Heading, Paginated } from '@/components/shared'
import { fullName, type Customer } from '@/domain/types'
export function matchesCustomer(c: Customer, query: string) {
  const q = query.trim().toLocaleLowerCase()
  const digits = q.replace(/\D/g, '')
  return [fullName(c), c.phone, c.email, c.identification_number, c.phone.replace(/\D/g, '')].some(
    (v) =>
      v.toLocaleLowerCase().includes(q) ||
      (digits.length >= 3 && v.replace(/\D/g, '').includes(digits)),
  )
}
export function Customers() {
  const { data } = useData()
  const edit = useEditors()
  const [params] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') || '')
  const [archived, setArchived] = useState(false)
  const customers =
    data?.customers.filter((c) => !!c.archived_at === archived && matchesCustomer(c, search)) || []
  return (
    <>
      <Heading
        title="לקוחות"
        subtitle="האנשים שמאחורי הפוליסות. כל המידע, בתיק אחד."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/import">
                <FileSpreadsheet size={17} />
                ייבוא מאקסל
              </Link>
            </Button>
            <Button onClick={() => edit({ kind: 'customer' })}>
              <Plus size={17} />
              לקוח חדש
            </Button>
          </>
        }
      />
      <div className="toolbar">
        <input
          className="field-control search-input"
          aria-label="חיפוש לקוחות"
          placeholder="שם, טלפון, אימייל או מספר זהות…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="segmented">
          <button className={!archived ? 'selected' : ''} onClick={() => setArchived(false)}>
            לקוחות פעילים
          </button>
          <button className={archived ? 'selected' : ''} onClick={() => setArchived(true)}>
            ארכיון
          </button>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>{archived ? 'לקוחות בארכיון' : 'לקוחות הסוכנות'}</h2>
          <span className="small muted">{customers.length} לקוחות</span>
        </div>
        <Paginated
          items={customers}
          empty={
            <Empty
              title="לא נמצאו לקוחות"
              action={
                <Button variant="outline" onClick={() => edit({ kind: 'customer' })}>
                  הוספת לקוח
                </Button>
              }
            />
          }
        >
          {(rows) => (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>לקוח</th>
                    <th>מספר זהות</th>
                    <th>טלפון</th>
                    <th>אימייל</th>
                    <th>פוליסות</th>
                    <th>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <CustomerLink customer={c} />
                      </td>
                      <td>
                        <span className="ltr">{c.identification_number || 'לא צוין'}</span>
                      </td>
                      <td>
                        {c.phone ? (
                          <a href={`tel:${c.phone}`} className="ltr">
                            {c.phone}
                          </a>
                        ) : (
                          'לא צוין'
                        )}
                      </td>
                      <td>
                        <a href={`mailto:${c.email}`} className="ltr">
                          {c.email || '—'}
                        </a>
                      </td>
                      <td>{data?.policies.filter((p) => p.customer_id === c.id).length}</td>
                      <td>
                        <div className="row-actions">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`עריכת ${fullName(c)}`}
                            onClick={() => edit({ kind: 'customer', record: c })}
                          >
                            <Pencil size={15} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`${archived ? 'שחזור' : 'ארכוב'} ${fullName(c)}`}
                            onClick={() => edit({ kind: 'archive', record: c })}
                          >
                            {archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Paginated>
      </section>
    </>
  )
}
