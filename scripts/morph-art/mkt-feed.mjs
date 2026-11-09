// Social Feed: eight bright, airy, pastel lifestyle photographs for the posts (no people, no text, no brands). One shared grade.
export default () => {
  const STYLE = 'Bright airy lifestyle photography for a social media feed: soft diffused daylight, gentle pastel palette of lavender, peach, mint and butter-yellow, clean uncluttered styling, light high-key grade with lifted shadows, shallow depth of field, the main subject centred in the frame with generous space around it (it must survive a centre crop). No people, no faces, no text, no letters, no numbers, no logos, no brand names, no watermark.'
  const pic = (name, p) => ({ name: `feed-${name}`, key: null, ratio: '4:5', size: [960, 1200], mode: 'cover', p: `${STYLE} ${p}` })
  return [
    pic('coffee', 'A flat-lay from directly above: a white ceramic cup of latte with simple foam art, a closed pastel-lavender notebook with a pencil beside it, a small sprig of dried flowers, all on a soft peach linen surface.'),
    pic('plant', 'A small green potted plant in a white ceramic pot on a sunlit white windowsill, soft sheer curtain and a pale lavender wall behind, gentle window light.'),
    pic('sneaker', 'One single pastel mint-and-lilac sneaker with a white sole, photographed at a slight angle on a seamless soft peach studio backdrop, soft shadow beneath.'),
    pic('phone', 'A hand with neat short nails (only the hand and wrist, no face) holding a modern smartphone with a completely blank dark screen and no reflections of text, against a soft lavender wall with a pale warm light.'),
    pic('smoothie', 'A tall glass of a colourful pink-and-peach smoothie with a pastel paper straw, a few fresh berries and a slice of fruit beside it, on a butter-yellow table against a pale mint wall.'),
    pic('tote', 'A plain natural-cotton tote bag with no print resting on a pale wooden park bench, a pastel scarf draped beside it, soft blurred green foliage behind in morning light.'),
    pic('desk', 'A tidy bright desk seen from above and slightly in front: a small glass vase of pink and white tulips, a laptop with a blank closed lid, a pastel mug and a notebook, on a white desk with soft lavender shadows.'),
    pic('shades', 'A pair of round sunglasses with soft rose-tinted lenses resting on a smooth pastel peach and lavender two-tone backdrop, with a gentle soft shadow, minimal styling.'),
  ]
}
