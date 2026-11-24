// Case Study: dark editorial still life and texture, warm orange and teal light on near-black charcoal. No people.
export default () => {
  const style = 'Premium editorial still-life photography, near-black charcoal palette with warm burnt-orange and teal light accents, matte surfaces, fine film grain, moody and restrained, no text, no logo, no watermark, no people.'
  return [
    { name: 'case-hero', key: null, ratio: '1:1', size: [1600, 1600], mode: 'cover', p: `A single sculptural folded sheet of matte paper in warm burnt orange standing like an abstract monument in the centre of the frame, lit by one raking side light with a soft teal rim glow, on a seamless near-black charcoal surface, deep soft shadows, generous dark space around it. ${style}` },
    { name: 'case-band', key: null, ratio: '21:9', size: [2100, 900], mode: 'cover', p: `A wide abstract texture: layered ripples of dark teal and charcoal silk fabric with one thin warm orange line of light running horizontally across the middle, very dark overall, nothing else in the frame. ${style}` },
    { name: 'case-column', key: null, ratio: '9:16', size: [1080, 1920], mode: 'cover', p: `A tall abstract texture: dark charcoal fluted glass panels in vertical rows with warm orange light glowing between the flutes and faint teal reflections, very dark overall, nothing else in the frame. ${style}` },
    { name: 'case-before', key: null, ratio: '1:1', size: [1200, 1200], mode: 'cover', p: `Overhead still life of a chaotic tangled knot of thin copper and grey cables filling the frame, harsh single warm light, shallow depth of field, on a dark charcoal surface. ${style}` },
    { name: 'case-after', key: null, ratio: '1:1', size: [1200, 1200], mode: 'cover', p: `Overhead still life of slim brass and teal-lacquered rods laid in perfectly parallel, evenly spaced rows filling the frame, calm soft warm light, orderly and precise, on a dark charcoal surface. ${style}` },
  ]
}
