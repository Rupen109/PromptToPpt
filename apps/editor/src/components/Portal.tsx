import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Modals render into <body>, not inside the page layout: a dialog nested in a sticky / positioned sidebar is trapped in that
 * stacking context, so later page content (slide thumbnails) painted over it and the backdrop didn't cover them.
 */
export const Portal = ({ children }: { children: ReactNode }) => createPortal(children, document.body)
