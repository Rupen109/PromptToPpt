/** Objects that share a `groupId` are one group. Pure helpers, shared by the editor and the assistant. */
interface Grouped { id: string; groupId?: string | undefined }

/** the ids plus every other object of the same group(s): selecting any member selects them all */
export function expandToGroups(elements: readonly Grouped[], ids: readonly string[]): string[] {
  const groups = new Set(elements.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId!))
  return elements.filter((e) => ids.includes(e.id) || (!!e.groupId && groups.has(e.groupId))).map((e) => e.id)
}

/** the groups among these ids: group id → its member ids (a group of one is not listed) */
export function groupsOf(elements: readonly Grouped[], ids?: readonly string[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const e of elements) if (e.groupId && (!ids || ids.includes(e.id))) out.set(e.groupId, [...(out.get(e.groupId) ?? []), e.id])
  for (const [k, v] of out) if (v.length < 2) out.delete(k)
  return out
}

/** the selection is exactly ONE whole group (so it can be resized as a unit) */
export function isWholeGroup(elements: readonly Grouped[], ids: readonly string[]): boolean {
  if (ids.length < 2) return false
  const gid = elements.find((e) => e.id === ids[0])?.groupId
  if (!gid) return false
  const members = elements.filter((e) => e.groupId === gid).map((e) => e.id)
  return members.length === ids.length && members.every((m) => ids.includes(m))
}
