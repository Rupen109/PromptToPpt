import { Portal } from '@/components/Portal'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { ApiError, isGateError } from '@prompttoppt/api-client'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { useProjects } from '@/lib/projects'
import { useUser } from '@/lib/session'
import { useDialog } from '@/lib/useDialog'
import { Logo } from '@prompttoppt/ui/logo'

const item = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] hover:bg-black/5'
const active = 'bg-black/5 font-medium'

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
  const { ent, upgrade } = useEntitlements()
  const { projects, loaded, load } = useProjects()
  const [newProject, setNewProject] = useState(false)
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
      <Link to="/" aria-label="promptToPpt home" className="px-2 pt-2 pb-3"><Logo size={30} /></Link>
      <div className="flex items-center gap-2 px-2 py-3 mb-2 border-t border-border">
        <div className="w-8 h-8 rounded-md bg-accent text-white grid place-items-center font-bold">{user.name.charAt(0).toUpperCase()}</div>
        <span className="font-semibold truncate">{user.name}</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Main">
        <NavLink to="/" end className={({ isActive }) => `${item} ${isActive ? active : ''}`}>Home</NavLink>
        <NavLink to="/created" className={({ isActive }) => `${item} ${isActive ? active : ''}`}>Created by me</NavLink>
        <NavLink to="/templates" className={({ isActive }) => `${item} ${isActive ? active : ''}`}>Templates</NavLink>

        <div className="pt-4 px-3 flex items-center justify-between text-sm text-slate-500">
          <span>Projects</span>
        </div>
        {projects.map((p) => (
          <NavLink key={p.id} to={`/projects/${p.id}`} className={({ isActive }) => `${item} ${isActive ? active : ''}`}>
            <span className="truncate flex-1">📁 {p.name}</span>
            <span className="text-xs text-slate-500">{p.decks}</span>
          </NavLink>
        ))}
        <button
          onClick={() => (canProjects ? setNewProject(true) : upgrade.show('Projects are available on the Pro plan.'))}
          className={`${item} w-full text-left`}
        >
          ＋ Create project {ent && !canProjects && <Badge>PRO</Badge>}
        </button>
        {user.role === 'admin' && <Link to="/admin" className={`${item} text-primary font-medium`}>Owner dashboard</Link>}
      </nav>
      {ent && (
        <div className="mx-1 mb-3 rounded-xl border border-border p-3 text-sm" aria-label="Plan and credits">
          <div className="flex items-center justify-between"><span className="font-semibold">{ent.plan.name}</span><span className="flex gap-3">{ent.plan.id !== 'gold' && <button onClick={() => upgrade.show()} className="text-primary text-xs font-semibold">Upgrade</button>}<Link to="/billing" className="text-slate-500 text-xs">Billing</Link></span></div>
          <div className="text-slate-600 mt-1">{ent.credits.balance.toLocaleString()} <span className="text-slate-500">/ {ent.credits.monthlyAllowance.toLocaleString()} credits</span></div>
          <div className="h-1.5 rounded-full bg-slate-200 mt-2 overflow-hidden"><div className="h-full bg-primary" style={{ width: `${Math.min(100, (ent.credits.balance / ent.credits.monthlyAllowance) * 100)}%` }} /></div>
        </div>
      )}
      <button
        onClick={async () => {
          await api.auth.signOut()
          window.location.reload()
        }}
        className={`${item} text-left`}
      >
        Log out
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
        <Link to="/" aria-label="promptToPpt home"><Logo size={26} /></Link>
        <div className="w-8 h-8 rounded-md bg-accent text-white grid place-items-center font-bold text-sm" aria-hidden>{user.name.charAt(0).toUpperCase()}</div>
      </header>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside role="dialog" aria-modal="true" aria-label="Menu" className="absolute left-0 top-0 bottom-0 w-[290px] max-w-[85vw] bg-white flex flex-col p-3 shadow-xl overflow-y-auto text-slate-800">
            <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute right-2 top-2 w-10 h-10 grid place-items-center rounded-lg hover:bg-black/5 text-2xl leading-none">×</button>
            {body}
          </aside>
        </div>
      )}
      {newProject && <NewProjectDialog onClose={() => setNewProject(false)} />}
    </>
  )
}
