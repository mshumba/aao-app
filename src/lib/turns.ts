/**
 * Items from several ranked lists, the lists taking turns: each one's first,
 * then each one's second, and so on, until there are `count`. An item two
 * lists share comes once.
 */
export function takeTurns<T>(lists: readonly (readonly T[])[], count: number): T[] {
  const out: T[] = [];
  for (let turn = 0; out.length < count && lists.some((list) => turn < list.length); turn += 1)
    for (const list of lists) {
      if (turn < list.length && !out.includes(list[turn])) out.push(list[turn]);
      if (out.length === count) break;
    }
  return out;
}
