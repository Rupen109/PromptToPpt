import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Copy, Film, Link2, Lock, Play, Plus, Trash2, X } from '@prompttoppt/ui/icons'
import { MORPH_SCENES, type MorphScene, type Presentation, type Slide } from '@prompttoppt/validation'
import { addMorphScene, matchToPrevious, morphReport, nameOf } from '@/editor/morph-check'
import * as C from '@/editor/commands'
import * as TC from '@/editor/transition-commands'
import { useDoc } from '@/editor/store'
import { useUi } from '@/editor/ui'
import { useEntitlements } from '@/lib/entitlements'
import { MORPH_LOCKED_REASON } from './labels'
import { morphPreviewHandle } from './morphHandle'

const btn = 'h-8 px-3 rounded-md border border-border bg-white text-sm hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap'
const SCENE_LABEL: Record<MorphScene, string> = { cover: 'Cover', 'hero-left': 'Picture left', 'cards-row': 'Cards in a row', 'cards-column': 'Cards beside the picture', 'cards-grid': 'Cards in a grid', spotlight: 'Spotlight', timeline: 'Timeline', 'big-stat': 'Big number', compare: 'Compare', 'focus-hero': 'Focus picture', quote: 'Quote', closing: 'Closing' }

/**
 * The Morph panel (right drawer). For the selected slide and the one before it: which objects will move (same id and kind), which will come in or go out, what looks wrong and
 * one-click fixes (match an object to its partner so it moves instead of fading), a duplicate-for-Morph button, new slides from the Morph layouts, the scrubber, and the month's
 * allowance of AI Morph decks. Starter and Pro see it locked with the upgrade prompt; the server refuses a Morph save from them either way.
 */
export function MorphPanel({ doc, slide, onClose }: { doc: Presentation; slide: Slide; onClose: () => void }) {
  const apply = useDoc((s) => s.apply)
  const tp = useUi((s) => s.transitionPreview)
  const { ent, upgrade } = useEntitlements()
  const canMorph = !!ent?.features.morph
  const sid = slide.id
  const i = doc.slides.findIndex((s) => s.id === sid)
  const prev = doc.slides[i - 1]
  const isMorph = slide.transition?.type === 'morph'
  const locked = !!slide.locked
  const report = useMemo(() => morphReport(prev, slide), [prev, slide])
  const [scene, setScene] = useState<MorphScene>('cards-row')
  const [scrub, setScrub] = useState(50)
  const prevExiting = report.exiting
  const used = ent?.usage.morphDecksThisPeriod ?? 0
  const cap = ent?.features.morphDecksPerMonth ?? 0
  const gate = () => { upgrade.show(MORPH_LOCKED_REASON) }
  const nameFor = (id: string) => { const e = slide.elements.find((x) => x.id === id); return e ? nameOf(e) : id }
  const partnerName = (id: string) => { const e = prev?.elements.find((x) => x.id === id); return e ? nameOf(e) : id }
  const link = (elementId: string, partnerId: string) => apply('Match to previous slide', (d) => { matchToPrevious(d, sid, elementId, partnerId) })

  return (
    <aside aria-label="Morph panel" data-testid="morph-panel" className="w-[340px] max-lg:fixed max-lg:z-40 max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-auto max-lg:h-[48vh] max-lg:w-auto max-lg:shadow-2xl max-lg:rounded-t-2xl max-lg:border-t max-lg:max-w-full shrink-0 bg-white border-l border-border flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="font-semibold flex items-center gap-2"><Film aria-hidden size={17} />Morph check</h2>
        <button type="button" onClick={onClose} aria-label="Close Morph panel" className="text-slate-500 hover:text-slate-800"><X aria-hidden size={20} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
        {!canMorph && (
          <div data-testid="morph-locked" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <p className="flex items-center gap-1.5 font-semibold"><Lock aria-hidden size={14} />Morph is a Gold feature</p>
            <p className="mt-1">{isMorph || doc.slides.some((s) => s.transition?.type === 'morph') ? 'This deck already uses Morph. It plays as made, and you can remove it, but you cannot add or change it on your plan.' : 'Matching objects move and change from one slide to the next. Available on Gold and Premium.'}</p>
            <button type="button" data-testid="morph-upgrade" className={`${btn} mt-2`} onClick={gate}>See plans</button>
          </div>
        )}
        {canMorph && <p data-testid="morph-allowance" className="text-slate-600">AI-built Morph decks this month: <strong>{used} of {cap}</strong> used.</p>}

        <section aria-label="This slide" className="space-y-2">
          <h3 className="font-semibold">This slide</h3>
          <p data-testid="morph-state">{isMorph ? 'Morph is on: this slide arrives by moving the matching objects of the slide before it.' : 'Morph is off for this slide.'}</p>
          <div className="flex flex-wrap gap-2">
            {!isMorph && <button type="button" data-testid="morph-set" className={btn} disabled={locked || (canMorph && i === 0)} onClick={() => { if (!canMorph) return gate(); apply('Use Morph', (d) => { TC.setTransition(d, sid, { type: 'morph' }) }); useUi.getState().startTransitionPreview() }}>{canMorph ? <Film aria-hidden size={14} /> : <Lock aria-hidden size={14} />}Use Morph on this slide</button>}
            {isMorph && <button type="button" data-testid="morph-remove-slide" className={btn} disabled={locked} onClick={() => apply('Remove Morph', (d) => { TC.removeMorph(d, sid) })}><Trash2 aria-hidden size={14} />Remove Morph here</button>}
            <button type="button" data-testid="morph-all" className={btn} disabled={locked} onClick={() => { if (!canMorph) return gate(); apply('Apply Morph to all slides', (d) => { TC.setTransitionAll(d, { type: 'morph' }) }) }}>{canMorph ? null : <Lock aria-hidden size={14} />}Morph on all slides</button>
          </div>
        </section>

        {isMorph && prev && (
          <section aria-label="Preview" className="space-y-2">
            <h3 className="font-semibold">Preview</h3>
            <div className="flex gap-2">
              <button type="button" data-testid="morph-replay" className={btn} onClick={() => useUi.getState().startTransitionPreview()}><Play aria-hidden size={13} />Replay</button>
              {tp && <button type="button" className={btn} data-testid="morph-stop" onClick={() => useUi.getState().stopTransitionPreview()}>Stop</button>}
            </div>
            <label className="block text-xs text-slate-600">Scrub through the transition
              <input type="range" data-testid="morph-scrub" min={0} max={100} value={scrub} className="w-full" aria-valuetext={`${scrub} percent`}
                onChange={(e) => { const v = Number(e.target.value); setScrub(v); if (!useUi.getState().transitionPreview?.hold) { useUi.getState().startTransitionPreview(true); setTimeout(() => morphPreviewHandle.current?.seek?.(v / 100), 60) } else morphPreviewHandle.current?.seek?.(v / 100) }} />
            </label>
          </section>
        )}

        {isMorph && !prev && <p className="text-amber-800 bg-amber-50 rounded-lg p-3" data-testid="morph-no-prev">This is the first slide: there is no slide before it to morph from.</p>}

        {isMorph && prev && (
          <section aria-label="What will happen" className="space-y-3" data-testid="morph-report">
            <h3 className="font-semibold">What will happen</h3>
            <p data-testid="morph-counts"><strong>{report.moving.length}</strong> move, <strong>{report.entering.length}</strong> fade in, <strong>{report.exiting.length}</strong> fade out.</p>
            {report.suggestions.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Probably the same object</h4>
                <ul className="space-y-1.5">
                  {report.suggestions.map((s) => (
                    <li key={s.elementId} data-testid="morph-suggestion" className="flex items-center gap-2 rounded-lg border border-border p-2">
                      <span className="flex-1 min-w-0"><span className="block truncate font-medium">{nameFor(s.elementId)}</span><span className="block text-xs text-slate-500 truncate">same as "{partnerName(s.partnerId)}" before ({s.reason})</span></span>
                      <button type="button" data-testid="morph-match" className={btn} disabled={locked || !canMorph} onClick={() => link(s.elementId, s.partnerId)}><Link2 aria-hidden size={13} />Match</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.entering.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Fade in (new on this slide)</h4>
                <ul className="space-y-1.5">
                  {report.entering.filter((e) => !e.decorative).map((e) => {
                    const options = prevExiting.filter((x) => x.type === e.type)
                    return (
                      <li key={e.id} data-testid="morph-entering" className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 truncate">{nameOf(e)}</span>
                        <select aria-label={`Make "${nameOf(e)}" the same object as`} data-testid="morph-match-select" disabled={locked || !canMorph || options.length === 0} value="" onChange={(ev) => { if (ev.target.value) link(e.id, ev.target.value) }} className="h-8 max-w-[150px] rounded-md border border-border bg-white text-xs px-1 disabled:opacity-40">
                          <option value="">{options.length ? 'Match to…' : 'No partner'}</option>
                          {options.map((x) => <option key={x.id} value={x.id}>{nameOf(x)}</option>)}
                        </select>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {report.exiting.filter((e) => !e.decorative).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Fade out (only on the slide before)</h4>
                <ul className="space-y-1" data-testid="morph-exiting">{report.exiting.filter((e) => !e.decorative).map((e) => <li key={e.id} className="truncate">{nameOf(e)}</li>)}</ul>
              </div>
            )}
            {report.warnings.filter((w) => w.kind !== 'not-morph' && w.kind !== 'no-previous').length > 0 ? (
              <ul className="space-y-1.5" aria-label="Warnings" data-testid="morph-warnings">
                {report.warnings.filter((w) => w.kind !== 'not-morph' && w.kind !== 'no-previous').map((w, k) => (
                  <li key={k} data-kind={w.kind} className="flex gap-2 rounded-lg bg-amber-50 text-amber-900 p-2 text-[13px]"><AlertTriangle aria-hidden size={14} className="mt-0.5 shrink-0" /><span>{w.message}</span></li>
                ))}
              </ul>
            ) : <p className="flex items-center gap-1.5 text-emerald-700" data-testid="morph-ok"><Check aria-hidden size={14} />Nothing to fix.</p>}
          </section>
        )}

        <section aria-label="Build" className="space-y-2">
          <h3 className="font-semibold">Build with Morph</h3>
          <button type="button" data-testid="morph-duplicate" className={btn} disabled={locked} onClick={() => { if (!canMorph) return gate(); let id: string | null = null; apply('Duplicate slide for Morph', (d) => { id = C.duplicateSlide(d, sid, C.newId); if (id) TC.setTransition(d, id, { type: 'morph' }) }); if (id) useUi.getState().setActiveSlide(id) }}><Copy aria-hidden size={14} />Duplicate slide for Morph</button>
          <p className="text-xs text-slate-500">Keeps every object's id. Change the copy (move, resize, recolour) and Morph carries the objects over.</p>
          <div className="flex gap-2 items-end">
            <label className="flex-1 text-xs text-slate-600">New slide from a Morph layout
              <select data-testid="morph-scene" value={scene} onChange={(e) => setScene(e.target.value as MorphScene)} className="mt-1 w-full h-8 rounded-md border border-border bg-white px-2 text-sm">
                {MORPH_SCENES.map((s) => <option key={s} value={s}>{SCENE_LABEL[s]}</option>)}
              </select>
            </label>
            <button type="button" data-testid="morph-add-scene" className={btn} onClick={() => { if (!canMorph) return gate(); let id: string | null = null; apply('Add Morph slide', (d) => { id = addMorphScene(d, sid, scene, C.newId) }); if (id) useUi.getState().setActiveSlide(id) }}><Plus aria-hidden size={14} />Add</button>
          </div>
        </section>
      </div>
    </aside>
  )
}
