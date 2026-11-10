import {
  MdmCategory,
  ProductStation,
  UserPermissionsSchema,
  type KitchenStation,
  type MdmCategory as MdmCategoryType,
  type ProductStation as ProductStationType,
  type UserPermissions,
} from '@fnb/shared';
import { normalizeVietnameseString, toTitleCase } from '../src/common/utils/normalized-string.util';

export type MasterDataSeed = {
  category: MdmCategoryType;
  name: string;
  normalizedName: string;
  metadata: Record<string, unknown>;
};

export type ProductSeed = {
  name: string;
  subtitle?: string;
  categoryName?: string;
  price: string;
  station: ProductStationType;
  sortOrder: number;
  comboItems: { productName: string; quantity: number; station: KitchenStation }[];
};

function masterData(category: MdmCategoryType, rawName: string, metadata: Record<string, unknown> = {}): MasterDataSeed {
  const name = toTitleCase(rawName);
  return { category, name, normalizedName: normalizeVietnameseString(name), metadata };
}

export const masterDataSeed: MasterDataSeed[] = [
  masterData(MdmCategory.POSITION, 'Quản Lý Cửa Hàng'),
  masterData(MdmCategory.POSITION, 'Thu Ngân Quầy'),
  masterData(MdmCategory.POSITION, 'Bếp Trưởng Mì Cay'),
  masterData(MdmCategory.POSITION, 'Nhân Viên Đứng Bếp Chiên'),
  masterData(MdmCategory.POSITION, 'Nhân Viên Pha Chế'),
  masterData(MdmCategory.POSITION, 'Nhân Viên Phục Vụ'),
  masterData(MdmCategory.SPECIALTY, 'Bếp Nấu (Mì Cay)'),
  masterData(MdmCategory.SPECIALTY, 'Bếp Chiên (Đồ Ăn Vặt)'),
  masterData(MdmCategory.SPECIALTY, 'Pha Chế (Nước Uống)'),
  masterData(MdmCategory.SPECIALTY, 'Phục Vụ Bàn'),
  masterData(MdmCategory.UNIT, 'Kg'),
  masterData(MdmCategory.UNIT, 'Thùng'),
  masterData(MdmCategory.UNIT, 'Gói'),
  masterData(MdmCategory.UNIT, 'Két'),
  masterData(MdmCategory.UNIT, 'Bao'),
  masterData(MdmCategory.UNIT, 'Hộp'),
  masterData(MdmCategory.UNIT, 'Lon'),
  masterData(MdmCategory.UNIT, 'Chai'),
  masterData(MdmCategory.SUPPLIER, 'Nhà Cung Cấp Mì Cay Sơn Bảo'),
  masterData(MdmCategory.MENU_CATEGORY, 'Mì Cay', { defaultStation: ProductStation.BEP_NAU }),
  masterData(MdmCategory.MENU_CATEGORY, 'Bánh Mì Chảo', { defaultStation: ProductStation.BEP_NAU }),
  masterData(MdmCategory.MENU_CATEGORY, 'Lẩu & Món Nóng', { defaultStation: ProductStation.BEP_NAU }),
  masterData(MdmCategory.MENU_CATEGORY, 'Món Chiên Ăn Vặt', { defaultStation: ProductStation.BEP_CHIEN }),
  masterData(MdmCategory.MENU_CATEGORY, 'Đồ Uống & Pha Chế', { defaultStation: ProductStation.PHA_CHE }),
  masterData(MdmCategory.MENU_CATEGORY, 'Combo Tiết Kiệm', { defaultStation: ProductStation.COMBO }),
  masterData(MdmCategory.INGREDIENT, 'Mì Koreno Không Gia Vị', { default_unit: 'Thùng', last_price: 285000 }),
  masterData(MdmCategory.INGREDIENT, 'Ba Chỉ Bò Mỹ Đông Lạnh', { default_unit: 'Kg', last_price: 175000 }),
  masterData(MdmCategory.INGREDIENT, 'Bạch Tuộc Tươi', { default_unit: 'Kg', last_price: 140000 }),
  masterData(MdmCategory.INGREDIENT, 'Tôm Sú', { default_unit: 'Kg', last_price: 190000 }),
  masterData(MdmCategory.INGREDIENT, 'Kim Chi Cải Thảo', { default_unit: 'Kg', last_price: 45000 }),
  masterData(MdmCategory.INGREDIENT, 'Ớt Bột Hàn Quốc (Cấp Độ)', { default_unit: 'Kg', last_price: 130000 }),
  masterData(MdmCategory.INGREDIENT, 'Khoai Tây Chiên Cắt Sợi', { default_unit: 'Gói', last_price: 55000 }),
  masterData(MdmCategory.INGREDIENT, 'Phô Mai Que Đông Lạnh', { default_unit: 'Hộp', last_price: 85000 }),
  masterData(MdmCategory.INGREDIENT, 'Trà Đào Đóng Hộp', { default_unit: 'Lon', last_price: 32000 }),
  masterData(MdmCategory.INGREDIENT, 'Đá Bi Dùng Trong Ngày', { default_unit: 'Bao', last_price: 15000 }),
];

export const tableNames = Array.from({ length: 30 }, (_, index) => `Bàn ${String(index + 1).padStart(2, '0')}`);

export const productSeed: ProductSeed[] = [
  {
    name: 'Mì cay hải sản',
    subtitle: 'Ngao, tôm, mực',
    categoryName: 'Mì Cay',
    price: '79000.00',
    station: ProductStation.BEP_NAU,
    sortOrder: 1,
    comboItems: [],
  },
  {
    name: 'Mì kim chi bò',
    subtitle: 'Bò Mỹ, kim chi, nấm kim châm, xúc xích',
    categoryName: 'Mì Cay',
    price: '69000.00',
    station: ProductStation.BEP_NAU,
    sortOrder: 2,
    comboItems: [],
  },
  {
    name: 'Bánh mì chảo đặc biệt',
    subtitle: 'Trứng ốp la, pate, xúc xích, bò sốt tiêu',
    categoryName: 'Bánh Mì Chảo',
    price: '55000.00',
    station: ProductStation.BEP_NAU,
    sortOrder: 3,
    comboItems: [],
  },
  {
    name: 'Lẩu mini',
    subtitle: 'Bò Mỹ, hải sản, nấm tổng hợp',
    categoryName: 'Lẩu & Món Nóng',
    price: '99000.00',
    station: ProductStation.BEP_NAU,
    sortOrder: 4,
    comboItems: [],
  },
  {
    name: 'Khoai tây chiên',
    subtitle: 'Lắc phô mai / chấm tương ớt',
    categoryName: 'Món Chiên Ăn Vặt',
    price: '35000.00',
    station: ProductStation.BEP_CHIEN,
    sortOrder: 5,
    comboItems: [],
  },
  {
    name: 'Phô mai que',
    subtitle: '4 que giòn rụm kéo sợi',
    categoryName: 'Món Chiên Ăn Vặt',
    price: '39000.00',
    station: ProductStation.BEP_CHIEN,
    sortOrder: 6,
    comboItems: [],
  },
  {
    name: 'Cá viên chiên',
    subtitle: 'Kèm dưa leo, tương đen & tương ớt',
    categoryName: 'Món Chiên Ăn Vặt',
    price: '35000.00',
    station: ProductStation.BEP_CHIEN,
    sortOrder: 7,
    comboItems: [],
  },
  {
    name: 'Trà đào cam sả',
    subtitle: 'Đào miếng giòn, sả tươi',
    categoryName: 'Đồ Uống & Pha Chế',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    sortOrder: 8,
    comboItems: [],
  },
  {
    name: 'Trà sữa truyền thống',
    subtitle: 'Kèm trân châu đen dẻo',
    categoryName: 'Đồ Uống & Pha Chế',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    sortOrder: 9,
    comboItems: [],
  },
  {
    name: 'Pepsi',
    subtitle: 'Lon 330ml ướp lạnh',
    categoryName: 'Đồ Uống & Pha Chế',
    price: '18000.00',
    station: ProductStation.PHA_CHE,
    sortOrder: 10,
    comboItems: [],
  },
  {
    name: 'Combo Đôi',
    subtitle: '2 Mì kim chi bò + 2 Pepsi',
    categoryName: 'Combo Tiết Kiệm',
    price: '159000.00',
    station: ProductStation.COMBO,
    sortOrder: 11,
    comboItems: [
      { productName: 'Mì kim chi bò', quantity: 2, station: ProductStation.BEP_NAU },
      { productName: 'Pepsi', quantity: 2, station: ProductStation.PHA_CHE },
    ],
  },
];

export const cashierPermissions: UserPermissions = UserPermissionsSchema.parse({
  pos: { view: true, create: true, update: true, delete: false, splitKitchen: true, tableAction: true, checkout: true },
  invoices: { view: true, reprint: true, void: false },
  inventory: { view: true, create: true, update: false, delete: true },
  cashflow: { view: true, create: true, config: false },
  employees: { view: false, create: false, update: false, delete: false },
  schedules: { view: true, update: false },
  mdm: { view: false, write: false },
  rbac: { view: false, manage: false },
});
