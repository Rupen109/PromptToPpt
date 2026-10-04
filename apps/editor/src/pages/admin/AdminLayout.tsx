import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useUser } from '@/lib/session'
import { CurrencyProvider, CurrencyToggle } from './currency'

const NAV = [
  ['Usage', [['/admin', 'Overview'], ['/admin/tokens', 'Tokens'], ['/admin/models', 'Models'], ['/admin/providers', 'Providers'], ['/admin/cloud', 'Google Cloud'], ['/admin/performance', 'Performance'], ['/admin/errors', 'Errors']]],
  ['Business', [['/admin/sales', 'Sales & revenue'], ['/admin/subscriptions', 'Subscriptions'], ['/admin/margin', 'Cost & margin'], ['/admin/users', 'Users'], ['/admin/countries', 'Countries']]],
  ['Product', [['/admin/presentations', 'Presentations'], ['/admin/prompts', 'Prompts / use cases'], ['/admin/images', 'Images'], ['/admin/exports', 'Exports']]],
  ['Control', [['/admin/flags', 'Feature flags'], ['/admin/audit', 'Audit logs']]],
] as const

const ALL_PATHS: string[] = NAV.flatMap(([, items]) => items.map(([to]) => to as string))

export default function AdminLayout() {
  const user = useUser()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  if (user.role !== 'admin') {
    return (
      <div className="min-h-screen grid place-items-center text-center p-6">
        <div>
          <h1 className="font-bold text-xl mb-2">Not authorised</h1>
          <p className="text-slate-600">The owner dashboard is only available to administrators.</p>
          <a href="/" className="text-primary font-semibold mt-4 inline-block">Back to home</a>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#f7f7f8]">
      {/* phone / tablet: sections as a jump menu instead of a fixed sidebar */}
      <div className="lg:hidden sticky top-0 z-30 bg-white border-b border-border flex items-center gap-2 px-3 h-14">
        <a href="/" aria-label="Back to the app" className="font-bold text-lg w-8 grid place-items-center">⌂</a>
        <label className="sr-only" htmlFor="admin-section">Dashboard section</label>
        <select id="admin-section" value={ALL_PATHS.includes(pathname) ? pathname : '/admin'} onChange={(e) => navigate(e.target.value)} className="flex-1 min-w-0 border border-border rounded-lg h-10 px-3 text-sm bg-white">
          {NAV.map(([group, items]) => <optgroup key={group} label={group}>{items.map(([to, label]) => <option key={to} value={to}>{label}</option>)}</optgroup>)}
        </select>
      </div>
      <aside className="hidden lg:block w-[220px] shrink-0 bg-white border-r border-border p-3 sticky top-0 h-screen overflow-y-auto">
        <a href="/" className="block px-2 py-3 font-heading font-extrabold">promptToPpt <span className="text-xs font-semibold text-slate-500">Owner</span></a>
        <nav aria-label="Owner dashboard" className="space-y-1 mt-2">
          {NAV.map(([group, items]) => (
            <div key={group}>
              <div className="pt-4 pb-1 px-3 text-[11px] font-bold tracking-wide text-slate-500 uppercase">{group}</div>
              {items.map(([to, label]) => (
                <NavLink key={to} to={to} end={to === '/admin'} className={({ isActive }) => `block px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-foreground text-white' : 'hover:bg-slate-100'}`}>{label}</NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-[1200px]"><CurrencyProvider><div className="flex justify-end mb-2"><CurrencyToggle /></div><Outlet /></CurrencyProvider></main>
    </div>
  )
}
