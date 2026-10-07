import { useState, type FormEvent } from 'react'
import { Phone, MessageCircle, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/app/auth'
import { useData, useRefresh } from '@/app/data'
import { fullName, renewalStages, type Customer, type Policy } from '@/domain/types'
import { daysUntil, formatDate } from '@/domain/dates'
import { errorMessage } from '@/lib/utils'
import { CustomerLink, Badge, Empty, Paginated } from './shared'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
export function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (/^0[2-9]\d{7,8}$/.test(digits)) return '972' + digits.slice(1)
  if (/^972[2-9]\d{7,8}$/.test(digits)) return digits
  if (phone.trim().startsWith('+') && digits.length >= 8 && digits.length <= 15) return digits
  return null
}
export function ContactActions({ customer }: { customer?: Customer }) {
  const phone = customer?.phone.replace(/[^+\d]/g, '')
  const whatsapp = customer && whatsappNumber(customer.phone)
  return (
    <div className="actions contact-actions">
      {phone && (
        <Button variant="outline" size="sm" asChild>
          <a href={`tel:${phone}`}>
            <Phone size={16} />
            חיוג
          </a>
        </Button>
      )}
      {whatsapp && (
        <Button variant="outline" size="sm" asChild>
          <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={16} />
            WhatsApp
          </a>
        </Button>
      )}
    </div>
  )
}
export function ContactNote({ customer }: { customer: Customer }) {
  const { repository, identity } = useAuth()
  const refresh = useRefresh()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    try {
      await repository!.addContactNote(
        customer.id,
        String(new FormData(e.currentTarget).get('note') || ''),
      )
      await refresh()
      setOpen(false)
      toast.success('סיכום השיחה נשמר בהיסטוריית הלקוח')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={identity?.profile.role === 'viewer'}
        onClick={() => setOpen(true)}
      >
        <Pencil size={16} />
        סיכום שיחה
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v)
        }}
        title={`סיכום שיחה — ${fullName(customer)}`}
      >
        <form onSubmit={(e) => void save(e)}>
          <label className="field">
            <span>מה סוכם עם הלקוח?</span>
            <textarea className="field-control" name="note" required maxLength={5000} rows={5} />
          </label>
          <div className="form-actions">
            <Button disabled={busy}>{busy ? 'שומר…' : 'שמירת סיכום'}</Button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
export function RenewalEditor({ policy, onClose }: { policy: Policy | null; onClose: () => void }) {
  const { repository } = useAuth()
  const refresh = useRefresh()
  const [busy, setBusy] = useState(false)
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!policy) return
    const form = new FormData(e.currentTarget)
    setBusy(true)
    try {
      await repository!.saveRenewal(policy, {
        stage: String(form.get('stage')) as NonNullable<Policy['renewal_stage']>,
        follow_up: String(form.get('follow_up') || '') || null,
        note: String(form.get('note') || ''),
      })
      await refresh()
      onClose()
      toast.success('הטיפול בחידוש עודכן')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={!!policy}
      onOpenChange={(v) => {
        if (!v && !busy) onClose()
      }}
      title="טיפול בחידוש"
      description="שלב הטיפול ומועד השיחה הבאה. סימון כחודש מתעד את הטיפול; יש להוסיף את הפוליסה החדשה בנפרד."
    >
      {policy && (
        <form key={policy.id} onSubmit={(e) => void save(e)}>
          <label className="field">
            <span>שלב הטיפול</span>
            <select
              className="field-control"
              aria-label="שלב הטיפול"
              name="stage"
              defaultValue={policy.renewal_stage || 'טרם טופל'}
            >
              {renewalStages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>מועד מעקב הבא</span>
            <input
              className="field-control"
              type="date"
              name="follow_up"
              defaultValue={policy.renewal_follow_up || ''}
            />
          </label>
          <label className="field">
            <span>סיכום הטיפול</span>
            <textarea
              className="field-control"
              name="note"
              rows={4}
              maxLength={5000}
              defaultValue={policy.renewal_notes || ''}
            />
          </label>
          <div className="form-actions">
            <Button disabled={busy}>{busy ? 'שומר…' : 'שמירת הטיפול'}</Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
export function RenewalCards({ policies }: { policies: Policy[] }) {
  const { data } = useData()
  const { identity } = useAuth()
  const [editing, setEditing] = useState<Policy | null>(null)
  return (
    <>
      <Paginated items={policies} empty={<Empty title="אין חידושים להצגה" />}>
        {(rows) => (
          <div className="renewal-grid">
            {rows.map((p) => {
              const customer = data?.customers.find((c) => c.id === p.customer_id)
              const days = daysUntil(p.end_date)
              return (
                <article className="renewal-card" key={p.id}>
                  <div className="renewal-card-top">
                    <CustomerLink customer={customer} />
                    <Badge tone={days < 0 ? 'danger' : days <= 7 ? 'warning' : 'neutral'}>
                      {days < 0
                        ? `פג לפני ${-days} ימים`
                        : days === 0
                          ? 'מסתיים היום'
                          : `עוד ${days} ימים`}
                    </Badge>
                  </div>
                  <p>
                    {p.insurance_company} · {p.insurance_type} ·{' '}
                    {p.vehicle_registration || p.policy_number || 'ללא מספר'}
                  </p>
                  <p className="small muted">תום ביטוח: {formatDate(p.end_date)}</p>
                  <div className="renewal-card-top">
                    <Badge>{p.renewal_stage || 'טרם טופל'}</Badge>
                    <span className="small">
                      {p.renewal_follow_up
                        ? `מעקב: ${formatDate(p.renewal_follow_up)}`
                        : 'טרם נקבע מעקב'}
                    </span>
                  </div>
                  {p.renewal_notes && <p className="workflow-note">{p.renewal_notes}</p>}
                  <ContactActions customer={customer} />
                  <div className="actions">
                    <Button
                      size="sm"
                      disabled={identity?.profile.role === 'viewer'}
                      onClick={() => setEditing(p)}
                    >
                      עדכון טיפול
                    </Button>
                    {customer && <ContactNote customer={customer} />}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </Paginated>
      <RenewalEditor policy={editing} onClose={() => setEditing(null)} />
    </>
  )
}
