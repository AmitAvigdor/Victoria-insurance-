import { useState } from 'react'
import { Upload } from 'lucide-react'
import { useData } from '@/app/data'
import { useEditors } from '@/components/editors'
import { Button } from '@/components/ui/button'
import { Heading } from '@/components/shared'
import { DocumentsTable } from '@/components/records'
import { fullName } from '@/domain/types'
export function Documents() {
  const { data } = useData()
  const edit = useEditors()
  const [query, setQuery] = useState('')
  const [customerId, setCustomerId] = useState('')
  const documents =
    data?.documents.filter(
      (d) =>
        (!customerId || d.customer_id === customerId) &&
        `${d.file_name} ${d.document_type} ${fullName(data.customers.find((c) => c.id === d.customer_id))}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    ) || []
  return (
    <>
      <Heading
        title="מסמכים"
        subtitle="כל מסמכי הלקוחות, מאורגנים וזמינים לצוות הסוכנות."
        actions={
          <Button onClick={() => edit({ kind: 'document' })}>
            <Upload size={17} />
            העלאת מסמך
          </Button>
        }
      />
      <div className="toolbar">
        <input
          className="field-control search-input"
          aria-label="חיפוש מסמכים"
          placeholder="שם מסמך, סוג או לקוח…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="field-control filter-select"
          aria-label="סינון לפי לקוח"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        >
          <option value="">כל הלקוחות</option>
          {data?.customers.map((c) => (
            <option key={c.id} value={c.id}>
              {fullName(c)}
            </option>
          ))}
        </select>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>מסמכי הסוכנות</h2>
          <span className="small muted">{documents.length} מסמכים</span>
        </div>
        <DocumentsTable documents={documents} />
      </section>
    </>
  )
}
