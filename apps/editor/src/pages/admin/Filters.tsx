import { useFilters } from './useUsage'

const RANGES = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days']] as const
const sel = 'border border-border rounded-lg px-2.5 py-1.5 text-sm bg-white'

/** Spec §14 filters: range, provider, model, request type, environment, status (+ country/user via URL). */
export function Filters({ models = [], providers = [] }: { models?: string[]; providers?: string[] }) {
  const { range, set, params } = useFilters()
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6" role="search" aria-label="Usage filters">
      <div role="group" aria-label="Date range" className="inline-flex rounded-lg border border-border overflow-hidden">
        {RANGES.map(([k, label]) => (
          <button key={k} onClick={() => set({ range: k, from: undefined, to: undefined })} aria-pressed={range === k} className={`px-3 py-1.5 text-sm ${range === k ? 'bg-foreground text-white' : 'bg-white hover:bg-slate-50'}`}>{label}</button>
        ))}
      </div>
      <label className="sr-only" htmlFor="f-provider">Provider</label>
      <select id="f-provider" className={sel} value={params.get('provider') ?? ''} onChange={(e) => set({ provider: e.target.value || undefined })}>
        <option value="">All providers</option>{providers.map((p) => <option key={p}>{p}</option>)}
      </select>
      <label className="sr-only" htmlFor="f-model">Model</label>
      <select id="f-model" className={sel} value={params.get('model') ?? ''} onChange={(e) => set({ model: e.target.value || undefined })}>
        <option value="">All models</option>{models.map((m) => <option key={m}>{m}</option>)}
      </select>
      <label className="sr-only" htmlFor="f-type">Request type</label>
      <select id="f-type" className={sel} value={params.get('requestType') ?? ''} onChange={(e) => set({ requestType: e.target.value || undefined })}>
        <option value="">All request types</option>
        {['prompt_analysis', 'direction_suggestion', 'outline_generation', 'slide_content', 'ai_edit', 'ai_assist', 'image_generation'].map((t) => <option key={t}>{t}</option>)}
      </select>
      <label className="sr-only" htmlFor="f-env">Environment</label>
      <select id="f-env" className={sel} value={params.get('environment') ?? ''} onChange={(e) => set({ environment: e.target.value || undefined })}>
        <option value="">All environments</option>{['development', 'staging', 'production'].map((t) => <option key={t}>{t}</option>)}
      </select>
      <label className="sr-only" htmlFor="f-status">Status</label>
      <select id="f-status" className={sel} value={params.get('status') ?? ''} onChange={(e) => set({ status: e.target.value || undefined })}>
        <option value="">Success + failure</option><option value="success">Success</option><option value="error">Failure</option>
      </select>
      <label className="sr-only" htmlFor="f-country">Country</label>
      <input id="f-country" className={`${sel} w-24`} placeholder="Country" maxLength={2} defaultValue={params.get('country') ?? ''} onBlur={(e) => set({ country: e.target.value.toUpperCase() || undefined })} />
    </div>
  )
}
