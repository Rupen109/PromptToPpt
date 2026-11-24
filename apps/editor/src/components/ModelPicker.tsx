import type { ModelOption } from '@prompttoppt/api-client'

// the picker's groups (Premium only): everyday Gemini models, and the "Pro AI models" the pricing page names (Gemini 3.1 Pro)
const TIER_LABEL = { starter: 'Standard', premium: 'Pro', frontier: 'Pro' } as const

/**
 * Model chooser: ONLY the models the user's plan can use are shown (no locked, greyed-out Gold/Pro rows). The server still
 * re-validates the choice against the real plan on every job. `highlight` draws attention to the chooser (e.g. "pick a model to start").
 */
export function ModelPicker({ models, value, onChange, highlight = false, hint }: { models: ModelOption[]; value: string | null; onChange: (id: string) => void; highlight?: boolean; hint?: string }) {
  const tiers = (['Standard', 'Pro'] as const).map((label) => ({ tier: label, items: models.filter((m) => m.allowed && TIER_LABEL[m.tier as keyof typeof TIER_LABEL] === label) })).filter((g) => g.items.length)
  return (
    <fieldset className={`mt-6 rounded-2xl p-3 -mx-3 transition ${highlight ? 'ring-2 ring-primary bg-primary/5 animate-pulse-soft' : ''}`}>
      <legend className="text-sm font-semibold text-slate-700 mb-2 px-1">AI model</legend>
      {hint && <p role="status" className="text-sm font-medium text-primary mb-3">{hint}</p>}
      <div className="space-y-3" role="radiogroup" aria-label="AI model">
        {tiers.map(({ tier, items }) => (
          <div key={tier}>
            <div className="text-[11px] font-bold tracking-wide text-slate-500 mb-1.5">{tier.toUpperCase()} MODELS</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {items.map((m) => {
                const selected = m.id === value
                return (
                  <button
                    key={m.id}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onChange(m.id)}
                    className={`text-left rounded-xl border px-3 py-2.5 transition ${selected ? 'border-primary ring-2 ring-primary/20 bg-white' : m.allowed ? 'border-border bg-white hover:border-slate-400' : 'border-border bg-slate-50 text-slate-500 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm">{m.displayName}</span>
                    </div>
                    <div className="text-xs text-slate-500">{m.vendor} · {m.creditsPerSlide} credits/slide</div>
                    {m.description && <div className="text-xs text-slate-500 mt-0.5">{m.description}</div>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  )
}
