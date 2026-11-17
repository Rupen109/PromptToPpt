'use client'

/** Shown right after the words of a bullet were deleted: the symbol in front of them can go too (one undo step), or stay. */
export function BulletAsk({ onRemove, onKeep }: { onRemove: () => void; onKeep: () => void }) {
  return (
    <div role="status" data-testid="bullet-ask" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t-2 border-foreground bg-[#ecfeff] px-3 py-1.5 text-xs font-bold text-foreground">
      <span>The words are gone. Remove the bullet in front of them too?</span>
      <button type="button" data-testid="bullet-remove" onClick={onRemove} className="rounded-md border-2 border-foreground bg-primary px-2.5 py-0.5 text-[11px] font-extrabold uppercase text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground">Remove the bullet too</button>
      <button type="button" data-testid="bullet-keep" onClick={onKeep} className="rounded-md border-2 border-foreground bg-white px-2.5 py-0.5 text-[11px] font-extrabold uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">Keep it</button>
    </div>
  )
}
