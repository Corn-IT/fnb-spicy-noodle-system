const durationMultipliers: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function durationToMilliseconds(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(duration);
  if (!match?.[1] || !match[2]) throw new Error('Unsupported token lifetime');
  const result = Number(match[1]) * durationMultipliers[match[2]];
  if (!Number.isSafeInteger(result) || result < 1) throw new Error('Unsupported token lifetime');
  return result;
}
