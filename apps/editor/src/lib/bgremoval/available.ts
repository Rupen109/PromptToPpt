import { useFlag } from '@/lib/flags'
import { backgroundRemovalProvider } from './providers'

/**
 * Whether the "Remove background" editor is offered: the server's `background_removal` flag is on for this person AND this build has a provider. A production build has none (see
 * providers/index.ts) and the server keeps the flag off in production until a commercially approved model or provider is chosen, so it is never offered to customers.
 */
export function useBackgroundRemovalAvailable(): boolean {
  const flag = useFlag('background_removal')
  return flag && backgroundRemovalProvider() !== null
}
