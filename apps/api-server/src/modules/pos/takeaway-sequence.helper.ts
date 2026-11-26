import { InternalServerErrorException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export function getVnBusinessDay(now: Date): { key: string; start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? '';
  const key = `${part('year')}${part('month')}${part('day')}`;
  const start = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00.000+07:00`);
  return { key, start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export async function allocateTakeawayNumber(
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<number> {
  const day = getVnBusinessDay(now);
  const rows = await tx.$queryRaw<Array<{ takeawayNumber: number }>>`
    WITH legacy AS (
      SELECT GREATEST(
        COALESCE((
          SELECT MAX(takeaway_number)::integer
          FROM orders
          WHERE order_type = 'TAKEAWAY'
            AND created_at >= ${day.start}
            AND created_at < ${day.end}
        ), 0),
        COALESCE((
          SELECT MAX(GREATEST(
            COALESCE(substring(transfer_log->>'fromTable' from 'Mang về #([0-9]+)')::integer, 0),
            COALESCE(substring(transfer_log->>'toTable' from 'Mang về #([0-9]+)')::integer, 0)
          ))
          FROM orders AS order_row
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(order_row.table_transfer_logs) = 'array'
              THEN order_row.table_transfer_logs ELSE '[]'::jsonb END
          ) AS transfer_log
          WHERE transfer_log->>'timestamp' >= ${day.start.toISOString()}
            AND transfer_log->>'timestamp' < ${day.end.toISOString()}
        ), 0)
      ) AS issued
    )
    INSERT INTO takeaway_sequences (business_date, last_number, updated_at)
    SELECT ${day.key}, legacy.issued + 1, ${now}
    FROM legacy
    ON CONFLICT (business_date) DO UPDATE
    SET last_number = GREATEST(takeaway_sequences.last_number, (SELECT issued FROM legacy)) + 1,
        updated_at = EXCLUDED.updated_at
    RETURNING last_number AS "takeawayNumber"
  `;
  const next = Number(rows[0]?.takeawayNumber);
  if (!Number.isSafeInteger(next) || next < 1) {
    throw new InternalServerErrorException('Không thể cấp số đơn mang về');
  }
  return next;
}
