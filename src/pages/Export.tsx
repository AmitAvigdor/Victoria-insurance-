import { useEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/app/auth'
import { useData } from '@/app/data'
import { Heading } from '@/components/shared'
import { Button } from '@/components/ui/button'
import {
  createExportBuffer,
  exportCounts,
  exportScope,
  exportSections,
  type ExportSection,
} from '@/domain/export'
import { errorMessage } from '@/lib/utils'

export default function ExportPage() {
  const { identity, repository } = useAuth()
  const { data } = useData()
  const [sections, setSections] = useState<ExportSection[]>(exportSections.map((s) => s.key))
  const [includeArchived, setIncludeArchived] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState<{ url: string; name: string; count: number } | null>(null)
  const generation = useRef(0)
  const fileUrl = useRef<string | null>(null)
  function discardFile() {
    if (fileUrl.current) URL.revokeObjectURL(fileUrl.current)
    fileUrl.current = null
    setReady(null)
  }
  useEffect(
    () => () => {
      generation.current++
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current)
    },
    [],
  )
  if (!data || !identity || !repository) return null
  const options = { agencyId: identity.agency.id, sections, includeArchived }
  const counts = exportCounts(exportScope(data, options))
  async function prepare() {
    if (busy || !sections.length || !repository) return
    discardFile()
    const operation = ++generation.current
    setBusy(true)
    try {
      // Reload through the signed-in user's repository; never use administrator credentials.
      const fresh = await repository.load()
      if (generation.current !== operation) return
      const buffer = createExportBuffer(fresh, options)
      const url = URL.createObjectURL(
        new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      )
      fileUrl.current = url
      const time = new Date().toISOString().replace(/[:.]/g, '-')
      setReady({ url, name: `victoria-${time}.xlsx`, count: sections.length })
    } catch (e) {
      if (generation.current === operation) toast.error(errorMessage(e))
    } finally {
      if (generation.current === operation) setBusy(false)
    }
  }
  return (
    <>
      <Heading
        title="ייצוא לאקסל"
        subtitle="בחרו את הנתונים והורידו קובץ אקסל עם גיליון נפרד לכל סוג מידע."
      />
      <section className="panel import-panel">
        <h2>הנתונים בקובץ</h2>
        <p>ביטוחי הרכב יופיעו גם במבנה העמודות של האקסל המקורי שלכם.</p>
        <fieldset className="import-fieldset" disabled={busy}>
          <legend className="sr-only">בחירת גיליונות לייצוא</legend>
          <div className="export-sections">
            {exportSections.map((section) => (
              <label className="import-check" key={section.key}>
                <input
                  type="checkbox"
                  checked={sections.includes(section.key)}
                  onChange={(e) => {
                    discardFile()
                    setSections((current) =>
                      e.target.checked
                        ? [...current, section.key]
                        : current.filter((key) => key !== section.key),
                    )
                  }}
                />
                <span>
                  {section.label} <span className="muted">({counts[section.key]})</span>
                </span>
              </label>
            ))}
          </div>
          <label className="import-check export-archive">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => {
                discardFile()
                setIncludeArchived(e.target.checked)
              }}
            />
            <span>כלול גם לקוחות בארכיון והנתונים המקושרים אליהם</span>
          </label>
        </fieldset>
        <p className="small muted">
          רשימת המסמכים כוללת פרטי קבצים בלבד. המסמכים עצמם נכללים בגיבוי המוצפן.
        </p>
        <p className="import-note">
          קובץ האקסל מכיל מידע אישי ואינו מוצפן. שמרו אותו במקום מוגן. זהו ייצוא לעבודה באקסל;
          הגיבוי המוצפן נשאר נפרד.
        </p>
        <div className="form-actions">
          <Button disabled={busy || !sections.length} onClick={() => void prepare()}>
            <FileSpreadsheet size={17} />
            {busy ? 'מכין קובץ…' : ready ? 'הכנת קובץ מעודכן' : 'הכנת קובץ אקסל'}
          </Button>
          {ready && (
            <Button asChild>
              <a href={ready.url} download={ready.name}>
                <Download size={17} />
                הורדת קובץ האקסל
              </a>
            </Button>
          )}
        </div>
        {ready && (
          <p role="status">
            הקובץ מוכן עם {ready.count === 1 ? 'גיליון אחד' : `${ready.count} גיליונות`}. לחצו על
            הורדה לשמירה במכשיר. באייפון אפשר למצוא אותו באפליקציית ״קבצים״, בתיקיית ההורדות.
          </p>
        )}
      </section>
    </>
  )
}
