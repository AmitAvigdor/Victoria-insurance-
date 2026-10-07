import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/app/auth'
import { useData, useRefresh } from '@/app/data'
import { Heading, CustomerLink, Paginated, Empty } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { money, today } from '@/domain/dates'
import { policySchema } from '@/domain/validation'
import type { Policy } from '@/domain/types'
import { errorMessage } from '@/lib/utils'
export function Commissions() {
  const { data } = useData()
  const { repository, identity } = useAuth()
  const refresh = useRefresh()
  const [month, setMonth] = useState(today().slice(0, 7))
  const [company, setCompany] = useState('')
  const [editing, setEditing] = useState<Policy | null>(null)
  const [busy, setBusy] = useState(false)
  if (!data) return null
  const rows = data.policies.filter(
    (p) =>
      (!company || p.insurance_company === company) &&
      (!month || (p.commission_due_date || '').startsWith(month)),
  )
  const expected = rows.reduce((sum, p) => sum + Number(p.commission_expected_amount || 0), 0)
  const received = rows.reduce((sum, p) => sum + Number(p.commission_received_amount || 0), 0)
  const remaining = rows.reduce(
    (sum, p) =>
      sum +
      Math.max(
        0,
        Number(p.commission_expected_amount || 0) - Number(p.commission_received_amount || 0),
      ),
    0,
  )
  const incomplete = data.policies.filter(
    (p) => p.commission_expected_amount == null || !p.commission_due_date,
  ).length
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editing) return
    const f = new FormData(e.currentTarget)
    const patch = {
      commission_expected_amount: String(f.get('expected') || '')
        ? Number(f.get('expected'))
        : null,
      commission_received_amount: Number(f.get('received') || 0),
      commission_due_date: String(f.get('due') || '') || null,
    }
    setBusy(true)
    try {
      policySchema.parse({ ...editing, ...patch })
      await repository!.applyImportUpdates([
        { table: 'policies', id: editing.id, updated_at: editing.updated_at, patch },
      ])
      await refresh()
      setEditing(null)
      toast.success('נתוני העמלה נשמרו')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Heading
        title="עמלות"
        subtitle="סכומי עמלה צפויים והתקבולים המצטברים בפועל, לפי חודש הזכאות וחברת ביטוח."
      />
      <div className="toolbar">
        <label className="field">
          <span>חודש זכאות</span>
          <input
            className="field-control"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <label className="field">
          <span>חברת ביטוח</span>
          <select
            className="field-control"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          >
            <option value="">כל החברות</option>
            {[...new Set(data.policies.map((p) => p.insurance_company))].sort().map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          onClick={() => {
            setMonth('')
            setCompany('')
          }}
        >
          הצגת כל הפוליסות
        </Button>
      </div>
      <section className="panel">
        <div className="commission-stats">
          <div>
            צפוי<strong>{money(expected)}</strong>
          </div>
          <div>
            התקבל<strong>{money(received)}</strong>
          </div>
          <div>
            יתרה לקבלה<strong>{money(remaining)}</strong>
          </div>
        </div>
      </section>
      <p className="small muted">
        {incomplete} פוליסות דורשות השלמת סכום או חודש זכאות. ערך העמלה המקורי מהאקסל מוצג לעיון;
        סכום או אחוז אינם מומרים אוטומטית. התקבולים מוצגים לפי חודש הזכאות של הפוליסה.
      </p>
      <section className="panel">
        <Paginated
          items={rows}
          empty={
            <Empty
              title="אין פוליסות בחודש שנבחר"
              description="בחרו הצגת כל הפוליסות כדי להשלים נתוני עמלה."
            />
          }
        >
          {(items) => (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>לקוח</th>
                    <th>חברה / פוליסה</th>
                    <th>עמלה מהאקסל</th>
                    <th>צפוי</th>
                    <th>התקבל</th>
                    <th>יתרה</th>
                    <th>פעולה</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <CustomerLink
                          customer={data.customers.find((c) => c.id === p.customer_id)}
                        />
                      </td>
                      <td>
                        {p.insurance_company}
                        <br />
                        {p.policy_number || p.vehicle_registration}
                      </td>
                      <td>{p.commission || 'לא צוינה'}</td>
                      <td>{money(p.commission_expected_amount ?? null)}</td>
                      <td>{money(Number(p.commission_received_amount || 0))}</td>
                      <td>
                        {p.commission_expected_amount == null
                          ? 'לא צוין'
                          : money(
                              Math.max(
                                0,
                                Number(p.commission_expected_amount) -
                                  Number(p.commission_received_amount || 0),
                              ),
                            )}
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={identity?.profile.role === 'viewer'}
                          onClick={() => setEditing(p)}
                        >
                          עדכון עמלה
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Paginated>
      </section>
      <Dialog
        open={!!editing}
        onOpenChange={(v) => {
          if (!v && !busy) setEditing(null)
        }}
        title="עדכון עמלה"
        description="הזינו סכומים בשקלים. סכום שהתקבל הוא סך התקבולים עבור הפוליסה."
      >
        {editing && (
          <form key={editing.id} onSubmit={(e) => void save(e)}>
            <p>הערך המקורי באקסל: {editing.commission || 'לא צוין'}</p>
            <label className="field">
              <span>עמלה צפויה בשקלים</span>
              <input
                className="field-control"
                name="expected"
                type="number"
                min="0"
                max="999999999"
                step="0.01"
                defaultValue={editing.commission_expected_amount ?? ''}
              />
            </label>
            <label className="field">
              <span>סך העמלה שהתקבלה בשקלים</span>
              <input
                className="field-control"
                name="received"
                type="number"
                min="0"
                max="999999999"
                step="0.01"
                defaultValue={editing.commission_received_amount ?? 0}
              />
            </label>
            <label className="field">
              <span>תאריך זכאות צפוי</span>
              <input
                className="field-control"
                name="due"
                type="date"
                defaultValue={editing.commission_due_date || ''}
              />
            </label>
            <div className="form-actions">
              <Button disabled={busy}>שמירת עמלה</Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  )
}
