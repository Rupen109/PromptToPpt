import { useLayoutEffect, useState } from 'react'
import { visualBox } from '@prompttoppt/validation'

type Seen = { x: number; y: number; width: number; height: number; rotation?: number | undefined }
const GAP = 8
/** room the rotate handle takes under a selected object (its stalk and knob), in screen pixels */
const HANDLE_ROOM = 52
/** the least height a bar may be squeezed to (its first row and a little of its panel) before it rather covers part of the object */
const MIN_SCROLLING = 150

type Rect = { left: number; top: number; width: number; height: number }
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top))

/**
 * Where a bar of size (w, h) goes for an object at `obj` (stage pixels). It never covers the object when there is any clear place: above it; below it (past the bottom of the
 * slide too, into the grey page, as long as it stays on screen); to its right; to its left. When no place is clear, the one that covers the least of the object.
 * `floor`: how far down the bar may go (stage pixels; the bottom of the visible page). Pure, so it is tested without a browser.
 */
export function placeBar(obj: Rect, bar: { w: number; h: number }, stage: { w: number; floor: number }, belowRoom = HANDLE_ROOM): { top: number; left: number; maxHeight?: number } {
  const x = Math.min(Math.max(4, obj.left), Math.max(4, stage.w - bar.w - 4))
  const sideTop = Math.max(4, Math.min(obj.top, stage.floor - bar.h))
  const candidates = [
    { top: obj.top - GAP - bar.h, left: x },
    { top: obj.top + obj.height + GAP + belowRoom, left: x },
    { top: sideTop, left: obj.left + obj.width + GAP },
    { top: sideTop, left: obj.left - GAP - bar.w },
  ]
  const inside = (c: { top: number; left: number }) => c.top >= 4 && c.top + bar.h <= stage.floor && c.left >= 4 && c.left + bar.w <= stage.w - 4
  const clear = candidates.find((c) => inside(c) && !overlap({ ...c, width: bar.w, height: bar.h }, obj))
  if (clear) return clear
  // a tall bar (a panel open) with no clear place: below the object anyway, as tall as the room there, its panel scrolling inside (the object stays in view; it is what is being tuned)
  const belowTop = obj.top + obj.height + GAP + belowRoom
  if (stage.floor - belowTop >= MIN_SCROLLING) return { top: belowTop, left: x, maxHeight: stage.floor - belowTop }
  // nothing clear: above or below, kept on screen, whichever covers less of the object
  const fallbacks = [{ top: Math.max(4, obj.top - GAP - bar.h), left: x }, { top: Math.max(4, Math.min(obj.top + obj.height + GAP, stage.floor - bar.h)), left: x }]
  return fallbacks.sort((a, b) => overlap({ ...a, width: bar.w, height: bar.h }, obj) - overlap({ ...b, width: bar.w, height: bar.h }, obj))[0]!
}

/**
 * The place of a toolbar floating over the slide (the object toolbar, the typing bar): it measures itself (it wraps on a narrow screen, and the Arrange / Spacing / Picture
 * panels add rows) and its page, and takes the first clear place from `placeBar`, so a taller bar moves itself and never covers the object it works on.
 */
export function useToolbarPlace(el: Seen, scale: number, stageWidth: number, stageHeight: number, opts: { belowRoom?: number } = {}) {
  const [node, measure] = useState<HTMLDivElement | null>(null) // a callback ref: the bar is measured once it is on the page, and again whenever it changes size
  const [size, setSize] = useState({ w: 360, h: 44, floor: stageHeight })
  // the bar's NATURAL height (scrollHeight: a bar squeezed to the room below still counts as tall, or it would flip between squeezed and not), re-read whenever it
  // resizes or its content changes
  useLayoutEffect(() => {
    if (!node) return
    const read = () => {
      const stage = (node.offsetParent as HTMLElement | null)?.getBoundingClientRect()
      // how far down the bar may go: the page below the slide is free room too, down to the floating dock (Insert, Style, Edit with AI) or the bottom of the window
      const dock = document.querySelector('[data-floating-dock]')?.getBoundingClientRect().top ?? window.innerHeight
      const floor = stage ? Math.max(stageHeight, Math.min(dock, window.innerHeight) - stage.top - 8) : stageHeight
      setSize((s) => (s.w === node.offsetWidth && s.h === node.scrollHeight && s.floor === floor ? s : { w: node.offsetWidth, h: node.scrollHeight, floor }))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(node)
    // a panel opening inside a squeezed bar changes its content, not its size: re-measured too
    const mo = new MutationObserver(read)
    mo.observe(node, { childList: true, subtree: true })
    window.addEventListener('resize', read)
    return () => { ro.disconnect(); mo.disconnect(); window.removeEventListener('resize', read) }
  }, [node, stageHeight])
  const seen = visualBox(el, el.rotation) // what is SEEN: a turned object reaches past its stored box
  const obj = { left: seen.x * scale, top: seen.y * scale, width: seen.width * scale, height: seen.height * scale }
  const at = placeBar(obj, { w: size.w, h: size.h }, { w: stageWidth, floor: size.floor }, opts.belowRoom ?? HANDLE_ROOM)
  return { measure, top: at.top, left: at.left, maxHeight: at.maxHeight }
}
