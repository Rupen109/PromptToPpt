// Neural Network: a very dim data field on black, two glowing 3D node spheres and a soft neural light burst, all keyed on black (their own brightness is their transparency).
export default ({ BLACK }) => {
  const orb = (name, what) => ({ name: `neural-${name}`, key: 'black', ratio: '1:1', size: [1000, 1000], mode: 'frame', p: `A single perfectly round glowing 3D sphere centred in the frame, filling about two thirds of the frame, ${what}, a luminous translucent core with fine internal filaments of light like a neuron, crisp bright rim light, soft glow falling off smoothly to black, precise scientific render, floating on ${BLACK}, with nothing else in the frame and a wide empty margin around it. No text, no logo.` })
  return [
    { name: 'neural-field', key: 'black', ratio: '16:9', size: [1920, 1080], mode: 'frame', p: `A very dim, calm field of deep-tech data on ${BLACK}: a faint soft haze of deep navy, teal and ultraviolet light, thousands of tiny distant points of light like a star chart, and a barely visible fine hairline grid, never brighter than 25% grey anywhere, strongest toward the centre and fading smoothly to pure black at every edge, no bright objects, no shapes, minimal and precise. No text.` },
    orb('teal', 'electric teal and aqua (#19E3C6) with a white-hot centre'),
    orb('violet', 'deep ultraviolet and indigo (#7C5CFF) with a bright lilac centre'),
    { name: 'neural-burst', key: 'black', ratio: '1:1', size: [1200, 1200], mode: 'frame', p: `A soft neural light burst centred in the frame: a luminous teal and ultraviolet glow with many extremely fine thin radiating filaments of light branching outward like dendrites and fading smoothly to black well before the edges, delicate, precise and calm, on ${BLACK}, with nothing else in the frame. No text, no logo.` },
  ]
}
