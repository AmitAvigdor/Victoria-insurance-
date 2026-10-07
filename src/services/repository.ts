import type {
  RenewalInput,
  ReviewedUpdate,
  Customer,
  CustomerInput,
  DocumentRecord,
  Policy,
  PolicyInput,
  Snapshot,
  Task,
  TaskInput,
} from '@/domain/types'
export interface Repository {
  load(): Promise<Snapshot>
  saveRenewal(policy: Policy, input: RenewalInput): Promise<void>
  addContactNote(customerId: string, note: string): Promise<void>
  applyImportUpdates(updates: ReviewedUpdate[]): Promise<void>
  saveCustomer(input: CustomerInput, id?: string): Promise<Customer>
  archiveCustomer(id: string, archived: boolean): Promise<void>
  savePolicy(input: PolicyInput, id?: string): Promise<Policy>
  saveTask(input: TaskInput, id?: string): Promise<Task>
  uploadDocument(
    file: File,
    customerId: string,
    policyId: string | null,
    documentType: string,
  ): Promise<void>
  documentUrl(document: DocumentRecord, download?: boolean): Promise<string>
  deleteDocument(document: DocumentRecord): Promise<void>
}
