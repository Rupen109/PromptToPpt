// Release check for the legal pages: fails (exit 1) while any owner field in apps/web/lib/legal.ts is still TODO,
// but only in a production environment (APP_ENV / NEXT_PUBLIC_APP_ENV = production) or with RELEASE_CHECK=1. In development it passes and lists what is open.
// Run: node --experimental-strip-types scripts/check-legal.mjs   (Node 22.6+; no flag needed on 22.18+/23.6+)
import { LEGAL, legalReleaseProblems, missingOwnerFields, isReleaseCheck } from '../apps/web/lib/legal.ts'

const open = missingOwnerFields(LEGAL)
if (!isReleaseCheck(process.env)) {
  console.log(`legal: development mode, not blocking. ${open.length ? `Still TODO: ${open.join(', ')}` : 'all owner fields are filled'}`)
  process.exit(0)
}
const problems = legalReleaseProblems(process.env, LEGAL)
if (problems.length) {
  console.error(`legal: release check FAILED\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log('legal: release check passed (all owner fields filled)')
