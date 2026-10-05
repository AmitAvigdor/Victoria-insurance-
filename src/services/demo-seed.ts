import { addDays, today } from '@/domain/dates'
import type { Customer, Identity, Policy, Snapshot, Task } from '@/domain/types'
export const demoAgencyId = '11111111-1111-4111-8111-111111111111'
export const demoUserId = '22222222-2222-4222-8222-222222222222'
export const demoIdentity: Identity = {
  profile: { id: demoUserId, agency_id: demoAgencyId, full_name: 'דניאל ישראלי' },
  agency: { id: demoAgencyId, name: 'סוכנות לדוגמה' },
  email: 'agent@example.invalid',
}
export function createDemoData(): Snapshot {
  const names = [
    ['דוד', 'כהן'],
    ['נועה', 'לוי'],
    ['ישראל', 'ישראלי'],
    ['תמר', 'ברק'],
    ['אורי', 'גפן'],
    ['מיכל', 'שחר'],
    ['איתן', 'רז'],
    ['יעל', 'אור'],
    ['רוני', 'הדר'],
    ['אילנה', 'לביא'],
    ['עמית', 'שקד'],
    ['דנה', 'דרור'],
  ]
  const stamp = new Date().toISOString()
  const customers: Customer[] = names.map(([first_name, last_name], i) => ({
    id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    agency_id: demoAgencyId,
    first_name,
    last_name,
    identification_number: `0000000${String(i + 1).padStart(2, '0')}`,
    phone: `050-000-${String(i + 1).padStart(4, '0')}`,
    email: `customer${i + 1}@example.invalid`,
    date_of_birth: null,
    address: 'רחוב הדוגמה 1, עיר לדוגמה',
    notes: 'רשומה בדיונית להדגמה בלבד',
    archived_at: null,
    created_at: stamp,
    updated_at: stamp,
  }))
  const types = [
    'רכב',
    'דירה',
    'בריאות',
    'חיים',
    'עסק',
    'רכב',
    'דירה',
    'נסיעות',
    'בריאות',
    'רכב',
    'חיים',
    'עסק',
  ] as const
  const companies = ['הראל', 'מגדל', 'הפניקס', 'כלל', 'מנורה מבטחים', 'איילון']
  const offsets = [3, 7, 11, 15, 21, 28, 45, 60, -5, 120, 200, 300, 8, 17, 90, 180, 220, 250]
  const policies: Policy[] = offsets.map((offset, i) => ({
    id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    agency_id: demoAgencyId,
    customer_id: customers[i % 12].id,
    insurance_company: companies[i % 6],
    policy_number: `DEMO-${202600 + i}`,
    insurance_type: types[i % 12],
    start_date: addDays(-330),
    end_date: addDays(offset),
    premium: 1200 + i * 370,
    status: offset < 0 ? 'הסתיימה' : offset <= 30 ? 'עומדת לחידוש' : 'פעילה',
    notes: 'פוליסה בדיונית. סכום הפרמיה שנתי.',
    created_at: stamp,
    updated_at: stamp,
  }))
  const taskTitles = [
    'שיחה לקראת חידוש ביטוח הרכב',
    'שליחת הצעה לביטוח דירה',
    'השלמת מסמכי הצטרפות',
    'בדיקת כיסוי ביטוח בריאות',
    'מעקב אחרי הצעת חידוש',
    'עדכון פרטי לקוח',
  ]
  const tasks: Task[] = taskTitles.map((title, i) => ({
    id: `30000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    agency_id: demoAgencyId,
    customer_id: customers[i].id,
    policy_id: policies[i].id,
    title,
    description: 'משימת הדגמה עבור לקוח בדיוני',
    due_date: addDays(i - 1),
    priority: i < 2 ? 'גבוהה' : 'רגילה',
    status: i === 2 ? 'בטיפול' : 'פתוחה',
    created_at: stamp,
    updated_at: stamp,
  }))
  return {
    customers,
    policies,
    tasks,
    documents: [],
    activities: customers.slice(0, 5).map((c, i) => ({
      id: crypto.randomUUID(),
      agency_id: demoAgencyId,
      customer_id: c.id,
      user_id: demoUserId,
      action_type: 'customer.created',
      description: `נוצר כרטיס לקוח: ${c.first_name} ${c.last_name}`,
      created_at: new Date(
        `${today()}T${String(9 + i).padStart(2, '0')}:00:00+03:00`,
      ).toISOString(),
    })),
  }
}
