// Chalkboard: hand-drawn chalk doodles on black (brightness becomes transparency, so they look drawn on the slate board).
export default ({ BLACK }) => {
  const STYLE = `drawn by hand with a stick of chalk in one consistent medium-thick (about 6 pixel) wobbly line, simple friendly children's-classroom doodle style, slightly rough chalk texture with soft chalk dust specks around the lines, line drawing only (no filled areas except tiny hatching), single subject centred in the frame with a clear margin so nothing is cropped. The background is perfectly flat, pure solid black (#000000) everywhere: no texture, no grain, no gradient, no vignette, no paper or slate surface, no smudges in the background; only the chalk lines and their own faint dust are lighter than black. ${BLACK}. No text, no letters, no numbers, no logo, no watermark, no frame.`
  const d = (name, color, what) => ({ name: `chalk-${name}`, key: 'black', ratio: '1:1', size: [900, 900], mode: 'trim', fill: 0.9, check: true, p: `A chalk doodle of ${what}, ${color}, ${STYLE}` })
  return [
    d('apple', 'in soft chalk pink and red-pink with a chalk green leaf', 'a round apple with a stem and one leaf and a small shine mark'),
    d('book', 'in chalk white with a few chalk blue accents', 'an open book seen from a slight angle, with page lines'),
    d('globe', 'in chalk blue with chalk green continents outlines', 'a globe on a small stand with latitude and longitude lines'),
    d('bulb', 'in chalk yellow with a few little chalk white rays', 'a light bulb with a screw base and short rays around it'),
    d('rocket', 'in chalk white with chalk pink fins and a chalk yellow flame', 'a small rocket flying diagonally upward with a round window and a flame'),
    d('flask', 'in chalk white with chalk green liquid hatching and a few bubbles', 'a conical science flask (Erlenmeyer) with liquid inside and rising bubbles'),
    d('sun', 'in chalk yellow', 'a friendly sun: a circle with eight short straight rays around it'),
    d('cloud', 'in chalk white with chalk blue', 'a fluffy cloud with three short slanted rain lines under it'),
    d('drop', 'in chalk blue', 'a single large water drop with a small curved highlight line inside'),
    d('star', 'in chalk yellow', 'a single five-pointed star with a few little sparkle ticks next to it'),
    { name: 'chalk-dust', key: 'black', ratio: '16:9', size: [1920, 1080], mode: 'frame', p: `Soft wide smears of white chalk dust left by a wiped blackboard: large faint circular eraser swipes and fine powdery specks, very dim overall (never brighter than 35% grey), uneven, strongest near the edges and thinner toward the middle, on ${BLACK}. No text, no objects, no lines of writing.` },
  ]
}
