// Feature Spotlight: a light, friendly app-release look. Three soft wallpapers for the phone screens, a pastel mesh field, and two floating 3D app-icon style objects.
export default ({ GREEN }) => {
  const NO = 'No text, no letters, no logo, no watermark, no people.'
  const wall = (name, what) => ({ name: `spot-${name}`, key: null, ratio: '9:16', size: [720, 1560], mode: 'cover', p: `A smooth abstract phone wallpaper: ${what}. Soft studio lighting, clean and airy, light enough overall that white interface cards sit on it clearly, no sharp detail in the centre, premium and modern. ${NO}` })
  const icon = (name, what) => ({ name: `spot-${name}`, key: 'green', ratio: '1:1', size: [700, 700], mode: 'trim', fill: 0.9, check: true, p: `A single floating 3D rendered object, ${what}, soft glossy plastic material with gentle rounded edges, clean soft studio lighting, a subtle highlight on the top-left, friendly modern app-launch style, seen from a slight three-quarter angle. The whole object is inside the frame with a clear margin, nothing cropped, no shadow on the ground. ${NO} On ${GREEN}.` })
  return [
    { name: 'spot-mesh', key: null, ratio: '16:9', size: [1920, 1080], mode: 'cover', p: `A soft pastel mesh-gradient field filling the whole frame: very light, airy blurred blobs of lavender, peach, mint and sky blue melting into each other over a near-white base, silky smooth, brighter and whiter toward the left, no objects, no grain, no hard shapes. ${NO}` },
    wall('wall1', 'flowing glossy ribbons of indigo, violet and soft pink swirling gently over a pale lavender base'),
    wall('wall2', 'flowing glossy ribbons of tangerine orange, coral and warm peach swirling gently over a pale cream base'),
    wall('wall3', 'flowing glossy ribbons of emerald green, mint and teal swirling gently over a pale aqua base'),
    icon('app', 'a chunky rounded-square app icon in vivid indigo blue with a smooth white rounded checkmark embossed in the middle'),
    icon('bolt', 'a chunky rounded lightning bolt in vivid tangerine orange with a slightly lighter yellow-orange top face'),
  ]
}
