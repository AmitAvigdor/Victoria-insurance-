import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './auth'
export function useData() {
  const { repository, identity, isDemo } = useAuth()
  return useQuery({
    queryKey: ['agency-data', isDemo ? 'demo' : identity?.profile.id, identity?.agency.id],
    queryFn: () => repository!.load(),
    enabled: !!repository,
    retry: 1,
    staleTime: 30_000,
  })
}
export function useRefresh() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: ['agency-data'] })
}
