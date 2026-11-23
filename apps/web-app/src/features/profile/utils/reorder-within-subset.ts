/**
 * Moves one item inside a subset of a flat order and returns the full order.
 * The subset keeps the slots it already occupied, so items outside it never move.
 * Returns the original order (copied) when the move is out of range or the item is not in the subset.
 */
export function moveWithinSubset(
  fullOrder: readonly string[],
  subset: readonly string[],
  itemId: string,
  delta: -1 | 1,
): string[] {
  const from = subset.indexOf(itemId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= subset.length) return [...fullOrder];

  const reorderedSubset = [...subset];
  const [moved] = reorderedSubset.splice(from, 1);
  reorderedSubset.splice(to, 0, moved as string);

  const subsetMembers = new Set(subset);
  let nextSubsetIndex = 0;
  return fullOrder.map((id) =>
    subsetMembers.has(id) ? (reorderedSubset[nextSubsetIndex++] as string) : id,
  );
}
