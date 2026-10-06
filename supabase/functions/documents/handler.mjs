const MAX_SIZE = 10 * 1024 * 1024
async function readLimited(req, limit) {
  const reader = req.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}
const extensions = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}
export function matchesSignature(bytes, mime) {
  const starts = (prefix) => prefix.every((b, i) => bytes[i] === b)
  return (
    (mime === 'application/pdf' && starts([37, 80, 68, 70, 45])) ||
    (mime === 'image/jpeg' && starts([255, 216, 255])) ||
    (mime === 'image/png' && starts([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
      starts([80, 75, 3, 4]))
  )
}
export function createHandler({ createClient, url, publicKey, secretKey, origins }) {
  return async (req) => {
    const origin = req.headers.get('origin')
    const cors = origin && origins.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}
    const headers = {
      ...cors,
      Vary: 'Origin',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }
    const reply = (status, value) => new Response(JSON.stringify(value), { status, headers })
    if (origin && !origins.includes(origin)) return reply(403, { error: 'מקור הבקשה אינו מורשה' })
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (req.method !== 'POST') return reply(405, { error: 'פעולה לא נתמכת' })
    const authorization = req.headers.get('authorization') || ''
    if (!authorization.startsWith('Bearer ')) return reply(401, { error: 'יש להתחבר מחדש' })
    const user = createClient(url, publicKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    try {
      const auth = await user.auth.getUser()
      if (auth.error || !auth.data.user) return reply(401, { error: 'יש להתחבר מחדש' })
      const upload = (req.headers.get('content-type') || '').startsWith('multipart/form-data')
      const permitted = await user.rpc('authorize_document_request', {
        operation: upload ? 'upload' : 'access',
      })
      if (permitted.error)
        return reply(permitted.error.code === '54000' ? 429 : 403, {
          error: 'הפעולה חסומה או שבוצעו בקשות רבות מדי',
        })
      const identity = permitted.data
      if (identity.user_id !== auth.data.user.id) return reply(403, { error: 'הפעולה חסומה' })
      if (!upload) {
        const input = await readLimited(req, 1024)
        if (!input) return reply(413, { error: 'בקשה גדולה מדי' })
        const body = JSON.parse(new TextDecoder().decode(input))
        if (typeof body.document_id !== 'string') return reply(400, { error: 'מסמך לא תקין' })
        const document = await user.rpc('request_document_access', {
          document_id: body.document_id,
          accept_unscanned: body.accept_unscanned === true,
        })
        if (document.error || !document.data)
          return reply(403, { error: 'המסמך ממתין לסריקת אבטחה, הוסר או אינו זמין' })
        const d = Array.isArray(document.data) ? document.data[0] : document.data
        if (
          !d ||
          d.agency_id !== identity.agency_id ||
          (d.scan_status !== 'clean' &&
            !(
              d.scan_status === 'unscanned' &&
              d.uploaded_by === identity.user_id &&
              body.accept_unscanned === true
            )) ||
          d.deleted_at
        )
          return reply(403, { error: 'מסמך לא זמין' })
        const signed = await admin.storage
          .from('customer-documents')
          .createSignedUrl(
            d.file_path,
            60,
            body.download === true || d.scan_status === 'unscanned'
              ? { download: d.file_name }
              : {},
          )
        if (signed.error) return reply(503, { error: 'לא ניתן לפתוח את המסמך כרגע' })
        return reply(200, { url: signed.data.signedUrl })
      }
      if (Number(req.headers.get('content-length')) > MAX_SIZE + 65536)
        return reply(413, { error: 'הקובץ גדול מדי' })
      // Cap the streamed request too; Content-Length is not trusted.
      const reader = req.body?.getReader()
      if (!reader) return reply(400, { error: 'קובץ חסר' })
      const chunks = []
      let total = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.length
        if (total > MAX_SIZE + 65536) {
          await reader.cancel()
          return reply(413, { error: 'הקובץ גדול מדי' })
        }
        chunks.push(value)
      }
      const form = await new Response(new Blob(chunks), {
        headers: { 'Content-Type': req.headers.get('content-type') },
      }).formData()
      const file = form.get('file')
      const customerId = String(form.get('customer_id') || '')
      const policyId = String(form.get('policy_id') || '') || null
      const documentType = String(form.get('document_type') || '').trim()
      if (
        !file ||
        typeof file === 'string' ||
        !extensions[file.type] ||
        file.size < 1 ||
        file.size > MAX_SIZE ||
        file.name.length > 240 ||
        !documentType ||
        documentType.length > 100
      )
        return reply(400, { error: 'פרטי הקובץ אינם תקינים' })
      // Validate ownership before privileged Storage writes.
      const customer = await user.from('customers').select('id').eq('id', customerId).single()
      if (customer.error || !customer.data) return reply(403, { error: 'לקוח לא זמין' })
      if (policyId) {
        const policy = await user
          .from('policies')
          .select('id')
          .eq('id', policyId)
          .eq('customer_id', customerId)
          .single()
        if (policy.error || !policy.data) return reply(403, { error: 'פוליסה לא זמינה' })
      }
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!matchesSignature(bytes, file.type))
        return reply(400, { error: 'תוכן הקובץ אינו מתאים לסוג שצוין' })
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      const id = crypto.randomUUID()
      const path = `${identity.agency_id}/${customerId}/${id}.${extensions[file.type]}`
      const stored = await admin.storage
        .from('customer-documents')
        .upload(path, bytes, { contentType: file.type, upsert: false })
      if (stored.error) return reply(503, { error: 'העלאת הקובץ נכשלה' })
      // User attribution is explicit because the insert uses the server credential.
      const inserted = await admin.from('documents').insert({
        id,
        agency_id: identity.agency_id,
        customer_id: customerId,
        policy_id: policyId,
        file_name: file.name,
        file_path: path,
        document_type: documentType,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: identity.user_id,
        scan_status: 'unscanned',
        content_sha256: hash,
      })
      if (inserted.error) {
        await admin.storage.from('customer-documents').remove([path])
        return reply(503, { error: 'שמירת המסמך נכשלה' })
      }
      return reply(201, { id, scan_status: 'unscanned' })
    } catch {
      return reply(400, { error: 'לא ניתן להשלים את הבקשה' })
    }
  }
}
