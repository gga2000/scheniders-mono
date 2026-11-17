/**
 * Names in a sentence: "A", "A and B", "A, B and C". Past `max` names the
 * rest are counted: "A, B, C and 2 more".
 */
export function wordList(names: readonly string[], max = Infinity): string {
  const shown = names.length > max ? [...names.slice(0, max), `${names.length - max} more`] : [...names];
  return shown.length < 2 ? shown.join("") : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}
