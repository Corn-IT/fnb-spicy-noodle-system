import { Injectable, UnprocessableEntityException, type PipeTransform } from '@nestjs/common';
import { ErrorCodes } from '@fnb/shared';
import { type ZodType } from 'zod';

@Injectable()
export class ZodValidationPipe<TOutput = unknown> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Dữ liệu không hợp lệ',
        details: { fieldErrors: result.error.flatten().fieldErrors },
      });
    }

    return result.data;
  }
}
