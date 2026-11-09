// Circuit: an engineering terminal. A chip cut-out, a dim macro of a circuit board, and a faint scanline glow on black.
export default ({ MAGENTA, BLACK }) => [
  { name: 'circuit-chip', key: 'magenta', ratio: '1:1', size: [1100, 1100], mode: 'trim', fill: 0.9, check: true,
    p: `A single isometric microchip on a small slice of green printed circuit board, seen from above at a 35 degree isometric angle: a clean dark matte square chip package with a subtle etched die square on top, rows of fine gold pins along all four sides, thin phosphor-green glowing circuit traces running out from it across the board slice, a soft green glow around it, crisp photoreal 3D render, the whole subject inside the frame with a clear margin, nothing cropped, on ${MAGENTA}. No text, no logo, no markings, no watermark.` },
  { name: 'circuit-board', key: null, ratio: '16:9', size: [1920, 1080], mode: 'cover',
    p: 'A macro photograph of a printed circuit board lit only by green light: tiny surface-mount components, fine traces and gold vias in shallow depth of field, deep near-black green shadows, monochrome phosphor-green palette, dark and moody overall, evenly dim so text can sit over it. No text, no logo, no brand markings, no watermark.' },
  { name: 'circuit-scan', key: 'black', ratio: '16:9', size: [1920, 1080], mode: 'frame',
    p: `Faint horizontal CRT scanlines and a soft green phosphor glow strongest in the middle and fading to black at every edge, very dim overall (never brighter than 25% grey), subtle, on ${BLACK}. No text, no shapes, no logo.` },
]
