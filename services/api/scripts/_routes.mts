import { app } from '../src/app.ts'
const seen = new Set<string>(); const rows: string[] = []
for (const r of app.routes) { const k = `${r.method} ${r.path}`; if (r.method === 'ALL' || seen.has(k) || !r.path.startsWith('/api')) continue; seen.add(k); rows.push(k) }
console.log(rows.length, 'routes'); console.log(rows.join('\n'))
