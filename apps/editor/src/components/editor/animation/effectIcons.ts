import { Activity, ArrowUpRight, Bell, Blend, Circle, CircleDot, Columns2, Droplet, Eye, EyeOff, Ghost, Maximize2, Minimize2, Move, MoveRight, Orbit, Palette, PenLine, Rocket, RotateCw, Route, Scissors, Sparkles, Spline, Sun, Vibrate, Waves, Wind, Zap, ZoomIn, ZoomOut, type LucideIcon } from '@prompttoppt/ui/icons'
import type { Effect } from '@prompttoppt/validation'

/** One recognisable icon per effect (the gallery shows these; the name is the tooltip and the accessible label). */
export const EFFECT_ICON: Record<Effect['type'], LucideIcon> = {
  appear: Eye, 'fade-in': Blend, 'fly-in': MoveRight, 'zoom-in': ZoomIn, 'float-in': Wind, 'wipe-in': Waves, 'split-in': Columns2, 'rise-up': ArrowUpRight, 'bounce-in': Rocket, 'pop-in': Sparkles, 'spin-in': RotateCw, 'grow-turn': Orbit,
  pulse: Activity, 'grow-shrink': Maximize2, spin: RotateCw, shake: Vibrate, bounce: Rocket, 'color-change': Palette, transparency: Droplet, teeter: Bell, blink: Sun,
  disappear: EyeOff, 'fade-out': Ghost, 'fly-out': MoveRight, 'zoom-out': ZoomOut, 'float-out': Wind, 'wipe-out': Waves, shrink: Minimize2, 'spin-out': Zap,
  'path-line': Move, 'path-arc': Spline, 'path-turn': Route, 'path-circle': Circle, 'path-custom': PenLine,
}
export { CircleDot, Scissors }
