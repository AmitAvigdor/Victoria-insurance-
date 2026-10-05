import { useEffect, useState, type FormEvent } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  RefreshCw,
  CheckSquare,
  Files,
  Building2,
  Search,
  ChevronLeft,
  ChevronsUpDown,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/app/auth'
import { useData } from '@/app/data'
import { renewals } from '@/domain/selectors'
import { errorMessage } from '@/lib/utils'
import { Button } from './ui/button'
import { DataBoundary } from './shared'
const nav = [
  { path: '/', label: 'דשבורד', icon: LayoutDashboard },
  { path: '/customers', label: 'לקוחות', icon: Users },
  { path: '/policies', label: 'פוליסות', icon: ShieldCheck },
  { path: '/renewals', label: 'חידושים', icon: RefreshCw },
  { path: '/tasks', label: 'משימות', icon: CheckSquare },
  { path: '/documents', label: 'מסמכים', icon: Files },
]
export function Layout() {
  const { identity, isDemo, logout } = useAuth()
  const { data } = useData()
  const location = useLocation()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState('')
  useEffect(() => {
    const closeMenu = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false)
    }
    window.addEventListener('keydown', closeMenu)
    return () => window.removeEventListener('keydown', closeMenu)
  }, [])
  const current =
    nav.find((n) =>
      n.path === '/' ? location.pathname === '/' : location.pathname.startsWith(n.path),
    )?.label || 'חיפוש'
  const count = data ? renewals(data.policies, 30).length : 0
  function runSearch(e: FormEvent) {
    e.preventDefault()
    navigate(`/search?q=${encodeURIComponent(search.trim())}`)
  }
  return (
    <div className="app-shell">
      {menu && <div className="sidebar-shade" onClick={() => setMenu(false)} />}
      <aside
        id="main-navigation"
        className={`sidebar ${menu ? 'open' : ''}`}
        aria-label="תפריט ראשי"
      >
        <NavLink to="/" className="brand" onClick={() => setMenu(false)}>
          <div className="brand-mark">
            <img src="/favicon.svg" alt="" />
          </div>
          <div>
            <div className="brand-name">ויקטוריה</div>
            <div className="brand-caption">כל הסוכנות. במקום אחד.</div>
          </div>
        </NavLink>
        <div className="workspace">
          <div className="workspace-icon">
            <Building2 size={17} />
          </div>
          <span>{identity?.agency.name}</span>
        </div>
        <div className="nav-caption">ניהול הסוכנות</div>
        <nav className="nav">
          {nav.map((n) => (
            <NavLink key={n.path} to={n.path} end={n.path === '/'} onClick={() => setMenu(false)}>
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.path === '/renewals' && count > 0 && <span className="nav-count">{count}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {isDemo ? (
            <div className="demo-label">
              סביבת הדגמה
              <br />
              נתונים בדיוניים · נשמרים במכשיר זה
            </div>
          ) : (
            <div className="small muted">
              סביבת העבודה של
              <br />
              {identity?.agency.name}
            </div>
          )}
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <Button
            className="mobile-menu"
            variant="ghost"
            size="icon"
            aria-label={menu ? 'סגירת תפריט' : 'פתיחת תפריט'}
            aria-expanded={menu}
            aria-controls="main-navigation"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X size={20} /> : <Menu size={20} />}
          </Button>
          <div className="breadcrumbs">
            <span>סביבת עבודה</span>
            <ChevronLeft size={14} />
            <strong>{current}</strong>
          </div>
          <div className="top-actions">
            <form className="top-search" onSubmit={runSearch}>
              <Search size={16} />
              <input
                aria-label="חיפוש כללי"
                placeholder="חיפוש לקוחות, פוליסות…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </form>
            <DropdownMenu.Root dir="rtl">
              <DropdownMenu.Trigger asChild>
                <button className="profile-trigger" aria-label="תפריט משתמש">
                  <div className="avatar">
                    {identity?.profile.full_name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')}
                  </div>
                  <span>
                    <strong>{identity?.profile.full_name}</strong>
                    <small>סוכן ביטוח</small>
                  </span>
                  <ChevronsUpDown size={14} color="#98a58e" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="dropdown" align="end" sideOffset={12}>
                  <DropdownMenu.Label className="dropdown-label">
                    <span className="ltr">{identity?.email}</span>
                  </DropdownMenu.Label>
                  <DropdownMenu.Item
                    className="dropdown-item"
                    onSelect={() => {
                      void logout().catch((e) => toast.error(errorMessage(e)))
                    }}
                  >
                    <LogOut size={16} />
                    התנתקות
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>
        <div className="content">
          <DataBoundary>
            <Outlet />
          </DataBoundary>
          <footer className="footer-note">
            ויקטוריה · ניהול סוכנות ביטוח{isDemo ? ' · סביבת הדגמה עם נתונים בדיוניים' : ''}
          </footer>
        </div>
      </main>
    </div>
  )
}
