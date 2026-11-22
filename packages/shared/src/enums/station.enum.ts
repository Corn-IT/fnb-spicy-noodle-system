import { z } from 'zod';

export const KitchenStation = {
  BEP_NAU: 'BEP_NAU',
  BEP_CHIEN: 'BEP_CHIEN',
  PHA_CHE: 'PHA_CHE',
} as const;

export type KitchenStation = (typeof KitchenStation)[keyof typeof KitchenStation] | (string & {});

export const KitchenStationSchema = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .refine(
    (val) =>
      val !== 'COMBO' &&
      (val === 'BEP_NAU' ||
        val === 'BEP_CHIEN' ||
        val === 'PHA_CHE' ||
        /^BEP_[A-Z0-9_]{1,12}$/.test(val)),
    { message: 'Trạm bếp vật lý không hợp lệ' },
  );

export const ProductStation = {
  ...KitchenStation,
  COMBO: 'COMBO',
} as const;

export type ProductStation = (typeof ProductStation)[keyof typeof ProductStation] | (string & {});

export const ProductStationSchema = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .refine(
    (val) =>
      val === 'BEP_NAU' ||
      val === 'BEP_CHIEN' ||
      val === 'PHA_CHE' ||
      val === 'COMBO' ||
      /^BEP_[A-Z0-9_]{1,12}$/.test(val),
    { message: 'Trạm sản phẩm không hợp lệ' },
  );
