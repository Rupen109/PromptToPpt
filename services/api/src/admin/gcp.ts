import { GoogleAuth } from 'google-auth-library'
import { env } from '../env.ts'

/**
 * Live "what Google actually billed" — read from the project's Cloud Billing export in BigQuery (cost per day / service / SKU,
 * with credits applied). Optional: when GCP_BILLING_EXPORT_TABLE or GCP_SERVICE_ACCOUNT_JSON is missing the owner page shows
 * the setup steps instead. The export lags real time by a few hours (Google's limit, not ours) and only holds data from the day
 * it was switched on.
 */
export const gcpConfigured = () => !!env.GCP_BILLING_EXPORT_TABLE && !!env.GCP_SERVICE_ACCOUNT_JSON

export const SETUP_STEPS = [
  'In Google Cloud Console → Billing → Billing export → BigQuery export, enable "Standard usage cost" (create a dataset such as billing_export). Data starts flowing from that moment.',
  'Create a service account (IAM & Admin → Service accounts) and grant it "BigQuery Job User" on the project and "BigQuery Data Viewer" on the billing_export dataset. Create a JSON key.',
  'Set GCP_BILLING_EXPORT_TABLE=<project>.<dataset>.gcp_billing_export_v1_<BILLING_ACCOUNT_ID> and GCP_SERVICE_ACCOUNT_JSON=<the key JSON, or its base64> in services/api/.env, then restart the API.',
] as const

function credentials(): Record<string, unknown> {
  const raw = env.GCP_SERVICE_ACCOUNT_JSON!.trim()
  return JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')) as Record<string, unknown>
}

export interface BilledRow { day: string; service: string; sku: string; cost: number; credits: number; net: number; currency: string }

/** Pure: BigQuery REST rows → typed rows (exported for tests). */
export function parseRows(fields: { name: string }[], rows: { f: { v: string | null }[] }[] | undefined): BilledRow[] {
  const idx = Object.fromEntries(fields.map((f, i) => [f.name, i]))
  return (rows ?? []).map((r) => {
    const g = (k: string) => r.f[idx[k]!]?.v ?? null
    const cost = Number(g('cost') ?? 0), credits = Number(g('credits') ?? 0)
    return { day: String(g('day')), service: String(g('service') ?? ''), sku: String(g('sku') ?? ''), cost, credits, net: cost + credits, currency: String(g('currency') ?? '') }
  })
}

export async function billedBetween(from: Date, to: Date): Promise<BilledRow[]> {
  const table = env.GCP_BILLING_EXPORT_TABLE!
  const creds = credentials()
  const auth = new GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/bigquery.readonly'] })
  const token = (await auth.getAccessToken()) ?? ''
  const project = String(creds['project_id'] ?? table.split('.')[0])
  const res = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(project)}/queries`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      useLegacySql: false, parameterMode: 'NAMED', maxResults: 5000,
      // credits are negative amounts; only Vertex / Gemini / Generative Language services (the AI spend) are listed
      query: `SELECT CAST(DATE(usage_start_time) AS STRING) AS day, service.description AS service, sku.description AS sku, SUM(cost) AS cost, SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS credits, ANY_VALUE(currency) AS currency
              FROM \`${table}\` WHERE usage_start_time >= @from AND usage_start_time < @to AND (service.description LIKE '%Vertex%' OR service.description LIKE '%Gemini%' OR service.description LIKE '%Generative%') GROUP BY day, service, sku ORDER BY day DESC, cost DESC`,
      queryParameters: [{ name: 'from', parameterType: { type: 'TIMESTAMP' }, parameterValue: { value: from.toISOString() } }, { name: 'to', parameterType: { type: 'TIMESTAMP' }, parameterValue: { value: to.toISOString() } }],
    }),
  })
  const body = (await res.json().catch(() => ({}))) as { schema?: { fields: { name: string }[] }; rows?: { f: { v: string | null }[] }[]; error?: { message?: string } }
  if (!res.ok) throw new Error(body.error?.message?.slice(0, 200) ?? `BigQuery ${res.status}`)
  return parseRows(body.schema?.fields ?? [], body.rows)
}
