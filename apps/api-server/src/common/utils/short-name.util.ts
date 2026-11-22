export type ExistingEmployeeShortName = { id: number; shortName: string };

export function generateShortName(
  fullName: string,
  existingEmployees: ExistingEmployeeShortName[],
  currentEmployeeId: number,
): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return `#${currentEmployeeId}`;

  const lastName = words[words.length - 1]!;
  const middleInitial = words.length > 2 ? `${words[words.length - 2]![0]!.toLocaleUpperCase()}.` : '';
  let candidate = `${middleInitial}${lastName}`;
  const hasCollision = existingEmployees.some((employee) =>
    employee.id !== currentEmployeeId && employee.shortName.toLocaleLowerCase() === candidate.toLocaleLowerCase());

  if (hasCollision) {
    const firstInitial = words.length > 1 ? `${words[0]![0]!.toLocaleUpperCase()}.` : '';
    candidate = `${firstInitial}${middleInitial}${lastName} (#${currentEmployeeId})`;
  }

  return candidate;
}
