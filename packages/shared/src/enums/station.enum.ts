import { z } from 'zod';

export const KitchenStation = {
  BEP_NAU: 'BEP_NAU',
  BEP_CHIEN: 'BEP_CHIEN',
  PHA_CHE: 'PHA_CHE',
} as const;

export type KitchenStation = (typeof KitchenStation)[keyof typeof KitchenStation];

export const KitchenStationSchema = z.enum([
  KitchenStation.BEP_NAU,
  KitchenStation.BEP_CHIEN,
  KitchenStation.PHA_CHE,
]);

export const ProductStation = {
  ...KitchenStation,
  COMBO: 'COMBO',
} as const;

export type ProductStation = (typeof ProductStation)[keyof typeof ProductStation];

export const ProductStationSchema = z.enum([
  ProductStation.BEP_NAU,
  ProductStation.BEP_CHIEN,
  ProductStation.PHA_CHE,
  ProductStation.COMBO,
]);
