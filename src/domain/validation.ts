import { z } from 'zod'
import { insuranceTypes, policyStatuses, priorities, taskStatuses, renewalStages } from './types'
const text = (max: number) => z.string().trim().max(max, `עד ${max} תווים`)
const required = (max: number) => text(max).min(1, 'יש למלא את שדות החובה')
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'יש להזין תאריך תקין')
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    'יש להזין תאריך תקין',
  )
export const customerSchema = z.object({
  first_name: required(80),
  last_name: text(80),
  import_key: text(700).optional(),
  identification_number: z
    .string()
    .trim()
    .regex(/^(?:\d{9})?$/, 'מספר זהות חייב להכיל 9 ספרות או להישאר ריק'),
  phone: z
    .string()
    .trim()
    .regex(/^(?:[+\d\s()-]{7,25})?$/, 'יש להזין מספר טלפון תקין או להשאיר ריק'),
  email: z
    .union([z.literal(''), z.email('כתובת האימייל אינה תקינה')])
    .transform((v) => v.toLowerCase()),
  date_of_birth: date.nullable(),
  address: text(300),
  notes: text(5000),
})
export const renewalSchema = z.object({
  stage: z.enum(renewalStages),
  follow_up: date.nullable(),
  note: text(5000),
})
export const policySchema = z
  .object({
    customer_id: z.uuid('יש לבחור לקוח'),
    renewal_stage: z.enum(renewalStages).optional(),
    renewal_follow_up: date.nullable().optional(),
    renewal_notes: text(5000).optional(),
    commission_expected_amount: z.number().finite().min(0).max(999999999).nullable().optional(),
    commission_received_amount: z.number().finite().min(0).max(999999999).optional(),
    commission_due_date: date.nullable().optional(),
    insurance_company: required(100),
    policy_number: text(100),
    vehicle_registration: text(50).optional(),
    compulsory_value: text(300).optional(),
    comprehensive_value: text(300).optional(),
    commission: text(300).optional(),
    import_key: text(700).optional(),
    insurance_type: z.enum(insuranceTypes),
    start_date: date,
    end_date: date,
    premium: z
      .number()
      .finite()
      .min(0, 'פרמיה חייבת להיות חיובית או אפס')
      .max(999999999, 'הסכום גדול מדי')
      .nullable(),
    status: z.enum(policyStatuses),
    notes: text(5000),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: 'תאריך הסיום חייב להיות לאחר תאריך ההתחלה',
    path: ['end_date'],
  })
export const taskSchema = z
  .object({
    customer_id: z.uuid().nullable(),
    policy_id: z.uuid().nullable(),
    title: required(200),
    description: text(5000),
    due_date: date,
    priority: z.enum(priorities),
    status: z.enum(taskStatuses),
  })
  .refine((v) => !v.policy_id || !!v.customer_id, {
    message: 'לשיוך פוליסה יש לבחור לקוח',
    path: ['customer_id'],
  })
export const allowedMimeTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
export function validateFile(file: File) {
  if (!allowedMimeTypes.includes(file.type))
    throw new Error('אפשר להעלות PDF, JPG, PNG או DOCX בלבד')
  if (file.size === 0 || file.size > 10 * 1024 * 1024)
    throw new Error('גודל הקובץ חייב להיות בין 1 בייט ל־10MB')
  if (file.name.length > 240) throw new Error('שם הקובץ ארוך מדי')
}
