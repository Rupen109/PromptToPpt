// Story Cards: warm, tactile photographs for a founder-story deck (workbench, sketching hands, market stall, prototype, finished product, delivery bikes, team at a whiteboard).
// One grade for all: soft window light from the left, shallow depth of field, tangerine / sunflower / mint / sky accents on wood, paper and clay.
export default () => {
  const STYLE = 'Warm, tactile editorial photograph in one consistent look: soft natural window light from the left, shallow depth of field, a warm film colour grade, subtle film grain, natural wood, paper and clay textures with small accents of tangerine orange, sunflower yellow, mint green and sky blue. Portrait composition. No faces visible, no text, no letters, no numbers, no logos, no watermark anywhere.'
  const pic = (name, what) => ({ name: `cards-${name}`, key: null, ratio: '4:5', size: [1040, 1300], mode: 'cover', p: `${STYLE} ${what}` })
  return [
    pic('bench', "A founder's wooden workbench seen from above at a gentle angle, covered with small hand-made product prototypes: kraft cardboard boxes, a half-finished ceramic mug, pencils, tape, a green cutting mat and a warm desk lamp. Tidy but lived-in."),
    pic('sketch', 'Close-up of two hands sketching a product idea with a pencil on a sheet of paper on a wooden desk, rough drawings of a small box and a mug, a few coloured markers in tangerine, mint and sky blue beside the paper. Only hands and forearms are visible, no face.'),
    pic('stall', 'A packed local makers market stall in warm afternoon light: wooden shelves of hand-glazed ceramics, loaves of bread, candles and wooden toys under a striped awning; only a stallholder\'s hands arranging a bowl are visible, no face.'),
    pic('proto', 'A smartphone leaning against a small kraft-paper parcel tied with twine and a ceramic mug on a pale wooden table, the phone screen shows only an abstract grid of colourful rounded tiles with no readable text, soft window light, calm and minimal.'),
    pic('product', 'Macro close-up of a finished product: a hand-glazed mint green ceramic mug wrapped halfway in kraft paper with twine, on a wooden table, tiny imperfections of the glaze visible, creamy blurred background with a hint of tangerine.'),
    pic('bikes', 'A narrow warm-lit city street at golden hour with two couriers on cargo bikes carrying insulated tangerine orange delivery boxes, seen from behind and at a distance so no faces are visible, shop awnings and string lights in soft focus.'),
    pic('team', 'A small team at a large whiteboard covered with abstract sticky notes in tangerine, sunflower, mint, sky blue and blush pink, seen from behind as soft silhouettes against bright window light, no faces, no readable writing.'),
  ]
}
