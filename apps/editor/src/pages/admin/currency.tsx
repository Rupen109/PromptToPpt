import { useEffect, type ReactNode } from 'react'
import { create } from 'zustand'
import { api } from '@/lib/api'

export type DisplayCurrency = 'INR' | 'USD'
const KEY = 'prompttoppt:admin-currency'

/** Provider costs are recorded in USD. The owner views them in INR by default (rate from the server, `INR_PER_USD`), switchable to USD. */
interface Display { currency: DisplayCurrency; rate: number; setCurrency: (c: DisplayCurrency) => void; setRate: (r: number) => void }
const stored = (): DisplayCurrency => { try { return localStorage.getItem(KEY) === 'USD' ? 'USD' : 'INR' } catch { return 'INR' } }
export const useDisplay = create<Display>((set) => ({
  currency: stored(), rate: 84,
  setCurrency: (currency) => { try { localStorage.setItem(KEY, currency) } catch { /* private mode */ } set({ currency }) },
  setRate: (rate) => set({ rate }),
}))

const inr = (n: number) => (n === 0 ? '₹0' : n < 0.01 ? `₹${n.toFixed(4)}` : n < 100 ? `₹${n.toFixed(n < 1 ? 3 : 2)}` : `₹${Math.round(n).toLocaleString('en-IN')}`)
const usdFmt = (n: number) => (n === 0 ? '$0' : n < 0.01 ? `$${n.toFixed(5)}` : n < 100 ? `$${n.toFixed(n < 1 ? 4 : 2)}` : `$${Math.round(n).toLocaleString('en-US')}`)

/** Format an amount that is stored in USD, in the currency currently selected for display. */
export const cost = (usd: number) => { const { currency, rate } = useDisplay.getState(); return currency === 'INR' ? inr(usd * rate) : usdFmt(usd) }
export const currencyNote = () => { const { currency, rate } = useDisplay.getState(); return currency === 'INR' ? `Shown in ₹ at ₹${rate} per US$ (provider costs are billed in US$).` : 'Shown in US$.' }

/** Remounts its children when the display currency / rate changes, so every formatted amount is recomputed. */
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { currency, rate, setRate } = useDisplay()
  useEffect(() => { api.admin.get<{ inrPerUsd: number }>('/config').then((c) => setRate(c.inrPerUsd)).catch(() => {}) }, [setRate])
  return <div key={`${currency}-${rate}`}>{children}</div>
}

export function CurrencyToggle() {
  const { currency, setCurrency: set } = useDisplay()
  return (
    <div role="group" aria-label="Display currency" className="inline-flex rounded-lg border border-border overflow-hidden bg-white text-sm">
      {(['INR', 'USD'] as const).map((c) => <button key={c} aria-pressed={currency === c} onClick={() => set(c)} className={`px-3 py-1.5 ${currency === c ? 'bg-foreground text-white' : 'hover:bg-slate-50'}`}>{c === 'INR' ? '₹ INR' : '$ USD'}</button>)}
    </div>
  )
}
