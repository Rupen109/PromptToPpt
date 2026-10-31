import { ChevronDown, CreditCard, Folder, Home, LayoutTemplate, LifeBuoy, LogOut, MonitorPlay, PencilRuler, Plus, RefreshCw, ShieldCheck, Star, Users, X } from '@prompttoppt/ui/icons'
import { Portal } from '@/components/Portal'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { ApiError, isGateError } from '@prompttoppt/api-client'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { useProjects } from '@/lib/projects'
import { WEB_URL } from '@/lib/env'
import { useUser } from '@/lib/session'
import { useDialog } from '@/lib/useDialog'
import { Logo } from '@prompttoppt/ui/logo'
import { ReviewDialog } from '@/components/ReviewDialog'

const item = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] hover:bg-black/5'
const active = 'bg-black/5 font-medium'

/** The sidebar's icons: the shared lucide set at 20px / 1.8 stroke. Decorative: the label next to each one names the item. */
const ICONS = { home: Home, created: MonitorPlay, scratch: PencilRuler, templates: LayoutTemplate, shared: Users, billing: CreditCard, folder: Folder, plus: Plus, admin: ShieldCheck, logout: LogOut } as const
function Icon({ name }: { name: keyof typeof ICONS }) {
  const I = ICONS[name]
  return <I size={20} strokeWidth={1.8} aria-hidden className="shrink-0 text-slate-500" />
}

function Badge({ children, title }: { children: string; title?: string }) {
  return <span title={title} className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">{children}</span>
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const create = useProjects((s) => s.create)
  const { upgrade } = useEntitlements()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useDialog<HTMLFormElement>(true, onClose)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const p = await create(name.trim())
      onClose()
      navigate(`/projects/${p.id}`)
    } catch (err) {
      if (isGateError(err) && err.code === 'UPGRADE_REQUIRED') {
        onClose()
        upgrade.show(err.message)
      } else setError(err instanceof ApiError ? err.message : 'Could not create the project.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Portal><div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Create project" onSubmit={submit} className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl outline-none">
        <h2 className="font-heading font-bold text-xl mb-1">Create project</h2>
        <p className="text-sm text-slate-600 mb-4">A project is a folder for related presentations — a client, a campaign, a quarter.</p>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Project name" placeholder="e.g. Q4 board meeting" className="w-full border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-primary" />
        {error && <p role="alert" className="text-sm text-red-700 mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border">Cancel</button>
          <button disabled={!name.trim() || busy} className="px-4 py-2 text-sm rounded-lg bg-primary text-white font-semibold disabled:opacity-50">{busy ? 'Creating…' : 'Create'}</button>
        </div>
      </form>
    </div></Portal>
  )
}

export function Sidebar() {
  const user = useUser()
  const { ent, upgrade, refresh } = useEntitlements()
  const { projects, loaded, load } = useProjects()
  const [newProject, setNewProject] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [accountMenu, setAccountMenu] = useState(false)
  const [refreshing, setRefreshing] = useState<'idle' | 'busy' | 'done'>('idle')
  const { pathname } = useLocation()
  // phone / tablet drawer: open for one route only, so navigating anywhere closes it without an effect
  const [openFor, setOpenFor] = useState<string | null>(null)
  const open = openFor === pathname
  const setOpen = (v: boolean) => setOpenFor(v ? pathname : null)
  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const canProjects = ent?.features.projects ?? false

  const body = (
    <>
      <Link to="/" aria-label="SlidesDone home" className="px-2 pt-2 pb-3"><Logo size={30} /></Link>
      <div className="relative mb-2 border-t border-border">
        <button type="button" aria-haspopup="menu" aria-expanded={accountMenu} onClick={() => setAccountMenu((v) => !v)} className="flex w-full items-center gap-2 rounded-lg px-2 py-3 text-left hover:bg-black/5">
          <div className="w-8 h-8 shrink-0 rounded-md bg-accent text-white grid place-items-center font-bold">{user.name.charAt(0).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate">{user.name}</div>
            <div className="text-xs text-slate-500 truncate" title={user.email}>{user.email}</div>
          </div>
          <ChevronDown size={16} aria-hidden className={`shrink-0 text-slate-500 transition-transform ${accountMenu ? 'rotate-180' : ''}`} />
        </button>
        {accountMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setAccountMenu(false)} />
            <div role="menu" aria-label="Account" className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-border bg-white p-1 shadow-lg">
              <a role="menuitem" href={`${WEB_URL}/support`} target="_blank" rel="noreferrer" onClick={() => setAccountMenu(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm hover:bg-black/5"><LifeBuoy size={18} strokeWidth={1.8} aria-hidden className="text-slate-500" />Support</a>
              <button
                role="menuitem"
                type="button"
                disabled={refreshing === 'busy'}
                onClick={async () => {
                  setRefreshing('busy')
                  await refresh()
                  setRefreshing('done')
                  setTimeout(() => { setRefreshing('idle'); setAccountMenu(false) }, 1200)
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-black/5 disabled:opacity-70"
              >
                <RefreshCw size={18} strokeWidth={1.8} aria-hidden className={`text-slate-500 ${refreshing === 'busy' ? 'animate-spin' : ''}`} />
                {refreshing === 'busy' ? 'Refreshing…' : refreshing === 'done' ? 'Plan and credits updated' : 'Refresh plan & credits'}
              </button>
            </div>
          </>
        )}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Main">
        <NavLink to="/" end className={({ isActive }) => `${item} ${isActive ? active : ''}`}><Icon name="home" />Home</NavLink>
        <NavLink to="/scratch" className={({ isActive }) => `${item} ${isActive ? active : ''}`}><Icon name="scratch" />Create from scratch</NavLink>
        <NavLink to="/created" className={({ isActive }) => `${item} ${isActive ? active : ''}`}><Icon name="created" />Created by me</NavLink>
        <NavLink to="/templates" className={({ isActive }) => `${item} ${isActive ? active : ''}`}><Icon name="templates" />Templates</NavLink>
        <NavLink to="/shared" className={({ isActive }) => `${item} ${isActive ? active : ''}`}><Icon name="shared" />Shared with me</NavLink>
        <NavLink to="/billing" className={({ isActive }) => `${item} ${isActive ? active : ''}`}><Icon name="billing" />Billing</NavLink>

        <div className="pt-4 px-3 flex items-center justify-between text-sm text-slate-500">
          <span>Projects</span>
        </div>
        {projects.map((p) => (
          <NavLink key={p.id} to={`/projects/${p.id}`} className={({ isActive }) => `${item} ${isActive ? active : ''}`}>
            <Icon name="folder" /><span className="truncate flex-1">{p.name}</span>
            <span className="text-xs text-slate-500">{p.decks}</span>
          </NavLink>
        ))}
        <button
          onClick={() => (canProjects ? setNewProject(true) : upgrade.show('Projects are available on the Pro plan.'))}
          className={`${item} w-full text-left`}
        >
          <Icon name="plus" />Create project {ent && !canProjects && <Badge>PRO</Badge>}
        </button>
        {user.role === 'admin' && <Link to="/admin" className={`${item} text-primary font-medium`}><Icon name="admin" />Owner dashboard</Link>}
      </nav>
      <button onClick={() => setReviewing(true)} className={`${item} text-left`}><Star size={20} strokeWidth={1.8} aria-hidden className="shrink-0 text-slate-500" />Rate SlidesDone</button>
      <button
        onClick={async () => {
          await api.auth.signOut()
          window.location.reload()
        }}
        className={`${item} text-left`}
      >
        <Icon name="logout" />Log out
      </button>
    </>
  )

  return (
    <>
      <aside className="hidden lg:flex w-[240px] shrink-0 border-r border-border bg-white h-screen sticky top-0 flex-col p-3 text-slate-800">{body}</aside>

      {/* phone / tablet: a slim top bar + a slide-in drawer with the same menu */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 bg-white border-b border-border flex items-center justify-between px-3">
        <button type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} className="w-11 h-11 -ml-1 grid place-items-center rounded-lg hover:bg-black/5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <Link to="/" aria-label="SlidesDone home"><Logo size={26} /></Link>
        <div className="w-8 h-8 rounded-md bg-accent text-white grid place-items-center font-bold text-sm" aria-hidden>{user.name.charAt(0).toUpperCase()}</div>
      </header>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside role="dialog" aria-modal="true" aria-label="Menu" className="absolute left-0 top-0 bottom-0 w-[290px] max-w-[85vw] bg-white flex flex-col p-3 shadow-xl overflow-y-auto text-slate-800">
            <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute right-2 top-2 w-10 h-10 grid place-items-center rounded-lg hover:bg-black/5 text-2xl leading-none"><X aria-hidden size={24} /></button>
            {body}
          </aside>
        </div>
      )}
      {newProject && <NewProjectDialog onClose={() => setNewProject(false)} />}
      {reviewing && <ReviewDialog onClose={() => setReviewing(false)} />}
    </>
  )
}
