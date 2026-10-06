import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { Heading } from '@/components/shared'
import { Button } from '@/components/ui/button'
import type { DocumentRecord, Profile } from '@/domain/types'
import { toast } from 'sonner'

const roles = { admin: 'מנהל', editor: 'עריכה', viewer: 'צפייה בלבד' }
export function Security() {
  const { identity, isDemo } = useAuth()
  const cache = useQueryClient()
  const [busy, setBusy] = useState(false)
  const admin = identity?.profile.role === 'admin'
  const members = useQuery({
    queryKey: ['security-members', identity?.agency.id],
    enabled: admin && !isDemo,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('profiles')
        .select('id,agency_id,full_name,role')
        .order('full_name')
      if (error) throw error
      return data as Profile[]
    },
  })
  const trash = useQuery({
    queryKey: ['security-trash', identity?.agency.id],
    enabled: admin && !isDemo,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('documents')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as DocumentRecord[]
    },
  })
  async function changeRole(member: Profile, role: string) {
    setBusy(true)
    const { error } = await supabase!.rpc('set_member_role', {
      member_id: member.id,
      new_role: role,
    })
    if (error) toast.error('לא ניתן לשנות את ההרשאה. לא ניתן להסיר את המנהל האחרון.')
    else {
      await cache.invalidateQueries()
      toast.success('ההרשאה עודכנה')
    }
    setBusy(false)
  }
  async function restore(id: string) {
    setBusy(true)
    const { error } = await supabase!.rpc('archive_document', { document_id: id, archived: false })
    if (error) toast.error('שחזור המסמך נכשל')
    else {
      await cache.invalidateQueries()
      toast.success('המסמך שוחזר')
    }
    setBusy(false)
  }
  return (
    <>
      <Heading title="אבטחה והרשאות" subtitle="הרשאות הצוות ושחזור מסמכים" />
      <section className="panel" style={{ padding: 24 }}>
        <h2>הגנת החשבון</h2>
        <p>
          החשבון שלך: {identity ? roles[identity.profile.role] : ''}. נדרשת סיסמה ייחודית של 12
          תווים לפחות בעת קביעת סיסמה חדשה.
        </p>
        <p>
          המערכת מתנתקת לאחר 15 דקות ללא פעילות. החיבור מוגבל לשמונה שעות. אימות דו־שלבי אינו נדרש.
        </p>
        <p>
          המסמכים נשמרים באחסון פרטי. בדיקת סוג וגודל אינה סריקת אנטיוירוס. מסמך שלא נסרק ניתן
          להורדה רק למי שהעלה אותו, לאחר אישור מפורש.
        </p>
      </section>
      {admin && (members.data?.length || 0) > 1 && (
        <section className="panel" style={{ padding: 24, marginTop: 20 }}>
          <h2>הרשאות עובדים</h2>
          <p>
            מנהל יכול לנהל הרשאות ולשחזר מסמכים. משתמש עריכה יכול לעדכן נתונים ולהעלות מסמכים. משתמש
            צפייה אינו יכול לשנות נתונים.
          </p>
          {isDemo && <p>ניהול הרשאות זמין בסביבת העבודה המחוברת בלבד.</p>}
          {members.isError && <p role="alert">טעינת העובדים נכשלה</p>}
          {members.data?.map((member) => (
            <label className="field" key={member.id}>
              <span>{member.full_name}</span>
              <select
                className="field-control"
                value={member.role}
                disabled={busy}
                onChange={(e) => void changeRole(member, e.target.value)}
              >
                {Object.entries(roles).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </section>
      )}
      {admin && (
        <section className="panel" style={{ padding: 24, marginTop: 20 }}>
          <h2>סל מחזור למסמכים</h2>
          <p>מחיקה מעבירה לכאן ושומרת את הקובץ לשחזור. מוצגים עד 100 המסמכים האחרונים.</p>
          {trash.isError && <p role="alert">טעינת סל המחזור נכשלה</p>}
          {trash.data?.map((doc) => (
            <div className="toolbar" key={doc.id}>
              <span>{doc.file_name}</span>
              <Button disabled={busy} onClick={() => void restore(doc.id)}>
                שחזור
              </Button>
            </div>
          ))}
          {!trash.data?.length && <p>אין מסמכים בסל המחזור</p>}
        </section>
      )}
    </>
  )
}
