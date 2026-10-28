import { useEffect, useState } from 'react'

/** The AI "thinking" indicator: a living orb, a shimmering title, and a status line that changes every couple of seconds. */
export function ThinkingLoader({ title = 'Thinking…', messages }: { title?: string; messages: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (messages.length < 2) return
    const t = setInterval(() => setI((n) => (n + 1) % messages.length), 2400)
    return () => clearInterval(t)
  }, [messages.length])
  return (
    <div className="mt-7 flex items-center gap-3" role="status" aria-live="polite">
      <span className="pt-orb" aria-hidden><i /><b /></span>
      <div className="min-w-0">
        <div className="flex items-center font-heading font-bold text-sm"><span className="pt-shimmer">{title}</span><span className="pt-dots ml-1.5" aria-hidden><span /><span /><span /></span></div>
        <p key={i} className="pt-rise text-xs text-slate-500 mt-0.5">{messages[i]}</p>
      </div>
    </div>
  )
}
