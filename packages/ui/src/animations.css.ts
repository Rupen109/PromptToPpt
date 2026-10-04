/** Keyframes for entrance animations and slide transitions. Injected once; disabled under prefers-reduced-motion. */
export const MOTION_CSS = `
@keyframes pt-fade { from { opacity: 0 } to { opacity: var(--pt-op, 1) } }
@keyframes pt-fade-up { from { opacity: 0; transform: translateY(28px) } to { opacity: var(--pt-op, 1); transform: none } }
@keyframes pt-fade-down { from { opacity: 0; transform: translateY(-28px) } to { opacity: var(--pt-op, 1); transform: none } }
@keyframes pt-slide-left { from { opacity: 0; transform: translateX(-80px) } to { opacity: var(--pt-op, 1); transform: none } }
@keyframes pt-slide-right { from { opacity: 0; transform: translateX(80px) } to { opacity: var(--pt-op, 1); transform: none } }
@keyframes pt-zoom { from { opacity: 0; transform: scale(0.88) } to { opacity: var(--pt-op, 1); transform: none } }
@keyframes pt-pop { 0% { opacity: 0; transform: scale(0.7) } 70% { opacity: var(--pt-op, 1); transform: scale(1.04) } 100% { opacity: var(--pt-op, 1); transform: none } }
@keyframes pt-wipe { from { clip-path: inset(0 100% 0 0) } to { clip-path: inset(0 0 0 0) } }
@keyframes pt-blur { from { opacity: 0; filter: blur(14px) } to { opacity: var(--pt-op, 1); filter: none } }
@keyframes pt-kenburns { from { transform: scale(1) translate(0, 0) } to { transform: scale(1.14) translate(-2.2%, -1.6%) } }
@keyframes pt-float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-18px) } }
@keyframes pt-drift { 0%, 100% { transform: translateX(0) } 50% { transform: translateX(22px) } }
@keyframes pt-count-up { from { opacity: 0 } to { opacity: var(--pt-op, 1) } }
@keyframes pt-t-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes pt-t-slide { from { opacity: 0; transform: translateX(7%) } to { opacity: var(--pt-op, 1); transform: none } }
@keyframes pt-t-zoom { from { opacity: 0; transform: scale(1.06) } to { opacity: var(--pt-op, 1); transform: none } }
@keyframes pt-t-push { from { transform: translateX(100%) } to { transform: none } }
@keyframes pt-t-wipe { from { clip-path: inset(0 100% 0 0) } to { clip-path: inset(0 0 0 0) } }
@media (prefers-reduced-motion: reduce) { [data-pt-anim], [data-pt-transition] { animation: none !important; opacity: 1 !important; transform: none !important; clip-path: none !important; filter: none !important } }
`
