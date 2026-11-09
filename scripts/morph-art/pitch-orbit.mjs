// Orbit Pitch: glowing glass orbs and a soft nebula, all on black (their own brightness is their transparency).
export default ({ BLACK }) => {
  const orb = (name, what) => ({ name: `orbit-${name}`, key: 'black', ratio: '1:1', size: [1000, 1000], mode: 'frame', p: `A single perfectly round glossy glass sphere centred in the frame, ${what}, soft inner glow, subtle caustic highlights and a fine bright rim light, photoreal 3D render, floating on ${BLACK}, with nothing else in the frame. No text, no logo.` })
  return [
    orb('core', 'iridescent: swirling cyan, violet and pink light inside, like a small star'),
    orb('cyan', 'luminous electric cyan and aqua'),
    orb('violet', 'deep violet and indigo with a hint of magenta'),
    orb('lime', 'bright lime-green and yellow'),
    orb('pink', 'hot pink and coral'),
    { name: 'orbit-nebula', key: 'black', ratio: '16:9', size: [1920, 1080], mode: 'frame', p: `A vast, soft, out-of-focus nebula of deep blue and violet light with a few tiny distant stars, very dim overall (never brighter than 30% grey), strongest toward the centre and fading smoothly to black at every edge, on ${BLACK}. No text.` },
  ]
}
