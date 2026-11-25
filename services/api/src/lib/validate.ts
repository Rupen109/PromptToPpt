import { zValidator as zodValidator } from '@hono/zod-validator'
import type { Env, Input, MiddlewareHandler, ValidationTargets } from 'hono'
import type { InferInput } from 'hono/validator'
import type { z } from 'zod'

/**
 * THE request validator of the API (every route uses this one; a lint rule forbids importing @hono/zod-validator elsewhere).
 * The library's default answer to a bad request is the raw list of Zod issues, which the apps showed as the error message: a person once saw
 * `[ { "origin": "string", "code": "too_big", "maximum": 160, … } ]` in the AI chat. Here a refused request answers like every other error:
 * `{ success: false, error: { code: 'INVALID_REQUEST', message } }`, where the message is one written for people:
 *  - a message a schema gives on purpose (`.min(20, 'Add a bit more text')`) is shown as it is;
 *  - Zod's own technical wording is replaced by a plain sentence, and the details go to the server log (with the route) for us.
 */
const TECHNICAL = /^(too (big|small)|invalid|expected|required|unrecognized|unknown|array must|string must|number must)/i
export const PLAIN_INVALID = 'Something in that request was not accepted, so nothing was changed. Please try again, or reload the page.'

/** the message to show for a list of issues: the first one written for people, else the plain sentence */
export function plainMessage(issues: readonly { message: string }[]): string {
  return issues.find((i) => i.message && !TECHNICAL.test(i.message.trim()))?.message ?? PLAIN_INVALID
}

type DefaultInput<Target extends keyof ValidationTargets, In, Out> = {
  in: undefined extends In ? { [K in Target]?: [In] extends [ValidationTargets[K]] ? In : InferInput<In, K> } : { [K in Target]: [In] extends [ValidationTargets[K]] ? In : InferInput<In, K> }
  out: { [K in Target]: Out }
}

export function zValidator<T extends z.ZodType, Target extends keyof ValidationTargets, E extends Env = Env, P extends string = string, In = z.input<T>, Out = z.output<T>, I extends Input = DefaultInput<Target, In, Out>, V extends I = I>(
  target: Target, schema: T,
): MiddlewareHandler<E, P, V> {
  return zodValidator(target, schema, (result, c) => {
    if (result.success) return
    const issues = result.error.issues
    console.warn('[invalid request]', c.req.method, c.req.path, target, JSON.stringify(issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message }))))
    return c.json({ success: false, error: { code: 'INVALID_REQUEST', message: plainMessage(issues), details: { fields: [...new Set(issues.map((i) => i.path.join('.')).filter(Boolean))].slice(0, 10) } } }, 400)
  }) as unknown as MiddlewareHandler<E, P, V>
}
