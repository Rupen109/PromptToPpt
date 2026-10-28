import { z } from 'zod'

// ---- Auth ----

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long'),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
})

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

// ---- Prompt Submission ----

export const submitPromptSchema = z.object({
  prompt: z
    .string()
    .min(3, 'Prompt is too short')
    .max(5000, 'Prompt exceeds maximum length of 5000 characters'),
  slideCount: z.number().int().min(3).max(50).optional(),
  audience: z.string().max(200).optional(),
  tone: z.enum(['professional', 'casual', 'academic', 'persuasive', 'creative']).optional(),
  language: z.string().default('en'),
  selectedDirectionIndex: z.number().int().min(0).max(3).optional(),
})

export type SubmitPromptInput = z.infer<typeof submitPromptSchema>

// ---- Source Upload ----

export const uploadSourceSchema = z.object({
  jobId: z.string().uuid(),
  type: z.enum(['pdf', 'pptx', 'url', 'youtube', 'audio', 'text', 'image']),
  url: z.string().url().optional(),
  text: z.string().max(50000).optional(),
})

export type UploadSourceInput = z.infer<typeof uploadSourceSchema>

// ---- Slide Update ----

export const updateSlideSchema = z.object({
  layoutId: z.string().optional(),
  locked: z.boolean().optional(),
  background: z
    .object({
      type: z.enum(['color', 'gradient', 'image']),
      value: z.string(),
    })
    .optional(),
  speakerNotes: z.string().max(5000).optional(),
  elements: z.array(z.record(z.string(), z.unknown())).optional(),
})

export type UpdateSlideInput = z.infer<typeof updateSlideSchema>

// ---- Presentation ----

export const createPresentationSchema = z.object({
  title: z.string().min(1).max(200),
  aspectRatio: z.enum(['16:9', '4:3', '1:1']).default('16:9'),
  themeId: z.string().optional(),
  language: z.string().default('en'),
})

export type CreatePresentationInput = z.infer<typeof createPresentationSchema>

// ---- AI Edit ----

export const aiEditSchema = z.object({
  presentationId: z.string().uuid(),
  slideId: z.string().uuid().optional(),
  command: z.enum([
    'rewrite',
    'shorten',
    'expand',
    'change_tone',
    'translate',
    'add_slide',
    'remove_slide',
    'reorder',
    'improve_visual',
    'create_chart',
    'create_diagram',
    'replace_image',
    'restyle',
  ]),
  targetText: z.string().max(2000).optional(),
  targetLanguage: z.string().optional(),
  additionalContext: z.string().max(500).optional(),
})

export type AIEditInput = z.infer<typeof aiEditSchema>

// ---- Export ----

export const createExportSchema = z.object({
  presentationId: z.string().uuid(),
  format: z.enum(['pptx', 'pdf', 'png', 'jpg']),
})

export type CreateExportInput = z.infer<typeof createExportSchema>

// ---- Share Link ----

export const createShareLinkSchema = z.object({
  presentationId: z.string().uuid(),
  permission: z.enum(['view', 'edit']).default('view'),
  password: z.string().min(4).max(100).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
})

export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>

// ---- Checkout ----

export const checkoutSchema = z.object({
  planSlug: z.enum(['pro', 'gold']),
  billingCycle: z.enum(['monthly', 'annual']),
  currency: z.enum(['INR', 'USD']),
})

export type CheckoutInput = z.infer<typeof checkoutSchema>
export * from './presentation'
export * from './plans'
export * from './languages'
