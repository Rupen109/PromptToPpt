// A stand-in for cutout-child.ts in tests: same messages, no model. A picture 1 pixel wide "hangs" (the model never answers); width 2 fails; anything else answers a full mask after a moment.
process.on('message', (m: { id: number; width: number; height: number }) => {
  if (m.width === 1) return
  setTimeout(() => {
    if (m.width === 2) process.send?.({ id: m.id, error: 'model exploded' })
    else process.send?.({ id: m.id, mask: new Uint8Array(m.width * m.height).fill(255) })
  }, 30)
})
process.on('disconnect', () => process.exit(0))
process.send?.({ ready: true })
export {}
