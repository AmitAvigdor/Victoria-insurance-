import { randomBytes, scryptSync, createCipheriv, createDecipheriv, createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const magic = Buffer.from('VICTORIA-BACKUP-1\n')
export function encryptBackup(payload, password) {
  if (password.length < 16) throw new Error('Recovery key must contain at least 16 characters')
  const salt = randomBytes(16),
    iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', scryptSync(password, salt, 32), iv)
  cipher.setAAD(magic)
  const encrypted = Buffer.concat([
    cipher.update(gzipSync(Buffer.from(JSON.stringify(payload)))),
    cipher.final(),
  ])
  return Buffer.concat([magic, salt, iv, cipher.getAuthTag(), encrypted])
}
export function decryptBackup(bytes, password) {
  if (!bytes.subarray(0, magic.length).equals(magic)) throw new Error('Unsupported archive')
  const offset = magic.length
  const decipher = createDecipheriv(
    'aes-256-gcm',
    scryptSync(password, bytes.subarray(offset, offset + 16), 32),
    bytes.subarray(offset + 16, offset + 28),
  )
  decipher.setAAD(magic)
  decipher.setAuthTag(bytes.subarray(offset + 28, offset + 44))
  const decrypted = Buffer.concat([decipher.update(bytes.subarray(offset + 44)), decipher.final()])
  const payload = JSON.parse(
    gunzipSync(decrypted, { maxOutputLength: 512 * 1024 * 1024 }).toString('utf8'),
  )
  verifyBackup(payload)
  return payload
}
export function verifyBackup(payload) {
  if (
    payload.format !== 'victoria-business-backup-v1' ||
    !Array.isArray(payload.files) ||
    !payload.tables ||
    !Array.isArray(payload.migrations)
  )
    throw new Error('Invalid archive')
  const paths = new Set()
  for (const file of payload.files) {
    const bytes = Buffer.from(file.base64, 'base64')
    if (paths.has(file.path) || digest(bytes) !== file.sha256 || bytes.length !== file.size)
      throw new Error('File checksum mismatch')
    paths.add(file.path)
  }
  for (const doc of payload.tables.documents) {
    const file = payload.files.find((f) => f.path === doc.file_path)
    if (!file) throw new Error('A document file is missing')
    if (
      Number(doc.file_size) !== file.size ||
      (doc.content_sha256 && doc.content_sha256 !== file.sha256)
    )
      throw new Error('Document metadata checksum mismatch')
  }
  for (const migration of payload.migrations)
    if (digest(Buffer.from(migration.sql)) !== migration.sha256)
      throw new Error('Migration checksum mismatch')
}
