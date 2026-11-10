const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function businessDateString(date: Date): string {
  return new Date(date.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
}

export function dateAtVietnamMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000+07:00`);
}

export function businessDayRange(date: string): { start: Date; end: Date } {
  const start = dateAtVietnamMidnight(date);
  return { start, end: new Date(start.getTime() + MILLISECONDS_PER_DAY) };
}

export function dateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function nextDateOnly(date: string): Date {
  return new Date(dateOnly(date).getTime() + MILLISECONDS_PER_DAY);
}
