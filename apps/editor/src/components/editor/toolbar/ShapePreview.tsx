import { shapeDef } from '@prompttoppt/validation'

/** Small drawing of a shape for the Shapes menu (the six basic shapes are drawn here, the rest from the shared outline list). */
export function ShapePreview({ id, size = 26 }: { id: string; size?: number }) {
  const def = shapeDef(id)
  const common = { fill: 'currentColor', stroke: 'none' } as const
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="text-slate-600">
      {def ? <path d={def.path} fillRule="evenodd" {...common} />
        : id === 'rect' ? <rect x="4" y="18" width="92" height="64" {...common} />
        : id === 'ellipse' ? <ellipse cx="50" cy="50" rx="46" ry="46" {...common} />
        : id === 'ring' ? <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="12" />
        : id === 'triangle' ? <polygon points="50,6 96,94 4,94" {...common} />
        : id === 'chevron' ? <polygon points="4,14 66,14 96,50 66,86 4,86 34,50" {...common} />
        : id === 'line' ? <line x1="6" y1="94" x2="94" y2="6" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        : null}
    </svg>
  )
}
