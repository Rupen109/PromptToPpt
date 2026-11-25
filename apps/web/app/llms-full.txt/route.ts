import { llms } from '@/lib/llms'

export const revalidate = 3600

/** /llms-full.txt: the long form of /llms.txt, built by the same code from the same data */
export const GET = () => llms(true)
