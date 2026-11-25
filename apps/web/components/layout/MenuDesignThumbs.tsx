'use client'

import { HoverLink } from '@/components/ui/HoverLink'
import { TemplateThumb } from '@/components/templates/TemplateThumb'

export interface MenuDesign { id: string; name: string; tagline: string }

/**
 * The live slide thumbnails of a template collection, for the header's Templates menu. Kept in its own file so the header (which is on every page) does not carry the template
 * designs: this is loaded only when the menu is first opened (see NavMenus).
 */
export default function MenuDesignThumbs({ designs, onNavigate }: { designs: MenuDesign[]; onNavigate: () => void }) {
  return (
    <ul className="mt-3 grid grid-cols-3 gap-x-2 gap-y-3">
      {designs.map((d) => (
        <li key={d.id} className="list-none">
          <HoverLink href={`/templates/${d.id}`} onClick={onNavigate} className="block overflow-hidden rounded-lg border-2 border-foreground bg-white" aria-label={`${d.name}: ${d.tagline}`}>
            <TemplateThumb designId={d.id} />
          </HoverLink>
          <span className="mt-1 block truncate text-center text-xs font-semibold text-[#475569]">{d.name}</span>
        </li>
      ))}
    </ul>
  )
}
