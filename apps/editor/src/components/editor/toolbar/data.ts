export interface GradientPreset { id: string; name: string; from: string; to: string; angle: number }

/** Built-in gradients: free, instant, no photo search. Used as slide backgrounds, or turned into a picture when inserted as media. */
export const GRADIENTS: GradientPreset[] = [
  { id: 'sunset', name: 'Sunset', from: '#FF512F', to: '#F09819', angle: 135 },
  { id: 'ocean', name: 'Ocean', from: '#2193B0', to: '#6DD5ED', angle: 135 },
  { id: 'purple-haze', name: 'Purple haze', from: '#5F2C82', to: '#49A09D', angle: 135 },
  { id: 'midnight', name: 'Midnight', from: '#0F2027', to: '#2C5364', angle: 160 },
  { id: 'aurora', name: 'Aurora', from: '#00C9FF', to: '#92FE9D', angle: 120 },
  { id: 'berry', name: 'Berry', from: '#8E2DE2', to: '#F5576C', angle: 135 },
  { id: 'forest', name: 'Forest', from: '#134E5E', to: '#71B280', angle: 135 },
  { id: 'peach', name: 'Peach', from: '#FFECD2', to: '#FCB69F', angle: 135 },
  { id: 'sky', name: 'Sky', from: '#E0EAFC', to: '#CFDEF3', angle: 135 },
  { id: 'rose', name: 'Rose', from: '#EE9CA7', to: '#FFDDE1', angle: 135 },
  { id: 'indigo', name: 'Indigo', from: '#1E3C72', to: '#2A5298', angle: 135 },
  { id: 'graphite', name: 'Graphite', from: '#232526', to: '#414345', angle: 135 },
  { id: 'lime', name: 'Lime', from: '#A8E063', to: '#56AB2F', angle: 135 },
  { id: 'flame', name: 'Flame', from: '#F12711', to: '#F5AF19', angle: 135 },
  { id: 'lavender', name: 'Lavender', from: '#E6DADA', to: '#274046', angle: 135 },
  { id: 'mint', name: 'Mint', from: '#D4FC79', to: '#96E6A1', angle: 135 },
  { id: 'steel', name: 'Steel', from: '#B993D6', to: '#8CA6DB', angle: 135 },
  { id: 'cherry', name: 'Cherry', from: '#EB3349', to: '#F45C43', angle: 135 },
  { id: 'teal-night', name: 'Teal night', from: '#093028', to: '#237A57', angle: 135 },
  { id: 'cotton', name: 'Cotton candy', from: '#A1C4FD', to: '#C2E9FB', angle: 135 },
]

export const STANDARD_COLORS = ['#000000', '#FFFFFF', '#E53935', '#FB8C00', '#FDD835', '#43A047', '#00ACC1', '#1E88E5', '#5E35B1', '#D81B60', '#6D4C41', '#757575']

/** Quick categories of the Media library (each one is a photo search, except "Gradient", which shows the built-in gradients). */
export const MEDIA_CATEGORIES = [
  { id: 'gradient', label: 'Gradient', query: '' },
  { id: 'abstract', label: 'Abstract', query: 'abstract background' },
  { id: 'data', label: 'Data', query: 'data analytics' },
  { id: 'tech', label: 'Tech', query: 'technology' },
  { id: '3d', label: '3D Shapes', query: '3d shapes render' },
  { id: 'business', label: 'Business', query: 'business office' },
  { id: 'nature', label: 'Nature', query: 'nature landscape' },
  { id: 'texture', label: 'Texture', query: 'texture pattern' },
  { id: 'people', label: 'People', query: 'people team' },
  { id: 'city', label: 'City', query: 'city skyline' },
] as const

export const cssGradient = (g: { from: string; to: string; angle: number }) => `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`

/** Draws a gradient to a PNG file (so a gradient can be placed on a slide like any other picture). */
export async function gradientToFile(g: GradientPreset, width = 1600, height = 900): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')!
  const a = ((g.angle - 90) * Math.PI) / 180
  const cx = width / 2, cy = height / 2
  const r = Math.abs((width / 2) * Math.cos(a)) + Math.abs((height / 2) * Math.sin(a))
  const grad = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  grad.addColorStop(0, g.from); grad.addColorStop(1, g.to)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('no image'))), 'image/png'))
  return new File([blob], `${g.name} gradient.png`, { type: 'image/png' })
}
