import { BIZ_TEMPLATE } from './templates/biz'
import { COOL_TEMPLATE } from './templates/cool'
import { EDU_TEMPLATE } from './templates/edu'
import { LAUNCH_TEMPLATE } from './templates/launch'
import { PITCH_ORBIT } from './templates/pitch-orbit'
import { BIZ_MATRIX } from './templates/biz-matrix'
import { BIZ_ROADMAP } from './templates/biz-roadmap'
import { BIZ_ANNUAL } from './templates/biz-annual'
import { PITCH_MARKET } from './templates/pitch-market'
import { PITCH_CARDS } from './templates/pitch-cards'
import { MKT_BILLBOARD } from './templates/mkt-billboard'
import { MKT_FEED } from './templates/mkt-feed'
import { MKT_MOODBOARD } from './templates/mkt-moodboard'
import { LAUNCH_UNBOX } from './templates/launch-unbox'
import { LAUNCH_SPOTLIGHT } from './templates/launch-spotlight'
import { LAUNCH_COUNTDOWN } from './templates/launch-countdown'
import { TECH_NEURAL } from './templates/tech-neural'
import { TECH_DASHBOARD } from './templates/tech-dashboard'
import { TECH_CIRCUIT } from './templates/tech-circuit'
import { EDU_CHALK } from './templates/edu-chalk'
import { EDU_LAB } from './templates/edu-lab'
import { EDU_ATLAS } from './templates/edu-atlas'
import { SPACE_TEMPLATE } from './templates/space'
import { registerMorphTemplates } from './lookup'
import type { MorphTemplate } from './types'

/** Every Morph template, in the order they are shown. More are added here. */
export const MORPH_TEMPLATES: MorphTemplate[] = [SPACE_TEMPLATE, LAUNCH_TEMPLATE, EDU_TEMPLATE, COOL_TEMPLATE, BIZ_TEMPLATE, PITCH_ORBIT,
  BIZ_MATRIX, BIZ_ROADMAP, BIZ_ANNUAL, PITCH_MARKET, PITCH_CARDS, MKT_BILLBOARD, MKT_FEED, MKT_MOODBOARD, LAUNCH_UNBOX, LAUNCH_SPOTLIGHT, LAUNCH_COUNTDOWN, TECH_NEURAL, TECH_DASHBOARD, TECH_CIRCUIT, EDU_CHALK, EDU_LAB, EDU_ATLAS,
]
export const getMorphTemplate = (id: string): MorphTemplate | undefined => MORPH_TEMPLATES.find((t) => t.id === id)

// importing this module is what makes the templates known to the layout engine (see lookup.ts)
registerMorphTemplates(getMorphTemplate)
