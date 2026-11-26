import { describe, expect, it, vi } from 'vitest';
import { allocateTakeawayNumber, getVnBusinessDay } from '../takeaway-sequence.helper';

describe('takeaway sequence', () => {
  it('uses Vietnam business-day boundaries for atomic sequence allocation', async () => {
    const date = new Date('2026-11-08T16:59:59.000Z');
    const day = getVnBusinessDay(date);
    expect(day).toEqual({
      key: '20261108',
      start: new Date('2026-11-07T17:00:00.000Z'),
      end: new Date('2026-11-08T17:00:00.000Z'),
    });

    const query = vi.fn().mockResolvedValueOnce([{ takeawayNumber: 7 }]);
    await expect(allocateTakeawayNumber({ $queryRaw: query } as never, date)).resolves.toBe(7);
    const [template, ...values] = query.mock.calls[0]!;
    expect(template.raw.join('')).toContain('INSERT INTO takeaway_sequences');
    expect(values).toContain('20261108');
    expect(values.some((value) => value instanceof Date && value.getTime() === day.start.getTime())).toBe(true);
    expect(values.some((value) => value instanceof Date && value.getTime() === day.end.getTime())).toBe(true);
  });

  it('rejects a sequence result that cannot represent a positive integer', async () => {
    const query = vi.fn().mockResolvedValue([]);
    await expect(allocateTakeawayNumber({ $queryRaw: query } as never, new Date('2026-11-08T17:00:00.000Z')))
      .rejects.toThrow('Không thể cấp số đơn mang về');
  });
});
