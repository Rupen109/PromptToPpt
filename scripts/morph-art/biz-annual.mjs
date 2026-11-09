// Annual Report: muted warm architectural photography, deep green shadows, brass highlights. All finished pictures (cover mode), no text.
export default () => {
  const grade = 'Consistent muted, warm editorial grade: deep forest-green shadows, soft ivory highlights, touches of brass, slightly desaturated, fine film grain, calm and institutional, like a printed annual report. Photorealistic architectural photography. No people close-up, no text, no signage, no logo, no watermark.'
  const tall = (name, p) => ({ name: `annual-${name}`, key: null, ratio: '3:4', size: [1200, 1600], mode: 'cover', p: `${p} Vertical composition. ${grade}` })
  return [
    tall('glass', 'Looking steeply upward along the facade of a modern glass and pale concrete office tower, strong vertical lines, a few warm reflections of a late afternoon sky in the glass.'),
    tall('atrium', 'The interior of a vast modern atrium: white concrete walkways and balconies stacked high, a skylight pouring soft warm daylight, indoor trees, a lone small figure far away, seen from the ground floor.'),
    tall('tower', 'A contemporary office tower with terraced green roofs and planted balconies photographed at golden hour, warm low sunlight on pale concrete, deep teal-green sky, calm and elegant.'),
    tall('blueprint', 'Top-down view of two pairs of hands resting on an architectural blueprint on a wooden table, a brass compass and a pencil, warm lamplight, shallow depth of field, no faces.'),
    tall('canopy', 'Looking straight up into a dense forest canopy of tall trees, soft sun rays filtering through deep green leaves, misty and serene.'),
    tall('workspace', 'A calm, empty modern workspace: a pale oak desk by a tall window, a closed laptop with a plain blank matte grey lid (no logo or emblem), a ceramic cup and a small plant, soft morning light, minimal and quiet, deep green wall.'),
    { name: 'annual-skyline', key: null, ratio: '16:9', size: [1920, 1080], mode: 'cover', p: `A wide panorama of a modern business district of glass and concrete towers with green rooftops at dusk, reflected in a still waterway in the foreground, warm brass sky glow fading to deep forest green. ${grade}` },
    { name: 'annual-forest', key: null, ratio: '16:9', size: [1920, 1080], mode: 'cover', p: `A wide, quiet view of a misty temperate forest at dawn, tall dark-green trees with soft golden light breaking through the canopy, deep atmospheric depth, calm and serene. ${grade}` },
  ]
}
