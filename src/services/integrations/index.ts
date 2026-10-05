// Future adapters belong here. No BAFI, AI, email or messaging provider is implemented.
// Adapters must run server-side with an authenticated agency context and map external
// records into validated domain inputs; never store provider secrets in VITE_* variables.
export interface IntegrationContext {
  agencyId: string
  actorId: string
}
export interface IntegrationAdapter {
  readonly provider: string
  verifyConnection(context: IntegrationContext): Promise<boolean>
}
