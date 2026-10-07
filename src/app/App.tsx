import { Component, lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster, toast } from 'sonner'
import { AuthProvider, useAuth } from './auth'
import { EditorsProvider } from '@/components/editors'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/shared'
import { Login } from '@/pages/Login'
import { ResetPassword } from '@/pages/ResetPassword'
import { Dashboard } from '@/pages/Dashboard'
import { Customers } from '@/pages/Customers'
import { CustomerProfile } from '@/pages/CustomerProfile'
import { Policies } from '@/pages/Policies'
import { Renewals } from '@/pages/Renewals'
import { Tasks } from '@/pages/Tasks'
import { Documents } from '@/pages/Documents'
import { SearchPage } from '@/pages/Search'
import { Today } from '@/pages/Today'
import { Commissions } from '@/pages/Commissions'
import { Security } from '@/pages/Security'
import { errorMessage } from '@/lib/utils'
const ImportPage = lazy(() => import('@/pages/Import'))
const ExportPage = lazy(() => import('@/pages/Export'))
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
})
function Protected() {
  const auth = useAuth()
  const location = useLocation()
  if (auth.loading)
    return (
      <div className="empty" role="status">
        טוען את סביבת העבודה…
      </div>
    )
  if (!auth.authenticated)
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (auth.error || !auth.identity)
    return (
      <div className="error-panel">
        <h1>השלמת חיבור לסוכנות</h1>
        <p>{auth.error || 'לא ניתן לטעון את פרטי המשתמש'}</p>
        <div className="actions" style={{ justifyContent: 'center' }}>
          <Button variant="outline" onClick={auth.retry}>
            ניסיון נוסף
          </Button>
          <Button onClick={() => void auth.logout().catch((e) => toast.error(errorMessage(e)))}>
            התנתקות
          </Button>
        </div>
      </div>
    )
  return (
    <EditorsProvider>
      <Layout />
    </EditorsProvider>
  )
}
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <div className="error-panel">
          <h1>משהו השתבש</h1>
          <p>הנתונים שנשמרו לא נמחקו. אפשר לרענן את העמוד ולנסות שוב.</p>
          <Button onClick={() => window.location.reload()}>רענון העמוד</Button>
        </div>
      )
    return this.props.children
  }
}
export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<Protected />}>
              <Route index element={<Dashboard />} />
              <Route path="today" element={<Today />} />
              <Route path="commissions" element={<Commissions />} />
              <Route path="customers" element={<Customers />} />
              <Route
                path="export"
                element={
                  <Suspense fallback={<p role="status">טוען את מסך הייצוא…</p>}>
                    <ExportPage />
                  </Suspense>
                }
              />
              <Route
                path="import"
                element={
                  <Suspense fallback={<p role="status">טוען את מסך הייבוא…</p>}>
                    <ImportPage />
                  </Suspense>
                }
              />
              <Route path="customers/:id" element={<CustomerProfile />} />
              <Route path="policies" element={<Policies />} />
              <Route path="renewals" element={<Renewals />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="documents" element={<Documents />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="security" element={<Security />} />
              <Route
                path="*"
                element={
                  <Empty
                    title="העמוד לא נמצא"
                    action={
                      <Button asChild>
                        <Link to="/">בחזרה לדשבורד</Link>
                      </Button>
                    }
                  />
                }
              />
            </Route>
          </Routes>
          <Toaster position="bottom-left" dir="rtl" richColors closeButton />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
