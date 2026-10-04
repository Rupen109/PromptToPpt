/**
 * Single source of truth for HOW the AI must behave when it builds decks (see docs/AI_GENERATION_PLAN.md).
 * Prompts import from here; whatever must never happen is ALSO enforced in code (generation/quality.ts), so a model slip is caught, not shipped.
 * Bump INSTRUCTIONS_VERSION on every change (it is stored with each generated deck's quality report) and note it in the changelog below.
 *
 * Changelog
 *  2026-10-03.1  story arcs per family, grounding rules, facts/mustCover, imageIntent, quality gate
 */
export const INSTRUCTIONS_VERSION = '2026-10-03.1'

/** The story each kind of deck should tell. The outline follows the arc unless the user supplied their own structure. */
export const STORY_ARCS: Record<string, string> = {
  pitch: 'problem → solution → how it works → market → traction/proof → business model → team → the ask → close',
  sales: 'what we heard from you → how we help → how it works → proof (case, results) → options/investment → next steps → close',
  marketing: 'goal → audience → idea → plan/calendar → channels → results or expected outcomes → learnings → next steps → close',
  strategy: 'where we are → vision → priorities → roadmap → risks and mitigations → decisions needed → close',
  product: 'user problem → what we built → how it works → before/after → roadmap → success measures → close',
  tech: 'context and goals → architecture or approach → how it works step by step → risks/security/quality → rollout or results → close',
  reports: 'headline → key results → drivers → comparison → what to focus on → recommendations → close',
  education: 'why this matters → what you will learn / what I learned → key concepts one per slide → worked example → practice or results → summary → close',
  'case-studies': 'client and situation → challenge → approach → results → lessons learned → recommendations → close',
  team: 'welcome → mission and values → who is who → how we work → first weeks → benefits → close',
}
export const GENERIC_ARC = 'opening → context → 3–6 content slides, one idea each, in a logical order → summary → close'

/** For a personal-experience brief (an internship, a project, a course) the story is about THEIR journey. */
export const EXPERIENCE_ARC = 'introduction (who/where/when) → what I set out to do → what I learned (one slide per skill or topic they named) → what I actually did, with real examples they gave → challenges and how they were handled → outcomes and growth → what comes next → close'

/** Grounding: what slide text may and may not claim. */
export const GROUNDING_RULES = `Grounding (non-negotiable):
- Every slide is about the USER'S topic and must use the details they gave (<facts> and the request). Cover every item in "mustCover".
- You may add general explanations that are true of the subject (what a concept is, why a practice matters, common steps) — but never claim something specific happened to the user, their team or their company unless they said so.
- NEVER invent numbers, percentages, dates, durations, counts, names of people/companies/tools, quotes, results or customers that are not in the request or sources. Write qualitatively instead ("many", "regularly", "improved coverage").
- Never reuse sample/template wording (no "Northwind", "Contoso", "Acme", sample names or figures).
- Write in the language of the request, in the user's voice (first person if they wrote in first person).`
