'use client'

import { useMemo } from 'react'
import { designById } from '@prompttoppt/theme'
import { FitSlide } from '@prompttoppt/ui'
import { slidesFor } from './slides-for'

/** The drawn slide itself. Kept in its own file so the template engine and the slide renderer download only when a thumbnail is about to be seen (see TemplateThumb). */
export default function ThumbSlide({ designId, index }: { designId: string; index: number }) {
  const design = designById(designId)
  const slide = useMemo(() => slidesFor(designId, '16:9', index)[0], [designId, index])
  return slide && design ? <FitSlide slide={slide} theme={design.theme} aspect="16:9" /> : null
}
