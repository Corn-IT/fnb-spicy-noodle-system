import {
  DEFAULT_STORE_SETTINGS,
  MdmCategory,
  ProductStation,
  UserPermissionsSchema,
  defaultUserPermissions,
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

export type SeedModifierDef = {
  name: string;
  extraPrice: string;
  isDefaultChecked?: boolean;
  defaultSubstituteName?: string;
  allowedSubstituteNames?: readonly string[] | null;
};

export type SeedModifierGroupDef = {
  name: string;
  isRequired: boolean;
  maxSelect: number;
  isAutoSelect?: boolean;
  allowSubstitution?: boolean;
  modifiers: readonly SeedModifierDef[];
};

export type ProductSeed = {
  name: string;
  subtitle?: string;
  categoryName: string;
  price: string;
  station: ProductStationType;
  sortOrder: number;
  comboItems: { productName: string; quantity: number; station: KitchenStation }[];
  modifierGroups?: readonly SeedModifierGroupDef[];
};

export type SeedEmployeeDef = {
  fullName: string;
  shortName: string;
  position: string;
  specialty: string;
  phone?: string;
  note?: string;
  account?: {
    username: string;
    isSuperAdmin: boolean;
    roleKey: 'SUPERADMIN' | 'ADMIN' | 'CASHIER' | 'ADMIN_VIEW';
  };
};

function masterData(
  category: MdmCategoryType,
  rawName: string,
  metadata: Record<string, unknown> = {},
): MasterDataSeed {
  const name = toTitleCase(rawName);
  return { category, name, normalizedName: normalizeVietnameseString(name), metadata };
}

// ==========================================
// 1. NHÓM TUỲ CHỌN (MODIFIER GROUPS) CHUẨN
// ==========================================

export const spiceLevels0To7: readonly SeedModifierDef[] = Array.from({ length: 8 }, (_, level) => ({
  name: `Cấp độ ${level}`,
  extraPrice: '0.00',
}));

export const defaultNoodleGarnishes: readonly SeedModifierDef[] = [
  { name: 'Tôm viên', extraPrice: '0.00', isDefaultChecked: true },
  { name: 'Xúc xích', extraPrice: '0.00', isDefaultChecked: true },
  { name: 'Rau', extraPrice: '0.00', isDefaultChecked: true },
  { name: 'Ngô', extraPrice: '0.00', isDefaultChecked: true },
  { name: 'Nấm kim châm', extraPrice: '0.00', isDefaultChecked: true },
  { name: 'Kim chi', extraPrice: '0.00', isDefaultChecked: true },
];

export const seafoodMainIngredients: readonly SeedModifierDef[] = [
  { name: 'Ngao', extraPrice: '0.00', isDefaultChecked: true, allowedSubstituteNames: [] },
  { name: 'Tôm', extraPrice: '0.00', isDefaultChecked: true, defaultSubstituteName: 'Mực', allowedSubstituteNames: ['Mực', 'Ngao'] },
  { name: 'Mực', extraPrice: '0.00', isDefaultChecked: true, defaultSubstituteName: 'Tôm', allowedSubstituteNames: ['Tôm', 'Ngao'] },
];

export const squidMainIngredients: readonly SeedModifierDef[] = [
  { name: 'Ngao', extraPrice: '0.00', isDefaultChecked: true, allowedSubstituteNames: [] },
  { name: 'Mực', extraPrice: '0.00', isDefaultChecked: true, defaultSubstituteName: 'Ngao', allowedSubstituteNames: ['Ngao'] },
];

export const mixedMainIngredients: readonly SeedModifierDef[] = [
  { name: 'Ngao', extraPrice: '0.00', isDefaultChecked: true, allowedSubstituteNames: [] },
  { name: 'Tôm', extraPrice: '0.00', isDefaultChecked: true, defaultSubstituteName: 'Mực', allowedSubstituteNames: ['Mực', 'Sườn sụn'] },
  { name: 'Sườn sụn', extraPrice: '0.00', isDefaultChecked: true, defaultSubstituteName: 'Tôm', allowedSubstituteNames: ['Tôm', 'Mực'] },
  { name: 'Trứng', extraPrice: '0.00', isDefaultChecked: true, allowedSubstituteNames: [] },
  { name: 'Mực', extraPrice: '0.00', isDefaultChecked: true, defaultSubstituteName: 'Tôm', allowedSubstituteNames: ['Tôm', 'Sườn sụn'] },
];

export const noodleToppings: readonly SeedModifierDef[] = [
  { name: 'Xúc xích (5k)', extraPrice: '5000.00' },
  { name: 'Tôm viên (5k)', extraPrice: '5000.00' },
  { name: 'Đậu hũ (5k)', extraPrice: '5000.00' },
  { name: 'Ngao (5k)', extraPrice: '5000.00' },
  { name: 'Kim chi (5k)', extraPrice: '5000.00' },
  { name: 'Nấm kim châm (5k)', extraPrice: '5000.00' },
  { name: 'Bò Mỹ (10k)', extraPrice: '10000.00' },
  { name: 'Sườn sụn (10k)', extraPrice: '10000.00' },
  { name: 'Tôm (10k)', extraPrice: '10000.00' },
  { name: 'Mực (10k)', extraPrice: '10000.00' },
];

export const banhMiChaoAddons: readonly SeedModifierDef[] = [
  { name: 'Thêm Bánh mì (5k/1c)', extraPrice: '5000.00' },
  { name: 'Thêm Xúc xích (10k/1c)', extraPrice: '10000.00' },
  { name: 'Thêm Pate (10k)', extraPrice: '10000.00' },
  { name: 'Thêm Thịt bò (20k)', extraPrice: '20000.00' },
];

export const pizzaCheeseModifiers: readonly SeedModifierDef[] = [
  { name: 'Thêm Phô Mai (10k)', extraPrice: '10000.00' },
  { name: 'Thêm Phô Mai Gấp Đôi (20k)', extraPrice: '20000.00' },
];

export const hotpotAddons: readonly SeedModifierDef[] = [
  { name: 'Rau/Đậu (10k/phần)', extraPrice: '10000.00' },
  { name: 'Kim chi/Nấm (20k/phần)', extraPrice: '20000.00' },
  { name: 'Xúc xích/Viên lẩu (30k/đĩa)', extraPrice: '30000.00' },
  { name: 'Sườn sụn/Bò Mỹ (50k/đĩa)', extraPrice: '50000.00' },
  { name: 'Tôm/Mực/Bò tươi (80k/đĩa)', extraPrice: '80000.00' },
];

const standardNoodleModifierGroups: readonly SeedModifierGroupDef[] = [
  {
    name: 'Cấp độ cay',
    isRequired: true,
    maxSelect: 1,
    modifiers: spiceLevels0To7,
  },
  {
    name: 'Đồ ăn mặc định (0đ)',
    isRequired: false,
    maxSelect: 6,
    isAutoSelect: true,
    modifiers: defaultNoodleGarnishes,
  },
  {
    name: 'Đồ ăn thêm',
    isRequired: false,
    maxSelect: 10,
    modifiers: noodleToppings,
  },
];

function createMultiMainNoodleModifierGroups(
  mainModifiers: readonly SeedModifierDef[],
): readonly SeedModifierGroupDef[] {
  return [
    {
      name: 'Cấp độ cay',
      isRequired: true,
      maxSelect: 1,
      modifiers: spiceLevels0To7,
    },
    {
      name: 'Đồ ăn mặc định (0đ)',
      isRequired: false,
      maxSelect: 6,
      isAutoSelect: true,
      modifiers: defaultNoodleGarnishes,
    },
    {
      name: 'Đồ ăn món chính',
      isRequired: false,
      maxSelect: mainModifiers.length,
      isAutoSelect: true,
      allowSubstitution: true,
      modifiers: mainModifiers,
    },
    {
      name: 'Đồ ăn thêm',
      isRequired: false,
      maxSelect: 10,
      modifiers: noodleToppings,
    },
  ];
}

const topokiModifierGroups: readonly SeedModifierGroupDef[] = [
  {
    name: 'Độ cay',
    isRequired: true,
    maxSelect: 1,
    modifiers: [
      { name: 'Mặc định', extraPrice: '0.00', isDefaultChecked: true },
      { name: 'Không cay', extraPrice: '0.00' },
    ],
  },
];

const banhMiChaoModifierGroups: readonly SeedModifierGroupDef[] = [
  {
    name: 'Đồ Gọi Thêm (Bánh Mì Chảo)',
    isRequired: false,
    maxSelect: 4,
    modifiers: banhMiChaoAddons,
  },
];

const pizzaModifierGroups: readonly SeedModifierGroupDef[] = [
  {
    name: 'Tuỳ chọn Phô Mai',
    isRequired: false,
    maxSelect: 1,
    modifiers: pizzaCheeseModifiers,
  },
];

function createHotpotModifierGroups(sizeModifiers?: readonly SeedModifierDef[]): readonly SeedModifierGroupDef[] {
  const groups: SeedModifierGroupDef[] = [];
  if (sizeModifiers && sizeModifiers.length > 0) {
    groups.push({
      name: 'Chọn Cỡ Nồi Lẩu',
      isRequired: true,
      maxSelect: 1,
      modifiers: sizeModifiers,
    });
  }
  groups.push({
    name: 'Đồ Gọi Thêm Lẩu',
    isRequired: false,
    maxSelect: 5,
    modifiers: hotpotAddons,
  });
  return groups;
}

const standardSweetnessGroup: SeedModifierGroupDef = {
  name: 'Độ ngọt (Đường)',
  isRequired: true,
  maxSelect: 1,
  modifiers: [
    { name: 'Mặc định', extraPrice: '0.00', isDefaultChecked: true },
    { name: 'Giảm ngọt', extraPrice: '0.00' },
    { name: 'Thêm ngọt', extraPrice: '0.00' },
  ],
};

const juiceSweetnessGroup: SeedModifierGroupDef = {
  name: 'Độ ngọt (Đường)',
  isRequired: true,
  maxSelect: 1,
  modifiers: [
    { name: 'Nguyên chất', extraPrice: '0.00', isDefaultChecked: true },
    { name: 'Thêm đường', extraPrice: '0.00' },
  ],
};

const standardIceGroup: SeedModifierGroupDef = {
  name: 'Lượng đá',
  isRequired: true,
  maxSelect: 1,
  modifiers: [
    { name: 'Đá mặc định', extraPrice: '0.00', isDefaultChecked: true },
    { name: 'Ít đá', extraPrice: '0.00' },
  ],
};

const standardDrinkSizeGroup: SeedModifierGroupDef = {
  name: 'Size',
  isRequired: true,
  maxSelect: 1,
  modifiers: [
    { name: 'Size M', extraPrice: '0.00', isDefaultChecked: true },
    { name: 'Size L', extraPrice: '5000.00' },
  ],
};

const standardColdDrinkModifierGroups: readonly SeedModifierGroupDef[] = [
  standardDrinkSizeGroup,
  standardSweetnessGroup,
  standardIceGroup,
];

const juiceDrinkModifierGroups: readonly SeedModifierGroupDef[] = [
  standardDrinkSizeGroup,
  juiceSweetnessGroup,
  standardIceGroup,
];

const blendedColdDrinkModifierGroups: readonly SeedModifierGroupDef[] = [
  standardDrinkSizeGroup,
  standardSweetnessGroup,
];

const hotDrinkModifierGroups: readonly SeedModifierGroupDef[] = [
  standardSweetnessGroup,
];

const yogurtDrinkModifierGroups: readonly SeedModifierGroupDef[] = [
  standardDrinkSizeGroup,
];

const sodaDrinkModifierGroups: readonly SeedModifierGroupDef[] = [
  standardDrinkSizeGroup,
  standardIceGroup,
];

// ==========================================
// 2. MASTER DATA SEED (ĐẦY ĐỦ 7 NHÓM CHUẨN)
// ==========================================

export const masterDataSeed: MasterDataSeed[] = [
  // Trạm bếp hệ thống
  masterData(MdmCategory.KITCHEN_STATION, 'Bếp Nấu', {
    code: ProductStation.BEP_NAU,
    stationCode: ProductStation.BEP_NAU,
    sortOrder: 1,
    isHidden: false,
    isSystem: true,
    description: 'Mì cay, Bánh mì chảo, Topoki, Lẩu...',
  }),
  masterData(MdmCategory.KITCHEN_STATION, 'Bếp Chiên', {
    code: ProductStation.BEP_CHIEN,
    stationCode: ProductStation.BEP_CHIEN,
    sortOrder: 2,
    isHidden: false,
    isSystem: true,
    description: 'Gà rán, Đồ ăn vặt, Pizza, Nem, Cơm...',
  }),
  masterData(MdmCategory.KITCHEN_STATION, 'Pha Chế', {
    code: ProductStation.PHA_CHE,
    stationCode: ProductStation.PHA_CHE,
    sortOrder: 3,
    isHidden: false,
    isSystem: true,
    description: 'Trà trái cây, Trà sữa, Sinh tố, Đồ ăn vặt quầy nước...',
  }),
  masterData(MdmCategory.KITCHEN_STATION, 'Combo', {
    code: ProductStation.COMBO,
    stationCode: ProductStation.COMBO,
    sortOrder: 4,
    isHidden: false,
    isSystem: true,
    description: 'Tự động tách phiếu về các bếp vật lý',
  }),

  // Chức vụ (POSITION — sắp xếp theo cấp bậc quản lý → thu ngân → bếp → phục vụ)
  masterData(MdmCategory.POSITION, 'Chủ Cửa Hàng', { sortOrder: 1, description: 'Chủ sở hữu & quản trị toàn hệ thống' }),
  masterData(MdmCategory.POSITION, 'Quản Lý Cửa Hàng', { sortOrder: 2, description: 'Điều hành vận hành ca & kiểm soát số liệu' }),
  masterData(MdmCategory.POSITION, 'Thu Ngân Quầy', { sortOrder: 3, description: 'Tiếp nhận đơn POS/QR, tách bếp & kết ca' }),
  masterData(MdmCategory.POSITION, 'Bếp Trưởng Mì Cay', { sortOrder: 4, description: 'Phụ trách chính khu vực Bếp Nấu' }),
  masterData(MdmCategory.POSITION, 'Nhân Viên Bếp Nấu', { sortOrder: 5, description: 'Chế biến mì cay, lẩu, bánh mì chảo, topoki' }),
  masterData(MdmCategory.POSITION, 'Nhân Viên Đứng Bếp Chiên', { sortOrder: 6, description: 'Chế biến gà rán, pizza, đồ ăn vặt, nem, cơm' }),
  masterData(MdmCategory.POSITION, 'Nhân Viên Pha Chế', { sortOrder: 7, description: 'Pha chế đồ uống & đồ ăn vặt quầy nước' }),
  masterData(MdmCategory.POSITION, 'Nhân Viên Phục Vụ', { sortOrder: 8, description: 'Phục vụ bàn, lên món & chăm sóc khách' }),

  // Chuyên môn (SPECIALTY)
  masterData(MdmCategory.SPECIALTY, 'Quản Lý', { sortOrder: 1, description: 'Khối quản lý & điều hành' }),
  masterData(MdmCategory.SPECIALTY, 'Thu Ngân', { sortOrder: 2, description: 'Khối thu ngân quầy POS' }),
  masterData(MdmCategory.SPECIALTY, 'Bếp Nấu (Mì Cay)', { sortOrder: 3, description: 'Khu vực Bếp Nấu (BEP_NAU)' }),
  masterData(MdmCategory.SPECIALTY, 'Bếp Chiên (Đồ Ăn Vặt)', { sortOrder: 4, description: 'Khu vực Bếp Chiên (BEP_CHIEN)' }),
  masterData(MdmCategory.SPECIALTY, 'Pha Chế (Nước Uống)', { sortOrder: 5, description: 'Khu vực Quầy Nước (PHA_CHE)' }),
  masterData(MdmCategory.SPECIALTY, 'Phục Vụ Bàn', { sortOrder: 6, description: 'Tổ phục vụ sảnh bàn' }),

  // Đơn vị tính (UNIT — sắp xếp theo tần suất nhập hàng)
  masterData(MdmCategory.UNIT, 'Kg', { sortOrder: 1, description: 'Kilôgam' }),
  masterData(MdmCategory.UNIT, 'Gói', { sortOrder: 2, description: 'Gói / Bịch' }),
  masterData(MdmCategory.UNIT, 'Hộp', { sortOrder: 3, description: 'Hộp đóng sẵn' }),
  masterData(MdmCategory.UNIT, 'Thùng', { sortOrder: 4, description: 'Thùng đóng gói' }),
  masterData(MdmCategory.UNIT, 'Bao', { sortOrder: 5, description: 'Bao (đá bi, gạo...)' }),
  masterData(MdmCategory.UNIT, 'Cái', { sortOrder: 6, description: 'Cái (bánh mì, đế pizza...)' }),
  masterData(MdmCategory.UNIT, 'Quả', { sortOrder: 7, description: 'Quả (trứng gà, trái cây...)' }),
  masterData(MdmCategory.UNIT, 'Lít', { sortOrder: 8, description: 'Lít dung dịch / sữa tươi' }),
  masterData(MdmCategory.UNIT, 'Chai', { sortOrder: 9, description: 'Chai nước / siro / rượu' }),
  masterData(MdmCategory.UNIT, 'Lon', { sortOrder: 10, description: 'Lon đồ uống / nguyên liệu hộp thiếc' }),
  masterData(MdmCategory.UNIT, 'Két', { sortOrder: 11, description: 'Két nước ngọt / bia' }),
  masterData(MdmCategory.UNIT, 'Vỉ', { sortOrder: 12, description: 'Vỉ (trứng, sữa chua...)' }),
  masterData(MdmCategory.UNIT, 'Cuộn', { sortOrder: 13, description: 'Cuộn (rong biển, màng bọc...)' }),

  // Nhà cung cấp (SUPPLIER)
  masterData(MdmCategory.SUPPLIER, 'Chợ Khu Vực', {
    sortOrder: 1,
    description: 'Nguồn cung cấp nguyên liệu tươi sống & hàng hoá tổng hợp hàng ngày',
  }),

  // Nguyên vật liệu kho (INGREDIENT — nhóm Bếp Nấu → Bếp Chiên → Quầy Nước)
  masterData(MdmCategory.INGREDIENT, 'Mì Koreno Không Gia Vị', { sortOrder: 1, default_unit: 'Thùng', last_price: 285000 }),
  masterData(MdmCategory.INGREDIENT, 'Ớt Bột Hàn Quốc (Cấp Độ)', { sortOrder: 2, default_unit: 'Kg', last_price: 130000 }),
  masterData(MdmCategory.INGREDIENT, 'Kim Chi Cải Thảo', { sortOrder: 3, default_unit: 'Kg', last_price: 45000 }),
  masterData(MdmCategory.INGREDIENT, 'Nấm Kim Châm', { sortOrder: 4, default_unit: 'Gói', last_price: 15000 }),
  masterData(MdmCategory.INGREDIENT, 'Ngô Ngọt Hạt', { sortOrder: 5, default_unit: 'Lon', last_price: 28000 }),
  masterData(MdmCategory.INGREDIENT, 'Đậu Hũ Trắng / Non', { sortOrder: 6, default_unit: 'Hộp', last_price: 12000 }),
  masterData(MdmCategory.INGREDIENT, 'Ba Chỉ Bò Mỹ Đông Lạnh', { sortOrder: 7, default_unit: 'Kg', last_price: 175000 }),
  masterData(MdmCategory.INGREDIENT, 'Thịt Bò Tươi', { sortOrder: 8, default_unit: 'Kg', last_price: 250000 }),
  masterData(MdmCategory.INGREDIENT, 'Sườn Sụn Heo', { sortOrder: 9, default_unit: 'Kg', last_price: 155000 }),
  masterData(MdmCategory.INGREDIENT, 'Xúc Xích Đức / Việt', { sortOrder: 10, default_unit: 'Gói', last_price: 65000 }),
  masterData(MdmCategory.INGREDIENT, 'Tôm Sú Tươi', { sortOrder: 11, default_unit: 'Kg', last_price: 190000 }),
  masterData(MdmCategory.INGREDIENT, 'Mực Ống Tươi', { sortOrder: 12, default_unit: 'Kg', last_price: 165000 }),
  masterData(MdmCategory.INGREDIENT, 'Ngao Tươi', { sortOrder: 13, default_unit: 'Kg', last_price: 35000 }),
  masterData(MdmCategory.INGREDIENT, 'Tôm Viên / Cá Viên', { sortOrder: 14, default_unit: 'Gói', last_price: 55000 }),
  masterData(MdmCategory.INGREDIENT, 'Thịt Gà Tươi (Đùi / Cánh / Ức)', { sortOrder: 15, default_unit: 'Kg', last_price: 95000 }),
  masterData(MdmCategory.INGREDIENT, 'Bánh Gạo Topoki Hàn Quốc', { sortOrder: 16, default_unit: 'Gói', last_price: 52000 }),
  masterData(MdmCategory.INGREDIENT, 'Phô Mai Mozzarella Sợi', { sortOrder: 17, default_unit: 'Kg', last_price: 195000 }),
  masterData(MdmCategory.INGREDIENT, 'Đế Pizza Làm Sẵn', { sortOrder: 18, default_unit: 'Cái', last_price: 18000 }),
  masterData(MdmCategory.INGREDIENT, 'Khoai Tây Chiên Cắt Sợi', { sortOrder: 19, default_unit: 'Gói', last_price: 55000 }),
  masterData(MdmCategory.INGREDIENT, 'Phô Mai Que Đông Lạnh', { sortOrder: 20, default_unit: 'Hộp', last_price: 85000 }),
  masterData(MdmCategory.INGREDIENT, 'Nem Chua Rán / Nem Nướng', { sortOrder: 21, default_unit: 'Hộp', last_price: 75000 }),
  masterData(MdmCategory.INGREDIENT, 'Bánh Mì Chảo & Pate Gan', { sortOrder: 22, default_unit: 'Cái', last_price: 5000 }),
  masterData(MdmCategory.INGREDIENT, 'Trứng Gà Tươi', { sortOrder: 23, default_unit: 'Quả', last_price: 3500 }),
  masterData(MdmCategory.INGREDIENT, 'Hồng Trà & Lục Trà Pha Chế', { sortOrder: 24, default_unit: 'Gói', last_price: 120000 }),
  masterData(MdmCategory.INGREDIENT, 'Trà Đào Đóng Hộp', { sortOrder: 25, default_unit: 'Lon', last_price: 32000 }),
  masterData(MdmCategory.INGREDIENT, 'Sữa Tươi Thanh Trùng', { sortOrder: 26, default_unit: 'Lít', last_price: 36000 }),
  masterData(MdmCategory.INGREDIENT, 'Sữa Đặc Có Đường', { sortOrder: 27, default_unit: 'Lon', last_price: 26000 }),
  masterData(MdmCategory.INGREDIENT, 'Trân Châu Đường Đen & Trắng', { sortOrder: 28, default_unit: 'Gói', last_price: 48000 }),
  masterData(MdmCategory.INGREDIENT, 'Trái Cây Tươi (Cam, Xoài, Bơ, Dâu, Dứa)', { sortOrder: 29, default_unit: 'Kg', last_price: 45000 }),
  masterData(MdmCategory.INGREDIENT, 'Đá Bi Dùng Trong Ngày', { sortOrder: 30, default_unit: 'Bao', last_price: 15000 }),

  // Danh mục Thực đơn (MENU_CATEGORY — 25 danh mục chuẩn)
  // 1. BEP_NAU (6 danh mục)
  masterData(MdmCategory.MENU_CATEGORY, 'Mỳ Cay Kim Chi Hàn Quốc', { defaultStation: ProductStation.BEP_NAU, sortOrder: 1 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Topping Mì Cay', { defaultStation: ProductStation.BEP_NAU, sortOrder: 2 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Bánh Mì Chảo', { defaultStation: ProductStation.BEP_NAU, sortOrder: 3 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Topoki Phô Mai', { defaultStation: ProductStation.BEP_NAU, sortOrder: 4 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Lẩu Hàn Quốc', { defaultStation: ProductStation.BEP_NAU, sortOrder: 5 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Đồ Gọi Thêm Lẩu', { defaultStation: ProductStation.BEP_NAU, sortOrder: 6 }),

  // 2. BEP_CHIEN (6 danh mục — gồm Combo Gà Rán chế biến trực tiếp tại Bếp Chiên)
  masterData(MdmCategory.MENU_CATEGORY, 'Gà Rán - Gà Tươi', { defaultStation: ProductStation.BEP_CHIEN, sortOrder: 7 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Combo Gà Rán', { defaultStation: ProductStation.BEP_CHIEN, sortOrder: 8 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Đồ Ăn Vặt', { defaultStation: ProductStation.BEP_CHIEN, sortOrder: 9 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Pizza', { defaultStation: ProductStation.BEP_CHIEN, sortOrder: 10 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Nem', { defaultStation: ProductStation.BEP_CHIEN, sortOrder: 11 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Cơm', { defaultStation: ProductStation.BEP_CHIEN, sortOrder: 12 }),

  // 3. PHA_CHE (13 danh mục)
  masterData(MdmCategory.MENU_CATEGORY, 'Trà Hoa Quả Tươi', { defaultStation: ProductStation.PHA_CHE, sortOrder: 13 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Trà Trái Cây', { defaultStation: ProductStation.PHA_CHE, sortOrder: 14 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Trà Sữa', { defaultStation: ProductStation.PHA_CHE, sortOrder: 15 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Coffee', { defaultStation: ProductStation.PHA_CHE, sortOrder: 16 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Sinh Tố', { defaultStation: ProductStation.PHA_CHE, sortOrder: 17 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Nước Ép Hoa Quả', { defaultStation: ProductStation.PHA_CHE, sortOrder: 18 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Đá Xay', { defaultStation: ProductStation.PHA_CHE, sortOrder: 19 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Sữa Chua', { defaultStation: ProductStation.PHA_CHE, sortOrder: 20 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Sữa Tươi', { defaultStation: ProductStation.PHA_CHE, sortOrder: 21 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Đồ Uống Nóng', { defaultStation: ProductStation.PHA_CHE, sortOrder: 22 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Soda Ý', { defaultStation: ProductStation.PHA_CHE, sortOrder: 23 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Nước Ngọt - Bia - Rượu', { defaultStation: ProductStation.PHA_CHE, sortOrder: 24 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Đồ Ăn Vặt (Quầy Nước)', { defaultStation: ProductStation.PHA_CHE, sortOrder: 25 }),
];

export const tableNames = Array.from({ length: 30 }, (_, index) => `Bàn ${String(index + 1).padStart(2, '0')}`);

// ==========================================
// 3. DANH SÁCH TOÀN BỘ 164 MÓN ĂN CHUẨN
// ==========================================

const rawProductSeed: Omit<ProductSeed, 'sortOrder'>[] = [
  // ------------------------------------------------
  // I. MỲ CAY KIM CHI HÀN QUỐC (BEP_NAU — 7 món)
  // ------------------------------------------------
  {
    name: 'Mì Xúc Xích',
    categoryName: 'Mỳ Cay Kim Chi Hàn Quốc',
    price: '40000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: standardNoodleModifierGroups,
  },
  {
    name: 'Mì Sườn Sụn',
    categoryName: 'Mỳ Cay Kim Chi Hàn Quốc',
    price: '45000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: standardNoodleModifierGroups,
  },
  {
    name: 'Mì Bò Mỹ',
    categoryName: 'Mỳ Cay Kim Chi Hàn Quốc',
    price: '45000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: standardNoodleModifierGroups,
  },
  {
    name: 'Mì Hải Sản',
    categoryName: 'Mỳ Cay Kim Chi Hàn Quốc',
    price: '45000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: createMultiMainNoodleModifierGroups(seafoodMainIngredients),
  },
  {
    name: 'Mì Mực',
    categoryName: 'Mỳ Cay Kim Chi Hàn Quốc',
    price: '45000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: createMultiMainNoodleModifierGroups(squidMainIngredients),
  },
  {
    name: 'Mì Bò Tươi',
    categoryName: 'Mỳ Cay Kim Chi Hàn Quốc',
    price: '45000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: standardNoodleModifierGroups,
  },
  {
    name: 'Mì Thập Cẩm',
    categoryName: 'Mỳ Cay Kim Chi Hàn Quốc',
    price: '50000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: createMultiMainNoodleModifierGroups(mixedMainIngredients),
  },

  // ------------------------------------------------
  // II. TOPPING MÌ CAY (BEP_NAU — 10 món)
  // ------------------------------------------------
  { name: 'Topping Xúc Xích', categoryName: 'Topping Mì Cay', price: '5000.00', station: ProductStation.BEP_NAU, comboItems: [] },
  { name: 'Topping Tôm Viên', categoryName: 'Topping Mì Cay', price: '5000.00', station: ProductStation.BEP_NAU, comboItems: [] },
  { name: 'Topping Đậu Hũ', categoryName: 'Topping Mì Cay', price: '5000.00', station: ProductStation.BEP_NAU, comboItems: [] },
  { name: 'Topping Ngao', categoryName: 'Topping Mì Cay', price: '5000.00', station: ProductStation.BEP_NAU, comboItems: [] },
  { name: 'Topping Kim Chi', categoryName: 'Topping Mì Cay', price: '5000.00', station: ProductStation.BEP_NAU, comboItems: [] },
  { name: 'Topping Nấm Kim Châm', categoryName: 'Topping Mì Cay', price: '5000.00', station: ProductStation.BEP_NAU, comboItems: [] },
  { name: 'Topping Bò Mỹ', categoryName: 'Topping Mì Cay', price: '10000.00', station: ProductStation.BEP_NAU, comboItems: [] },
  { name: 'Topping Sườn Sụn', categoryName: 'Topping Mì Cay', price: '10000.00', station: ProductStation.BEP_NAU, comboItems: [] },
  { name: 'Topping Tôm', categoryName: 'Topping Mì Cay', price: '10000.00', station: ProductStation.BEP_NAU, comboItems: [] },
  { name: 'Topping Mực', categoryName: 'Topping Mì Cay', price: '10000.00', station: ProductStation.BEP_NAU, comboItems: [] },

  // ------------------------------------------------
  // III. BÁNH MÌ CHẢO & ĐỒ GỌI THÊM (BEP_NAU — 6 món)
  // ------------------------------------------------
  {
    name: 'Bánh Mì Chảo Truyền Thống',
    categoryName: 'Bánh Mì Chảo',
    price: '40000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: banhMiChaoModifierGroups,
  },
  {
    name: 'Bánh Mì Chảo Bò Tiêu',
    categoryName: 'Bánh Mì Chảo',
    price: '45000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: banhMiChaoModifierGroups,
  },
  { name: 'Bánh Mì Thêm', categoryName: 'Bánh Mì Chảo', price: '5000.00', station: ProductStation.BEP_NAU, comboItems: [] },
  { name: 'Xúc Xích Thêm (Bánh Mì Chảo)', categoryName: 'Bánh Mì Chảo', price: '10000.00', station: ProductStation.BEP_NAU, comboItems: [] },
  { name: 'Pate Thêm', categoryName: 'Bánh Mì Chảo', price: '10000.00', station: ProductStation.BEP_NAU, comboItems: [] },
  { name: 'Thịt Bò Thêm (Bánh Mì Chảo)', categoryName: 'Bánh Mì Chảo', price: '20000.00', station: ProductStation.BEP_NAU, comboItems: [] },

  // ------------------------------------------------
  // IV. TOPOKI PHÔ MAI (BEP_NAU — 1 món)
  // ------------------------------------------------
  {
    name: 'Topoki Phô Mai',
    categoryName: 'Topoki Phô Mai',
    price: '40000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: topokiModifierGroups,
  },

  // ------------------------------------------------
  // V. LẨU HÀN QUỐC (BEP_NAU — 6 món)
  // ------------------------------------------------
  {
    name: 'Lẩu Thái',
    categoryName: 'Lẩu Hàn Quốc',
    price: '250000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: createHotpotModifierGroups([
      { name: 'Cỡ Nhỏ (250k)', extraPrice: '0.00', isDefaultChecked: true },
      { name: 'Cỡ Vừa (300k)', extraPrice: '50000.00' },
      { name: 'Cỡ Lớn (350k)', extraPrice: '100000.00' },
    ]),
  },
  {
    name: 'Lẩu Bò Nấm',
    categoryName: 'Lẩu Hàn Quốc',
    price: '250000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: createHotpotModifierGroups([
      { name: 'Cỡ Nhỏ (250k)', extraPrice: '0.00', isDefaultChecked: true },
      { name: 'Cỡ Vừa (300k)', extraPrice: '50000.00' },
      { name: 'Cỡ Lớn (350k)', extraPrice: '100000.00' },
    ]),
  },
  {
    name: 'Lẩu Hải Sản',
    categoryName: 'Lẩu Hàn Quốc',
    price: '400000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: createHotpotModifierGroups([
      { name: 'Cỡ Tiêu Chuẩn (400k)', extraPrice: '0.00', isDefaultChecked: true },
      { name: 'Cỡ Lớn (450k)', extraPrice: '50000.00' },
    ]),
  },
  {
    name: 'Lẩu Thập Cẩm',
    categoryName: 'Lẩu Hàn Quốc',
    price: '450000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: createHotpotModifierGroups([
      { name: 'Cỡ Tiêu Chuẩn (450k)', extraPrice: '0.00', isDefaultChecked: true },
      { name: 'Cỡ Lớn (500k)', extraPrice: '50000.00' },
    ]),
  },
  {
    name: 'Lẩu Gà (Đặt Trước)',
    categoryName: 'Lẩu Hàn Quốc',
    price: '300000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: createHotpotModifierGroups([
      { name: 'Cỡ Nhỏ (300k)', extraPrice: '0.00', isDefaultChecked: true },
      { name: 'Cỡ Vừa (350k)', extraPrice: '50000.00' },
      { name: 'Cỡ Lớn (400k)', extraPrice: '100000.00' },
    ]),
  },
  {
    name: 'Lẩu Topoki',
    categoryName: 'Lẩu Hàn Quốc',
    price: '200000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: createHotpotModifierGroups(),
  },

  // ------------------------------------------------
  // VI. ĐỒ GỌI THÊM LẨU (BEP_NAU — 5 món)
  // ------------------------------------------------
  { name: 'Rau / Đậu (Lẩu)', categoryName: 'Đồ Gọi Thêm Lẩu', price: '10000.00', station: ProductStation.BEP_NAU, comboItems: [] },
  { name: 'Kim Chi / Nấm (Lẩu)', categoryName: 'Đồ Gọi Thêm Lẩu', price: '20000.00', station: ProductStation.BEP_NAU, comboItems: [] },
  { name: 'Xúc Xích / Viên Lẩu', categoryName: 'Đồ Gọi Thêm Lẩu', price: '30000.00', station: ProductStation.BEP_NAU, comboItems: [] },
  { name: 'Sườn Sụn / Bò Mỹ (Lẩu)', categoryName: 'Đồ Gọi Thêm Lẩu', price: '50000.00', station: ProductStation.BEP_NAU, comboItems: [] },
  { name: 'Tôm / Mực / Bò Tươi (Lẩu)', categoryName: 'Đồ Gọi Thêm Lẩu', price: '80000.00', station: ProductStation.BEP_NAU, comboItems: [] },

  // ------------------------------------------------
  // VII. GÀ RÁN - GÀ TƯƠI (BEP_CHIEN — 6 món)
  // ------------------------------------------------
  { name: 'Đùi Gà KFC', categoryName: 'Gà Rán - Gà Tươi', price: '30000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Đùi Sốt Hàn', categoryName: 'Gà Rán - Gà Tươi', price: '35000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Cánh Gà KFC', categoryName: 'Gà Rán - Gà Tươi', price: '30000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Cánh Sốt Hàn', categoryName: 'Gà Rán - Gà Tươi', price: '35000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Miếng Gà KFC', categoryName: 'Gà Rán - Gà Tươi', price: '25000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Miếng Sốt Hàn', categoryName: 'Gà Rán - Gà Tươi', price: '30000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },

  // ------------------------------------------------
  // VII-B. COMBO GÀ RÁN (BEP_CHIEN — 4 món, không cấu hình thành phần)
  // ------------------------------------------------
  {
    name: 'Combo Gà KFC + Gà Sốt',
    categoryName: 'Combo Gà Rán',
    price: '80000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Combo Gà KFC + Gà Sốt Lớn',
    categoryName: 'Combo Gà Rán',
    price: '120000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Combo Gà + Khoai Tây',
    categoryName: 'Combo Gà Rán',
    price: '99000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Combo 50k (Gà + Kimpap + Khoai Tây)',
    categoryName: 'Combo Gà Rán',
    price: '50000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },

  // ------------------------------------------------
  // VIII. ĐỒ ĂN VẶT BẾP CHIÊN (BEP_CHIEN — 12 món)
  // ------------------------------------------------
  { name: 'Xúc Xích Chiên', categoryName: 'Đồ Ăn Vặt', price: '10000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Lạp Sườn HK', categoryName: 'Đồ Ăn Vặt', price: '15000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Khoai Tây Lắc Phô Mai', categoryName: 'Đồ Ăn Vặt', price: '30000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Kimpap Chiên', categoryName: 'Đồ Ăn Vặt', price: '35000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Khoai Lang Kén', categoryName: 'Đồ Ăn Vặt', price: '30000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Khoai Môn Lệ Phố Nhỏ', categoryName: 'Đồ Ăn Vặt', price: '30000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Khoai Môn Lệ Phố Lớn', categoryName: 'Đồ Ăn Vặt', price: '50000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Phô Mai Que (5c)', categoryName: 'Đồ Ăn Vặt', price: '30000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Bánh Mì Que (10c)', categoryName: 'Đồ Ăn Vặt', price: '35000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Chân Gà Sốt Thái', categoryName: 'Đồ Ăn Vặt', price: '50000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Mẹt Ăn Vặt 7 Món', categoryName: 'Đồ Ăn Vặt', price: '70000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Cá Viên Chiên', categoryName: 'Đồ Ăn Vặt', price: '25000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },

  // ------------------------------------------------
  // IX. PIZZA (BEP_CHIEN — 4 món)
  // ------------------------------------------------
  {
    name: 'Pizza Thập Cẩm Size S',
    categoryName: 'Pizza',
    price: '50000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
    modifierGroups: pizzaModifierGroups,
  },
  {
    name: 'Pizza Thập Cẩm Size M',
    categoryName: 'Pizza',
    price: '80000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
    modifierGroups: pizzaModifierGroups,
  },
  { name: 'Thêm Phô Mai Pizza (10k)', categoryName: 'Pizza', price: '10000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Thêm Phô Mai Pizza (20k)', categoryName: 'Pizza', price: '20000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },

  // ------------------------------------------------
  // X. NEM & XI. CƠM (BEP_CHIEN — 4 món)
  // ------------------------------------------------
  { name: 'Nem Nướng Nha Trang', categoryName: 'Nem', price: '35000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Nem Chua Rán Nhỏ (6c)', categoryName: 'Nem', price: '35000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Nem Chua Rán Lớn (10c)', categoryName: 'Nem', price: '50000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },
  { name: 'Cơm Gà Sốt', categoryName: 'Cơm', price: '45000.00', station: ProductStation.BEP_CHIEN, comboItems: [] },

  // ------------------------------------------------
  // XII. TRÀ HOA QUẢ TƯƠI (PHA_CHE — 9 món)
  // ------------------------------------------------
  { name: 'Trà Mãng Cầu', categoryName: 'Trà Hoa Quả Tươi', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Hoa Quả Tươi', categoryName: 'Trà Hoa Quả Tươi', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Dâu Tây', categoryName: 'Trà Hoa Quả Tươi', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Dứa Mật', categoryName: 'Trà Hoa Quả Tươi', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Dưa Lưới', categoryName: 'Trà Hoa Quả Tươi', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Mít Thái', categoryName: 'Trà Hoa Quả Tươi', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Xoài Chanh Dây', categoryName: 'Trà Hoa Quả Tươi', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Cam Xoài', categoryName: 'Trà Hoa Quả Tươi', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Sen Lá Nếp', categoryName: 'Trà Hoa Quả Tươi', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },

  // ------------------------------------------------
  // XIII. TRÀ TRÁI CÂY (PHA_CHE — 20 món)
  // ------------------------------------------------
  { name: 'Trà Đào', categoryName: 'Trà Trái Cây', price: '25000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Đào Cam Sả', categoryName: 'Trà Trái Cây', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Đào Kem Cheese', categoryName: 'Trà Trái Cây', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Đào Trân Châu Trắng', categoryName: 'Trà Trái Cây', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Xoài Nha Đam', categoryName: 'Trà Trái Cây', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Xoài Sữa Chua', categoryName: 'Trà Trái Cây', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Vải Nha Đam', categoryName: 'Trà Trái Cây', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Vải Sữa Chua', categoryName: 'Trà Trái Cây', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Chanh Leo Nha Đam', categoryName: 'Trà Trái Cây', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Dứa Chanh Leo', categoryName: 'Trà Trái Cây', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Dâu Sữa Chua', categoryName: 'Trà Trái Cây', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Sen Vàng Macchiato', categoryName: 'Trà Trái Cây', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Hoa Quả Nhiệt Đới', categoryName: 'Trà Trái Cây', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Chanh / Quất', categoryName: 'Trà Trái Cây', price: '10000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Chanh / Quất Nha Đam', categoryName: 'Trà Trái Cây', price: '15000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Quất Lắc Sữa', categoryName: 'Trà Trái Cây', price: '20000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Chanh Dưa Lưới', categoryName: 'Trà Trái Cây', price: '20000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Sen Xanh', categoryName: 'Trà Trái Cây', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Sen Sữa Dừa', categoryName: 'Trà Trái Cây', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Sen Nhài Matcha', categoryName: 'Trà Trái Cây', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },

  // ------------------------------------------------
  // XIV. TRÀ SỮA (PHA_CHE — 16 món)
  // ------------------------------------------------
  { name: 'Hồng Trà Sữa Trân Châu', categoryName: 'Trà Sữa', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Sữa Dâu', categoryName: 'Trà Sữa', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Sữa Socola', categoryName: 'Trà Sữa', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Sữa Café', categoryName: 'Trà Sữa', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Sữa CaCao', categoryName: 'Trà Sữa', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Sữa Việt Quất', categoryName: 'Trà Sữa', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Sữa Khoai Môn', categoryName: 'Trà Sữa', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Sữa Bạc Hà', categoryName: 'Trà Sữa', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Sữa Matcha', categoryName: 'Trà Sữa', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Sữa Dưa Lưới', categoryName: 'Trà Sữa', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Sữa Xoài', categoryName: 'Trà Sữa', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Sữa Trân Châu Đường Đen', categoryName: 'Trà Sữa', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Sữa Kem Trứng Dừa Nướng', categoryName: 'Trà Sữa', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Sữa Kem Trứng Orion', categoryName: 'Trà Sữa', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Trà Sữa Kem Trứng Matcha', categoryName: 'Trà Sữa', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Sữa Gạo Rang Hàn Quốc', categoryName: 'Trà Sữa', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },

  // ------------------------------------------------
  // XV. COFFEE (PHA_CHE — 6 món)
  // ------------------------------------------------
  { name: 'Coffee Nâu', categoryName: 'Coffee', price: '20000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Coffee Đen', categoryName: 'Coffee', price: '20000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Bạc Xỉu', categoryName: 'Coffee', price: '25000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Coffee Kem Trứng Nướng', categoryName: 'Coffee', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Coffee Cốt Dừa Đá Xay', categoryName: 'Coffee', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: blendedColdDrinkModifierGroups },
  { name: 'Bạc Xỉu Trân Châu Đường Đen', categoryName: 'Coffee', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },

  // ------------------------------------------------
  // XVI. SINH TỐ (PHA_CHE — 8 món)
  // ------------------------------------------------
  { name: 'Bơ Già Dừa Non', categoryName: 'Sinh Tố', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: blendedColdDrinkModifierGroups },
  { name: 'Sinh Tố Bơ', categoryName: 'Sinh Tố', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: blendedColdDrinkModifierGroups },
  { name: 'Sinh Tố Xoài', categoryName: 'Sinh Tố', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: blendedColdDrinkModifierGroups },
  { name: 'Sinh Tố Việt Quất', categoryName: 'Sinh Tố', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: blendedColdDrinkModifierGroups },
  { name: 'Sinh Tố Dâu', categoryName: 'Sinh Tố', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: blendedColdDrinkModifierGroups },
  { name: 'Sinh Tố Hoa Quả', categoryName: 'Sinh Tố', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: blendedColdDrinkModifierGroups },
  { name: 'Sinh Tố Bơ Xoài', categoryName: 'Sinh Tố', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: blendedColdDrinkModifierGroups },
  { name: 'Sinh Tố Mãng Cầu', categoryName: 'Sinh Tố', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: blendedColdDrinkModifierGroups },

  // ------------------------------------------------
  // XVII. NƯỚC ÉP HOA QUẢ (PHA_CHE — 4 món)
  // ------------------------------------------------
  { name: 'Ép Cam', categoryName: 'Nước Ép Hoa Quả', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: juiceDrinkModifierGroups },
  { name: 'Ép Dưa Hấu', categoryName: 'Nước Ép Hoa Quả', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: juiceDrinkModifierGroups },
  { name: 'Ép Táo', categoryName: 'Nước Ép Hoa Quả', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: juiceDrinkModifierGroups },
  { name: 'Ép Dứa', categoryName: 'Nước Ép Hoa Quả', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: juiceDrinkModifierGroups },

  // ------------------------------------------------
  // XVIII. ĐÁ XAY (PHA_CHE — 6 món)
  // ------------------------------------------------
  { name: 'Matcha Trà Xanh Đá Xay', categoryName: 'Đá Xay', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: blendedColdDrinkModifierGroups },
  { name: 'Đá Xay Bạc Hà', categoryName: 'Đá Xay', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: blendedColdDrinkModifierGroups },
  { name: 'Đá Xay Việt Quất', categoryName: 'Đá Xay', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: blendedColdDrinkModifierGroups },
  { name: 'Đá Xay Dâu', categoryName: 'Đá Xay', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: blendedColdDrinkModifierGroups },
  { name: 'Chanh Tuyết', categoryName: 'Đá Xay', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: blendedColdDrinkModifierGroups },
  { name: 'Xoài Kem Cốt Dừa', categoryName: 'Đá Xay', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: blendedColdDrinkModifierGroups },

  // ------------------------------------------------
  // XIX. SỮA CHUA (PHA_CHE — 7 món)
  // ------------------------------------------------
  { name: 'Sữa Chua Hoa Quả', categoryName: 'Sữa Chua', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: yogurtDrinkModifierGroups },
  { name: 'Sữa Chua Yến Mạch', categoryName: 'Sữa Chua', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: yogurtDrinkModifierGroups },
  { name: 'Sữa Chua Trân Châu', categoryName: 'Sữa Chua', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: yogurtDrinkModifierGroups },
  { name: 'Sữa Chua Xoài', categoryName: 'Sữa Chua', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: yogurtDrinkModifierGroups },
  { name: 'Sữa Chua Đánh Đá', categoryName: 'Sữa Chua', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: yogurtDrinkModifierGroups },
  { name: 'Sữa Chua Việt Quất', categoryName: 'Sữa Chua', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: yogurtDrinkModifierGroups },
  { name: 'Sữa Chua Dâu', categoryName: 'Sữa Chua', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: yogurtDrinkModifierGroups },

  // ------------------------------------------------
  // XX. SỮA TƯƠI (PHA_CHE — 6 món)
  // ------------------------------------------------
  { name: 'Sữa Tươi Trân Châu Đường Đen', categoryName: 'Sữa Tươi', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Sữa Tươi Xoài Milk Foam', categoryName: 'Sữa Tươi', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Sữa Tươi Đào Milk Foam', categoryName: 'Sữa Tươi', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Sữa Tươi Dâu Milk Foam', categoryName: 'Sữa Tươi', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Sữa Tươi Matcha Milk Foam', categoryName: 'Sữa Tươi', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },
  { name: 'Matcha Latte', categoryName: 'Sữa Tươi', price: '35000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: standardColdDrinkModifierGroups },

  // ------------------------------------------------
  // XXI. ĐỒ UỐNG NÓNG (PHA_CHE — 2 món)
  // ------------------------------------------------
  { name: 'Trà Gừng Mật Ong', categoryName: 'Đồ Uống Nóng', price: '25000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: hotDrinkModifierGroups },
  { name: 'Matcha Latte Nóng', categoryName: 'Đồ Uống Nóng', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: hotDrinkModifierGroups },

  // ------------------------------------------------
  // XXII. SODA Ý (PHA_CHE — 3 món)
  // ------------------------------------------------
  { name: 'Soda Bạc Hà', categoryName: 'Soda Ý', price: '25000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: sodaDrinkModifierGroups },
  { name: 'Soda Dâu', categoryName: 'Soda Ý', price: '25000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: sodaDrinkModifierGroups },
  { name: 'Soda Việt Quất (Blueberry)', categoryName: 'Soda Ý', price: '25000.00', station: ProductStation.PHA_CHE, comboItems: [], modifierGroups: sodaDrinkModifierGroups },

  // ------------------------------------------------
  // XXIII. NƯỚC NGỌT - BIA - RƯỢU (PHA_CHE — 8 món)
  // ------------------------------------------------
  { name: 'Coca', categoryName: 'Nước Ngọt - Bia - Rượu', price: '15000.00', station: ProductStation.PHA_CHE, comboItems: [] },
  { name: 'Nước Cam', categoryName: 'Nước Ngọt - Bia - Rượu', price: '15000.00', station: ProductStation.PHA_CHE, comboItems: [] },
  { name: 'Nước Lọc', categoryName: 'Nước Ngọt - Bia - Rượu', price: '10000.00', station: ProductStation.PHA_CHE, comboItems: [] },
  { name: 'Bia Hà Nội', categoryName: 'Nước Ngọt - Bia - Rượu', price: '15000.00', station: ProductStation.PHA_CHE, comboItems: [] },
  { name: 'Bia Sài Gòn', categoryName: 'Nước Ngọt - Bia - Rượu', price: '15000.00', station: ProductStation.PHA_CHE, comboItems: [] },
  { name: 'Bia Tiger', categoryName: 'Nước Ngọt - Bia - Rượu', price: '20000.00', station: ProductStation.PHA_CHE, comboItems: [] },
  { name: 'Rượu Nếp', categoryName: 'Nước Ngọt - Bia - Rượu', price: '30000.00', station: ProductStation.PHA_CHE, comboItems: [] },
  { name: 'Rượu Soju', categoryName: 'Nước Ngọt - Bia - Rượu', price: '80000.00', station: ProductStation.PHA_CHE, comboItems: [] },

  // ------------------------------------------------
  // XXIV. ĐỒ ĂN VẶT QUẦY NƯỚC (PHA_CHE — 4 món)
  // ------------------------------------------------
  { name: 'Xoài Dầm', categoryName: 'Đồ Ăn Vặt (Quầy Nước)', price: '25000.00', station: ProductStation.PHA_CHE, comboItems: [] },
  { name: 'Hướng Dương', categoryName: 'Đồ Ăn Vặt (Quầy Nước)', price: '15000.00', station: ProductStation.PHA_CHE, comboItems: [] },
  { name: 'Bò Khô Vắt Chanh', categoryName: 'Đồ Ăn Vặt (Quầy Nước)', price: '25000.00', station: ProductStation.PHA_CHE, comboItems: [] },
  { name: 'Gà Khô Lá Chanh', categoryName: 'Đồ Ăn Vặt (Quầy Nước)', price: '25000.00', station: ProductStation.PHA_CHE, comboItems: [] },
];

export const productSeed: ProductSeed[] = rawProductSeed.map((item, idx) => ({
  ...item,
  sortOrder: idx + 1,
}));

export const defaultPaymentAccountsSeed = [
  {
    label: 'TK Chính (BIDV)',
    bankCode: 'BIDV',
    accountNo: '8878564012',
    accountName: 'TRAN VAN HUNG',
    priority: 1,
    isActive: true,
  },
  {
    label: 'TK Phụ (Vietcombank)',
    bankCode: 'VCB',
    accountNo: '0351000647045',
    accountName: 'TRAN VAN HUNG',
    priority: 2,
    isActive: true,
  },
] as const;

export const defaultStoreSettingsSeed = {
  category: 'SYSTEM_CONFIG',
  name: 'Cấu hình Cửa hàng & Thương hiệu',
  normalizedName: 'store_settings',
  settings: DEFAULT_STORE_SETTINGS,
} as const;

export const defaultQrSecurityConfigSeed = {
  category: 'SYSTEM_CONFIG',
  name: 'Cấu hình Bảo mật Quét QR',
  normalizedName: 'qr_security_config',
  config: {
    wifiProtectionEnabled: false,
    autoSyncPosIp: true,
    allowedWifiIps: [] as string[],
    wifiSsid: 'An Vat Tran',
    wifiPassword: 'chucngonmieng',
    geoProtectionEnabled: false,
    shopLatitude: null as number | null,
    shopLongitude: null as number | null,
    geoRadiusMeters: 200,
  },
} as const;

export const defaultOpeningBudgetSeed = {
  category: MdmCategory.UNIT,
  name: 'Internal Cashflow Default Budget',
  normalizedName: '__internal_cashflow_default_opening_budget__',
  openingBudget: '2000000.00',
} as const;

export const adminPermissions: UserPermissions = UserPermissionsSchema.parse({
  dashboard: { view: true, viewProfit: true, export: true },
  pos: { view: true, create: true, update: true, delete: true, deleteDrafts: true, splitKitchen: true, tableAction: true, checkout: true, qrSecurity: true, manualDiscount: true, openCashDrawer: true },
  menu: { view: true, create: true, update: true, delete: true, manageStations: true, manageCategories: true, import: true, export: true },
  invoices: { view: true, reprint: true, update: true, approve: true, void: false, export: true },
  inventory: { view: true, create: true, update: true, delete: true, export: true },
  cashflow: { view: true, create: true, compensate: true, config: true, export: true },
  paymentQr: { view: true, create: true, update: true, delete: true },
  discounts: { view: true, create: true, update: true, delete: true },
  employees: { view: true, create: true, update: true, delete: true, export: true },
  schedules: { view: true, create: true, update: true, delete: true, export: true },
  payroll: { view: true, update: true, config: true, export: true },
  mdm: { view: true, create: true, update: true, delete: true },
  rbac: { view: true, create: false, update: false, resetPassword: false },
  settings: { view: true, update: true },
});

export const cashierPermissions: UserPermissions = UserPermissionsSchema.parse({
  dashboard: { view: true, viewProfit: false, export: false },
  pos: { view: true, create: true, update: true, delete: false, deleteDrafts: true, splitKitchen: true, tableAction: true, checkout: true, qrSecurity: false, manualDiscount: false, openCashDrawer: false },
  menu: { view: true, create: false, update: true, delete: false, manageStations: false, manageCategories: false, import: false, export: false },
  invoices: { view: true, reprint: true, update: true, approve: false, void: false, export: false },
  inventory: { view: true, create: true, update: false, delete: true, export: false },
  cashflow: { view: true, create: true, compensate: true, config: false, export: false },
  employees: { view: false, create: false, update: false, delete: false, export: false },
  schedules: { view: true, create: false, update: false, delete: false, export: false },
  mdm: { view: false, create: false, update: false, delete: false },
  rbac: { view: false, create: false, update: false, resetPassword: false },
});

export const adminViewPermissions: UserPermissions = UserPermissionsSchema.parse({
  ...structuredClone(defaultUserPermissions),
  dashboard: { ...defaultUserPermissions.dashboard, view: true, viewProfit: true, export: true },
  pos: { ...defaultUserPermissions.pos, view: true },
  menu: { ...defaultUserPermissions.menu, view: true, export: true },
  invoices: { ...defaultUserPermissions.invoices, view: true, export: true },
  inventory: { ...defaultUserPermissions.inventory, view: true, export: true },
  cashflow: { ...defaultUserPermissions.cashflow, view: true, export: true },
  paymentQr: { ...defaultUserPermissions.paymentQr, view: true },
  discounts: { ...defaultUserPermissions.discounts, view: true },
  employees: { ...defaultUserPermissions.employees, view: true, export: true },
  schedules: { ...defaultUserPermissions.schedules, view: true, export: true },
  payroll: { ...defaultUserPermissions.payroll, view: true, export: true },
  mdm: { ...defaultUserPermissions.mdm, view: true },
  rbac: { ...defaultUserPermissions.rbac, view: true },
  settings: { ...defaultUserPermissions.settings, view: true },
});

export const seedEmployees: readonly SeedEmployeeDef[] = [
  // 4 tài khoản quản trị & thu ngân (liên kết 1-1)
  {
    fullName: 'Nguyễn Minh Quân',
    shortName: 'M.Quân',
    position: 'Chủ Cửa Hàng',
    specialty: 'Quản Lý',
    phone: '0901000001',
    note: 'Chủ cửa hàng — tài khoản Super Admin toàn quyền',
    account: { username: 'superadmin', isSuperAdmin: true, roleKey: 'SUPERADMIN' },
  },
  {
    fullName: 'Phạm Minh Tuấn',
    shortName: 'M.Tuấn',
    position: 'Quản Lý Cửa Hàng',
    specialty: 'Quản Lý',
    phone: '0901000002',
    note: 'Quản lý vận hành — toàn quyền nghiệp vụ',
    account: { username: 'admin', isSuperAdmin: false, roleKey: 'ADMIN' },
  },
  {
    fullName: 'Lê Thị Hương',
    shortName: 'T.Hương',
    position: 'Quản Lý Cửa Hàng',
    specialty: 'Quản Lý',
    phone: '0901000004',
    note: 'Quản lý kiểm toán — chỉ xem & xuất báo cáo',
    account: { username: 'adminview', isSuperAdmin: false, roleKey: 'ADMIN_VIEW' },
  },
  {
    fullName: 'Trần Thị Lan',
    shortName: 'T.Lan',
    position: 'Thu Ngân Quầy',
    specialty: 'Thu Ngân',
    phone: '0901000003',
    note: 'Thu ngân quầy POS chính',
    account: { username: 'thungan', isSuperAdmin: false, roleKey: 'CASHIER' },
  },

  // 8 nhân viên vận hành theo 4 khu vực (2 người / khu vực)
  {
    fullName: 'Nguyễn Văn Hùng',
    shortName: 'V.Hùng',
    position: 'Bếp Trưởng Mì Cay',
    specialty: 'Bếp Nấu (Mì Cay)',
    phone: '0902000001',
    note: 'Tổ Bếp Nấu (Ca chính)',
  },
  {
    fullName: 'Đỗ Thị Mai',
    shortName: 'T.Mai',
    position: 'Nhân Viên Bếp Nấu',
    specialty: 'Bếp Nấu (Mì Cay)',
    phone: '0902000002',
    note: 'Tổ Bếp Nấu (Phụ bếp & lẩu)',
  },
  {
    fullName: 'Hoàng Văn Nam',
    shortName: 'V.Nam',
    position: 'Nhân Viên Đứng Bếp Chiên',
    specialty: 'Bếp Chiên (Đồ Ăn Vặt)',
    phone: '0902000003',
    note: 'Tổ Bếp Chiên (Gà rán & pizza)',
  },
  {
    fullName: 'Bùi Minh Đức',
    shortName: 'M.Đức',
    position: 'Nhân Viên Đứng Bếp Chiên',
    specialty: 'Bếp Chiên (Đồ Ăn Vặt)',
    phone: '0902000004',
    note: 'Tổ Bếp Chiên (Đồ ăn vặt, nem & cơm)',
  },
  {
    fullName: 'Vũ Thị Ngọc',
    shortName: 'T.Ngọc',
    position: 'Nhân Viên Pha Chế',
    specialty: 'Pha Chế (Nước Uống)',
    phone: '0902000005',
    note: 'Quầy Nước (Trà trái cây & trà sữa)',
  },
  {
    fullName: 'Đặng Thu Hà',
    shortName: 'T.Hà',
    position: 'Nhân Viên Pha Chế',
    specialty: 'Pha Chế (Nước Uống)',
    phone: '0902000006',
    note: 'Quầy Nước (Sinh tố, nước ép & đá xay)',
  },
  {
    fullName: 'Phan Quốc Khánh',
    shortName: 'Q.Khánh',
    position: 'Nhân Viên Phục Vụ',
    specialty: 'Phục Vụ Bàn',
    phone: '0902000007',
    note: 'Phục vụ bàn (Khu vực tầng 1)',
  },
  {
    fullName: 'Ngô Bảo Trâm',
    shortName: 'B.Trâm',
    position: 'Nhân Viên Phục Vụ',
    specialty: 'Phục Vụ Bàn',
    phone: '0902000008',
    note: 'Phục vụ bàn (Hỗ trợ ra món & dọn bàn)',
  },
];
