import { othersOf, useLive } from '@/editor/live'

const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'

/** Header: who else has this deck open right now (one avatar per person, however many tabs they have). */
export function PeerAvatars() {
  const peers = useLive((s) => s.peers)
  const me = useLive((s) => s.you?.userId)
  const connected = useLive((s) => s.connected)
  const people = [...new Map(othersOf(peers, me).map((p) => [p.userId, p])).values()]
  if (!connected && people.length === 0) return null
  return (
    <div className="flex items-center" role="group" aria-label={people.length ? `${people.length} other ${people.length === 1 ? 'person' : 'people'} here` : 'Live editing connected'}>
      {people.slice(0, 4).map((p, i) => (
        <span key={p.userId} title={`${p.name} is here`} data-peer-avatar={p.name} className="w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold text-white border-2 border-white" style={{ background: p.color, marginLeft: i ? -8 : 0 }}>{initials(p.name)}</span>
      ))}
      {people.length > 4 && <span className="w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold bg-slate-200 text-slate-700 border-2 border-white -ml-2">+{people.length - 4}</span>}
    </div>
  )
}
