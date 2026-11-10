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

export type SeedModifierDef = {
  name: string;
  extraPrice: string;
  isDefaultChecked?: boolean;
  defaultSubstituteName?: string;
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

function masterData(category: MdmCategoryType, rawName: string, metadata: Record<string, unknown> = {}): MasterDataSeed {
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
  { name: 'Ngô', extraPrice: '0.00', isDefaultChecked: true },
  { name: 'Rau', extraPrice: '0.00', isDefaultChecked: true },
  { name: 'Nấm kim châm', extraPrice: '0.00', isDefaultChecked: true },
  { name: 'Kim chi', extraPrice: '0.00', isDefaultChecked: true },
];

export const seafoodMainIngredients: readonly SeedModifierDef[] = [
  { name: 'Tôm', extraPrice: '0.00', isDefaultChecked: true, defaultSubstituteName: 'Mực' },
  { name: 'Ngao', extraPrice: '0.00', isDefaultChecked: true, defaultSubstituteName: 'Mực' },
  { name: 'Mực', extraPrice: '0.00', isDefaultChecked: true, defaultSubstituteName: 'Tôm' },
];

export const noodleToppings: readonly SeedModifierDef[] = [
  { name: 'Xúc xích (5k/phần)', extraPrice: '5000.00' },
  { name: 'Tôm viên (5k/phần)', extraPrice: '5000.00' },
  { name: 'Đậu hũ (5k/phần)', extraPrice: '5000.00' },
  { name: 'Ngao (5k/phần)', extraPrice: '5000.00' },
  { name: 'Kimchi (5k/phần)', extraPrice: '5000.00' },
  { name: 'Nấm (5k/phần)', extraPrice: '5000.00' },
  { name: 'Tôm (10k/phần)', extraPrice: '10000.00' },
  { name: 'Mực (10k/phần)', extraPrice: '10000.00' },
  { name: 'Bò (10k/phần)', extraPrice: '10000.00' },
  { name: 'Sườn sụn (10k/phần)', extraPrice: '10000.00' },
];

export const banhMiChaoAddons: readonly SeedModifierDef[] = [
  { name: 'Thêm Bánh mì (5k/1c)', extraPrice: '5000.00' },
  { name: 'Thêm Xúc Xích (10k/1c)', extraPrice: '10000.00' },
  { name: 'Thêm Pate (10k)', extraPrice: '10000.00' },
  { name: 'Thêm Thịt Bò (20k)', extraPrice: '20000.00' },
];

export const pizzaCheeseModifiers: readonly SeedModifierDef[] = [
  { name: 'Thêm Phomai (10k)', extraPrice: '10000.00' },
  { name: 'Thêm Phomai Gấp Đôi (20k)', extraPrice: '20000.00' },
];

export const hotpotAddons: readonly SeedModifierDef[] = [
  { name: 'Rau/Đậu (10k/phần)', extraPrice: '10000.00' },
  { name: 'Kimchi/Nấm (20k/phần)', extraPrice: '20000.00' },
  { name: 'Xúc Xích/Viên Lẩu (30k/đĩa)', extraPrice: '30000.00' },
  { name: 'Sườn Sụn/Bò Mỹ (50k/đĩa)', extraPrice: '50000.00' },
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
    name: 'Topping Mì Cay',
    isRequired: false,
    maxSelect: 10,
    modifiers: noodleToppings,
  },
];

const seafoodNoodleModifierGroups: readonly SeedModifierGroupDef[] = [
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
    name: 'Đồ ăn chính của món',
    isRequired: false,
    maxSelect: 3,
    isAutoSelect: true,
    allowSubstitution: true,
    modifiers: seafoodMainIngredients,
  },
  {
    name: 'Topping Mì Cay',
    isRequired: false,
    maxSelect: 10,
    modifiers: noodleToppings,
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
    name: 'Tuỳ chọn Phomai',
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

// ==========================================
// 2. MASTER DATA SEED (CẤP 2: MENU_CATEGORY)
// ==========================================

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

  // Cấp 2 — Danh mục Thực đơn gắn với Cấp 1 (Khu vực Bếp)
  // 1. BEP_NAU
  masterData(MdmCategory.MENU_CATEGORY, 'Mỳ Cay Kim Chi Hàn Quốc', { defaultStation: ProductStation.BEP_NAU, sortOrder: 1 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Topping Mì Cay', { defaultStation: ProductStation.BEP_NAU, sortOrder: 2 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Bánh Mì Chảo', { defaultStation: ProductStation.BEP_NAU, sortOrder: 3 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Lẩu Hàn Quốc', { defaultStation: ProductStation.BEP_NAU, sortOrder: 4 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Đồ Gọi Thêm Lẩu', { defaultStation: ProductStation.BEP_NAU, sortOrder: 5 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Nem Nướng & Cơm Gà', { defaultStation: ProductStation.BEP_NAU, sortOrder: 6 }),

  // 2. BEP_CHIEN
  masterData(MdmCategory.MENU_CATEGORY, 'Gà Rán - Gà Tươi', { defaultStation: ProductStation.BEP_CHIEN, sortOrder: 7 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Đồ Ăn Vặt', { defaultStation: ProductStation.BEP_CHIEN, sortOrder: 8 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Pizza', { defaultStation: ProductStation.BEP_CHIEN, sortOrder: 9 }),

  // 3. COMBO
  masterData(MdmCategory.MENU_CATEGORY, 'Combo Gà Rán', { defaultStation: ProductStation.COMBO, sortOrder: 10 }),

  // 4. PHA_CHE
  masterData(MdmCategory.MENU_CATEGORY, 'Đồ Uống Xu Hướng', { defaultStation: ProductStation.PHA_CHE, sortOrder: 11 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Trà Hoa Quả Tươi', { defaultStation: ProductStation.PHA_CHE, sortOrder: 12 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Trà Trái Cây', { defaultStation: ProductStation.PHA_CHE, sortOrder: 13 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Trà Sữa', { defaultStation: ProductStation.PHA_CHE, sortOrder: 14 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Sinh Tố', { defaultStation: ProductStation.PHA_CHE, sortOrder: 15 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Nước Ép Hoa Quả', { defaultStation: ProductStation.PHA_CHE, sortOrder: 16 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Coffee', { defaultStation: ProductStation.PHA_CHE, sortOrder: 17 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Đá Xay', { defaultStation: ProductStation.PHA_CHE, sortOrder: 18 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Sữa Chua', { defaultStation: ProductStation.PHA_CHE, sortOrder: 19 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Sữa Tươi Milk Foam', { defaultStation: ProductStation.PHA_CHE, sortOrder: 20 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Đồ Uống Nóng', { defaultStation: ProductStation.PHA_CHE, sortOrder: 21 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Soda Ý', { defaultStation: ProductStation.PHA_CHE, sortOrder: 22 }),
  masterData(MdmCategory.MENU_CATEGORY, 'Nước Ngọt - Bia - Rượu', { defaultStation: ProductStation.PHA_CHE, sortOrder: 23 }),

  // Nguyên vật liệu kho
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

// ==========================================
// 3. DANH SÁCH TOÀN BỘ MÓN ĂN TRONG MENU MỚI (CẤP 3)
// ==========================================

const rawProductSeed: Omit<ProductSeed, 'sortOrder'>[] = [
  // ------------------------------------------------
  // I. MỲ CAY KIM CHI HÀN QUỐC (BEP_NAU)
  // ------------------------------------------------
  {
    name: 'Mì Xúc Xích',
    subtitle: 'Mỳ Cay Kim Chi Hàn Quốc — Cấp độ 0–7',
    categoryName: 'Mỳ Cay Kim Chi Hàn Quốc',
    price: '40000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: standardNoodleModifierGroups,
  },
  {
    name: 'Mì Sườn Sụn',
    subtitle: 'Mỳ Cay Kim Chi Hàn Quốc — Cấp độ 0–7',
    categoryName: 'Mỳ Cay Kim Chi Hàn Quốc',
    price: '45000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: standardNoodleModifierGroups,
  },
  {
    name: 'Mì Bò Mỹ',
    subtitle: 'Mỳ Cay Kim Chi Hàn Quốc — Cấp độ 0–7',
    categoryName: 'Mỳ Cay Kim Chi Hàn Quốc',
    price: '45000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: standardNoodleModifierGroups,
  },
  {
    name: 'Mì Hải Sản',
    subtitle: 'Ngao, tôm, mực — Mỳ Cay Kim Chi Hàn Quốc',
    categoryName: 'Mỳ Cay Kim Chi Hàn Quốc',
    price: '45000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: seafoodNoodleModifierGroups,
  },
  {
    name: 'Mì Mực',
    subtitle: 'Mỳ Cay Kim Chi Hàn Quốc — Cấp độ 0–7',
    categoryName: 'Mỳ Cay Kim Chi Hàn Quốc',
    price: '45000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: standardNoodleModifierGroups,
  },
  {
    name: 'Mì Bò Tươi',
    subtitle: 'Mỳ Cay Kim Chi Hàn Quốc — Cấp độ 0–7',
    categoryName: 'Mỳ Cay Kim Chi Hàn Quốc',
    price: '45000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: standardNoodleModifierGroups,
  },
  {
    name: 'Mì Thập Cẩm',
    subtitle: 'Đầy đủ topping — Mỳ Cay Kim Chi Hàn Quốc',
    categoryName: 'Mỳ Cay Kim Chi Hàn Quốc',
    price: '50000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: standardNoodleModifierGroups,
  },

  // ------------------------------------------------
  // II. TOPPING MÌ CAY (BEP_NAU)
  // ------------------------------------------------
  {
    name: 'Topping Xúc Xích',
    subtitle: '5k/phần (Xúc xích/Tôm viên/Đậu hũ)',
    categoryName: 'Topping Mì Cay',
    price: '5000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },
  {
    name: 'Topping Tôm Viên',
    subtitle: '5k/phần (Xúc xích/Tôm viên/Đậu hũ)',
    categoryName: 'Topping Mì Cay',
    price: '5000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },
  {
    name: 'Topping Đậu Hũ',
    subtitle: '5k/phần (Xúc xích/Tôm viên/Đậu hũ)',
    categoryName: 'Topping Mì Cay',
    price: '5000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },
  {
    name: 'Topping Ngao',
    subtitle: '5k/phần (Ngao/Kimchi/Nấm)',
    categoryName: 'Topping Mì Cay',
    price: '5000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },
  {
    name: 'Topping Kimchi',
    subtitle: '5k/phần (Ngao/Kimchi/Nấm)',
    categoryName: 'Topping Mì Cay',
    price: '5000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },
  {
    name: 'Topping Nấm',
    subtitle: '5k/phần (Ngao/Kimchi/Nấm)',
    categoryName: 'Topping Mì Cay',
    price: '5000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },
  {
    name: 'Topping Tôm',
    subtitle: '10k/phần (Tôm/Mực/Bò/Sườn sụn)',
    categoryName: 'Topping Mì Cay',
    price: '10000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },
  {
    name: 'Topping Mực',
    subtitle: '10k/phần (Tôm/Mực/Bò/Sườn sụn)',
    categoryName: 'Topping Mì Cay',
    price: '10000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },
  {
    name: 'Topping Bò',
    subtitle: '10k/phần (Tôm/Mực/Bò/Sườn sụn)',
    categoryName: 'Topping Mì Cay',
    price: '10000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },
  {
    name: 'Topping Sườn Sụn',
    subtitle: '10k/phần (Tôm/Mực/Bò/Sườn sụn)',
    categoryName: 'Topping Mì Cay',
    price: '10000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },

  // ------------------------------------------------
  // III. BÁNH MÌ CHẢO & ĐỒ GỌI THÊM (BEP_NAU)
  // ------------------------------------------------
  {
    name: 'Bánh Mì Chảo Truyền Thống',
    subtitle: 'Pate, xúc xích, khoai tây, trứng, sốt, 2 bánh mì đi kèm',
    categoryName: 'Bánh Mì Chảo',
    price: '40000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: banhMiChaoModifierGroups,
  },
  {
    name: 'Bánh Mì Chảo Bò Tiêu',
    subtitle: 'Pate, thịt bò, khoai tây, trứng, sốt, 2 bánh mì đi kèm',
    categoryName: 'Bánh Mì Chảo',
    price: '45000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: banhMiChaoModifierGroups,
  },
  {
    name: 'Bánh Mì Thêm',
    subtitle: '5k/1c — Đồ gọi thêm Bánh Mì Chảo',
    categoryName: 'Bánh Mì Chảo',
    price: '5000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },
  {
    name: 'Xúc Xích Thêm (Bánh Mì Chảo)',
    subtitle: '10k/1c — Đồ gọi thêm Bánh Mì Chảo',
    categoryName: 'Bánh Mì Chảo',
    price: '10000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },
  {
    name: 'Pate Thêm',
    subtitle: '10k — Đồ gọi thêm Bánh Mì Chảo',
    categoryName: 'Bánh Mì Chảo',
    price: '10000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },
  {
    name: 'Thịt Bò Thêm (Bánh Mì Chảo)',
    subtitle: '20k — Đồ gọi thêm Bánh Mì Chảo',
    categoryName: 'Bánh Mì Chảo',
    price: '20000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },

  // ------------------------------------------------
  // IV. LẨU HÀN QUỐC (BEP_NAU)
  // ------------------------------------------------
  {
    name: 'Lẩu Thái',
    subtitle: 'Cỡ nồi: 250k - 300k - 350k',
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
    subtitle: 'Cỡ nồi: 250k - 300k - 350k',
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
    subtitle: 'Cỡ nồi: 400k - 450k',
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
    subtitle: 'Cỡ nồi: 450k - 500k',
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
    subtitle: 'Đặt trước — Cỡ nồi: 300k - 350k - 400k',
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
    subtitle: 'Nồi dành cho 3-4 người',
    categoryName: 'Lẩu Hàn Quốc',
    price: '200000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
    modifierGroups: createHotpotModifierGroups(),
  },

  // ------------------------------------------------
  // V. ĐỒ GỌI THÊM LẨU (BEP_NAU)
  // ------------------------------------------------
  {
    name: 'Rau / Đậu (Lẩu)',
    subtitle: '10k/phần — Đồ gọi thêm Lẩu',
    categoryName: 'Đồ Gọi Thêm Lẩu',
    price: '10000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },
  {
    name: 'Kimchi / Nấm (Lẩu)',
    subtitle: '20k/phần — Đồ gọi thêm Lẩu',
    categoryName: 'Đồ Gọi Thêm Lẩu',
    price: '20000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },
  {
    name: 'Xúc Xích / Viên Lẩu',
    subtitle: '30k/đĩa — Đồ gọi thêm Lẩu',
    categoryName: 'Đồ Gọi Thêm Lẩu',
    price: '30000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },
  {
    name: 'Sườn Sụn / Bò Mỹ (Lẩu)',
    subtitle: '50k/đĩa — Đồ gọi thêm Lẩu',
    categoryName: 'Đồ Gọi Thêm Lẩu',
    price: '50000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },
  {
    name: 'Tôm / Mực / Bò Tươi (Lẩu)',
    subtitle: '80k/đĩa — Đồ gọi thêm Lẩu',
    categoryName: 'Đồ Gọi Thêm Lẩu',
    price: '80000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },

  // ------------------------------------------------
  // VI. NEM NƯỚNG & CƠM GÀ (BEP_NAU)
  // ------------------------------------------------
  {
    name: 'Nem Nướng Nha Trang',
    subtitle: '35k/suất đầy đủ rau sống, bánh tráng, nước chấm đặc biệt',
    categoryName: 'Nem Nướng & Cơm Gà',
    price: '35000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },
  {
    name: 'Cơm Gà Sốt',
    subtitle: 'Cơm nóng ăn kèm gà tươi sốt đậm đà',
    categoryName: 'Nem Nướng & Cơm Gà',
    price: '45000.00',
    station: ProductStation.BEP_NAU,
    comboItems: [],
  },

  // ------------------------------------------------
  // VII. GÀ RÁN - NGUYÊN LIỆU GÀ TƯƠI (BEP_CHIEN)
  // ------------------------------------------------
  {
    name: 'Đùi Gà KFC',
    subtitle: 'Nguyên liệu gà tươi chiên giòn chuẩn KFC',
    categoryName: 'Gà Rán - Gà Tươi',
    price: '30000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Đùi Sốt Hàn',
    subtitle: 'Nguyên liệu gà tươi phủ sốt Hàn Quốc',
    categoryName: 'Gà Rán - Gà Tươi',
    price: '35000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Cánh Gà KFC',
    subtitle: 'Nguyên liệu gà tươi chiên giòn chuẩn KFC',
    categoryName: 'Gà Rán - Gà Tươi',
    price: '30000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Cánh Sốt Hàn',
    subtitle: 'Nguyên liệu gà tươi phủ sốt Hàn Quốc',
    categoryName: 'Gà Rán - Gà Tươi',
    price: '35000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Miếng Gà KFC',
    subtitle: 'Nguyên liệu gà tươi chiên giòn chuẩn KFC',
    categoryName: 'Gà Rán - Gà Tươi',
    price: '25000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Miếng Sốt Hàn',
    subtitle: 'Nguyên liệu gà tươi phủ sốt Hàn Quốc',
    categoryName: 'Gà Rán - Gà Tươi',
    price: '30000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },

  // ------------------------------------------------
  // VIII. ĐỒ ĂN VẶT (BEP_CHIEN)
  // ------------------------------------------------
  {
    name: 'Xúc Xích Chiên',
    subtitle: '10k/cây chiên nóng giòn',
    categoryName: 'Đồ Ăn Vặt',
    price: '10000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Lạp Sườn HK',
    subtitle: 'Lạp sườn Hà Khẩu nướng/chiên thơm lừng',
    categoryName: 'Đồ Ăn Vặt',
    price: '15000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Khoai Tây Lắc Phomai',
    subtitle: 'Khoai tây chiên giòn lắc bột phô mai',
    categoryName: 'Đồ Ăn Vặt',
    price: '30000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Kimpap Chiên',
    subtitle: 'Cơm cuộn Hàn Quốc tẩm bột chiên giòn',
    categoryName: 'Đồ Ăn Vặt',
    price: '35000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Khoai Lang Kén',
    subtitle: 'Khoai lang kén chiên vàng cốt dừa',
    categoryName: 'Đồ Ăn Vặt',
    price: '30000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Khoai Môn Lệ Phố Nhỏ',
    subtitle: 'Đĩa nhỏ thơm bùi nhân đậu xanh',
    categoryName: 'Đồ Ăn Vặt',
    price: '30000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Khoai Môn Lệ Phố Lớn',
    subtitle: 'Đĩa lớn thơm bùi nhân đậu xanh',
    categoryName: 'Đồ Ăn Vặt',
    price: '50000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Nem Chua Rán Nhỏ (6c)',
    subtitle: 'Phần 6 chiếc kèm tương ớt, dưa chuột',
    categoryName: 'Đồ Ăn Vặt',
    price: '35000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Nem Chua Rán Lớn (10c)',
    subtitle: 'Phần 10 chiếc kèm tương ớt, dưa chuột',
    categoryName: 'Đồ Ăn Vặt',
    price: '50000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Phomai Que (5c)',
    subtitle: '5 que phô mai kéo sợi chiên xù',
    categoryName: 'Đồ Ăn Vặt',
    price: '30000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Bánh Mì Que (10c)',
    subtitle: '35k/10c giòn rụm',
    categoryName: 'Đồ Ăn Vặt',
    price: '35000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Topoki Phomai',
    subtitle: 'Bánh gạo Hàn Quốc sốt cay phủ phô mai',
    categoryName: 'Đồ Ăn Vặt',
    price: '40000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Chân Gà Sốt Thái',
    subtitle: 'Chân gà rút xương trộn sốt Thái chua cay',
    categoryName: 'Đồ Ăn Vặt',
    price: '50000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Mẹt Ăn Vặt 7 Món',
    subtitle: 'Mẹt tổng hợp 7 món ăn vặt hấp dẫn',
    categoryName: 'Đồ Ăn Vặt',
    price: '70000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Cá Viên Chiên',
    subtitle: 'Cá viên chiên giòn chấm tương',
    categoryName: 'Đồ Ăn Vặt',
    price: '25000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Xoài Dầm',
    subtitle: 'Xoài chua ngọt lắc muối ớt',
    categoryName: 'Đồ Ăn Vặt',
    price: '25000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Bò Khô Vắt Chanh',
    subtitle: 'Khô bò sợi vắt chanh thơm cay',
    categoryName: 'Đồ Ăn Vặt',
    price: '25000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Gà Khô Lá Chanh',
    subtitle: 'Khô gà xé cay giòn thơm lá chanh',
    categoryName: 'Đồ Ăn Vặt',
    price: '25000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Hướng Dương',
    subtitle: 'Đĩa hạt hướng dương rang thơm',
    categoryName: 'Đồ Ăn Vặt',
    price: '15000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },

  // ------------------------------------------------
  // IX. PIZZA (BEP_CHIEN)
  // ------------------------------------------------
  {
    name: 'Pizza Thập Cẩm Size S',
    subtitle: 'Đế giòn phủ xúc xích, bò, ngô, phô mai kéo sợi',
    categoryName: 'Pizza',
    price: '50000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
    modifierGroups: pizzaModifierGroups,
  },
  {
    name: 'Pizza Thập Cẩm Size M',
    subtitle: 'Đế giòn cỡ lớn phủ xúc xích, bò, ngô, phô mai kéo sợi',
    categoryName: 'Pizza',
    price: '80000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
    modifierGroups: pizzaModifierGroups,
  },
  {
    name: 'Thêm Phomai Pizza (10k)',
    subtitle: 'Phô mai Mozzarella phủ thêm cỡ S',
    categoryName: 'Pizza',
    price: '10000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },
  {
    name: 'Thêm Phomai Pizza (20k)',
    subtitle: 'Phô mai Mozzarella phủ thêm cỡ M / gấp đôi',
    categoryName: 'Pizza',
    price: '20000.00',
    station: ProductStation.BEP_CHIEN,
    comboItems: [],
  },

  // ------------------------------------------------
  // X. ĐỒ UỐNG XU HƯỚNG (PHA_CHE)
  // ------------------------------------------------
  {
    name: 'Trà Mãng Cầu (Xu Hướng)',
    subtitle: 'Mãng cầu tươi ngâm chua ngọt thanh mát',
    categoryName: 'Đồ Uống Xu Hướng',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Macha Latte',
    subtitle: 'Đồ uống xu hướng — Matcha Nhật kết hợp sữa tươi',
    categoryName: 'Đồ Uống Xu Hướng',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Hoa Quả Tươi (Xu Hướng)',
    subtitle: 'Đồ uống xu hướng — Trái cây tươi theo mùa',
    categoryName: 'Đồ Uống Xu Hướng',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sữa Chua Yến Mạch (Xu Hướng)',
    subtitle: 'Đồ uống xu hướng — Sữa chua sánh mịn kèm yến mạch',
    categoryName: 'Đồ Uống Xu Hướng',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sữa Chua Hoa Quả (Xu Hướng)',
    subtitle: 'Đồ uống xu hướng — Sữa chua dầm trái cây tươi',
    categoryName: 'Đồ Uống Xu Hướng',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Macha Trà Xanh Đá Xay (Xu Hướng)',
    subtitle: 'Đồ uống xu hướng — Đá xay mát lạnh phủ kem',
    categoryName: 'Đồ Uống Xu Hướng',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Xoài Kem Cốt Dừa Đá Xay',
    subtitle: 'Đồ uống xu hướng — Xoài chín xay mịn cùng cốt dừa',
    categoryName: 'Đồ Uống Xu Hướng',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Nước Ép Cam',
    subtitle: 'Đồ uống xu hướng — Cam tươi nguyên chất',
    categoryName: 'Đồ Uống Xu Hướng',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sữa Kem Trứng Dừa Nướng',
    subtitle: 'Đồ uống xu hướng — Kem trứng khè lửa kèm dừa nướng giòn',
    categoryName: 'Đồ Uống Xu Hướng',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sinh Tố Bơ (Xu Hướng)',
    subtitle: 'Đồ uống xu hướng — Bơ sáp xay mịn béo ngậy',
    categoryName: 'Đồ Uống Xu Hướng',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Hoa Quả Nhiệt Đới (Xu Hướng)',
    subtitle: 'Đồ uống xu hướng — Tổng hợp trái cây nhiệt đới',
    categoryName: 'Đồ Uống Xu Hướng',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sữa Trân Châu Đường Đen (Xu Hướng)',
    subtitle: 'Đồ uống xu hướng — Trân châu nấu đường đen Hàn Quốc',
    categoryName: 'Đồ Uống Xu Hướng',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sen Xanh',
    subtitle: 'Đồ uống xu hướng — Hương sen thanh mát kết hợp matcha',
    categoryName: 'Đồ Uống Xu Hướng',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sen Sữa Dừa',
    subtitle: 'Đồ uống xu hướng — Trà sen kết hợp sữa dừa thơm béo',
    categoryName: 'Đồ Uống Xu Hướng',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sen Nhài Macha',
    subtitle: 'Đồ uống xu hướng — Trà sen nhài hoà quyện kem matcha',
    categoryName: 'Đồ Uống Xu Hướng',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },

  // ------------------------------------------------
  // XI. TRÀ HOA QUẢ TƯƠI (PHA_CHE)
  // ------------------------------------------------
  {
    name: 'Trà Mãng Cầu',
    subtitle: 'Trà hoa quả tươi mát lạnh',
    categoryName: 'Trà Hoa Quả Tươi',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Hoa Quả Tươi',
    subtitle: 'Trái cây tươi cắt lát thanh nhiệt',
    categoryName: 'Trà Hoa Quả Tươi',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Dâu Tây',
    subtitle: 'Trà dâu tây tươi chua ngọt',
    categoryName: 'Trà Hoa Quả Tươi',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Dứa Mật',
    subtitle: 'Trà dứa mật thơm lừng giải nhiệt',
    categoryName: 'Trà Hoa Quả Tươi',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Dưa Lưới',
    subtitle: 'Trà dưa lưới tươi giòn ngọt',
    categoryName: 'Trà Hoa Quả Tươi',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Mít Thái',
    subtitle: 'Trà hoa quả kèm múi mít Thái giòn ngọt',
    categoryName: 'Trà Hoa Quả Tươi',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Xoài Chanh Dây',
    subtitle: 'Sự kết hợp giữa xoài chín và chanh dây thơm mát',
    categoryName: 'Trà Hoa Quả Tươi',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Cam Xoài',
    subtitle: 'Trà hoa quả tươi vị cam vàng và xoài chín',
    categoryName: 'Trà Hoa Quả Tươi',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sen Lá Nếp',
    subtitle: 'Trà sen thanh tao quyện hương lá nếp thơm dịu',
    categoryName: 'Trà Hoa Quả Tươi',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },

  // ------------------------------------------------
  // XII. TRÀ TRÁI CÂY (PHA_CHE)
  // ------------------------------------------------
  {
    name: 'Trà Đào',
    subtitle: 'Hồng trà đào thơm dịu',
    categoryName: 'Trà Trái Cây',
    price: '25000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Đào Cam Xả',
    subtitle: 'Đào miếng giòn, cam vàng, sả tươi',
    categoryName: 'Trà Trái Cây',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Đào Kem Cheese',
    subtitle: 'Trà đào phủ lớp kem phô mai mặn béo',
    categoryName: 'Trà Trái Cây',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Đào Trân Châu Trắng',
    subtitle: 'Trà đào kèm trân châu trắng giòn sần sật',
    categoryName: 'Trà Trái Cây',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Xoài Nha Đam',
    subtitle: 'Trà xoài kèm topping nha đam tươi mát',
    categoryName: 'Trà Trái Cây',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Xoài Sữa Chua',
    subtitle: 'Trà xoài lắc sữa chua lên men',
    categoryName: 'Trà Trái Cây',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Vải Nha Đam',
    subtitle: 'Trà vải ngọt thanh kèm nha đam giòn',
    categoryName: 'Trà Trái Cây',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Vải Sữa Chua',
    subtitle: 'Trà vải kết hợp sữa chua dịu nhẹ',
    categoryName: 'Trà Trái Cây',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Chanh Leo Nha Đam',
    subtitle: 'Trà chanh leo chua dịu kèm nha đam',
    categoryName: 'Trà Trái Cây',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Dứa Chanh Leo',
    subtitle: 'Trà dứa quyện chanh leo nhiệt đới',
    categoryName: 'Trà Trái Cây',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Dâu Sữa Chua',
    subtitle: 'Trà dâu tây lắc sữa chua thơm mát',
    categoryName: 'Trà Trái Cây',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sen Vàng Machiato',
    subtitle: 'Trà sen vàng hạt sen phủ kem macchiato',
    categoryName: 'Trà Trái Cây',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Hoa Quả Nhiệt Đới',
    subtitle: 'Tổng hợp trái cây tươi nhiệt đới giải khát',
    categoryName: 'Trà Trái Cây',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Chanh / Quất',
    subtitle: 'Trà chanh hoặc trà quất truyền thống',
    categoryName: 'Trà Trái Cây',
    price: '10000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Chanh / Quất Nha Đam',
    subtitle: 'Trà chanh/quất thêm topping nha đam giòn',
    categoryName: 'Trà Trái Cây',
    price: '15000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Quất Lắc Sữa',
    subtitle: 'Quất tươi lắc sữa chua ngọt thơm béo',
    categoryName: 'Trà Trái Cây',
    price: '20000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Chanh Dưa Lưới',
    subtitle: 'Trà chanh kết hợp hương dưa lưới mát lành',
    categoryName: 'Trà Trái Cây',
    price: '20000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },

  // ------------------------------------------------
  // XIII. TRÀ SỮA (PHA_CHE)
  // ------------------------------------------------
  {
    name: 'Hồng Trà Sữa Trân Châu',
    subtitle: 'Hồng trà sữa truyền thống kèm trân châu dẻo',
    categoryName: 'Trà Sữa',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sữa Dâu',
    subtitle: 'Trà sữa hương dâu tây ngọt ngào',
    categoryName: 'Trà Sữa',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sữa Socola',
    subtitle: 'Trà sữa vị socola đậm đà',
    categoryName: 'Trà Sữa',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sữa Café',
    subtitle: 'Trà sữa kết hợp hương cà phê thơm nồng',
    categoryName: 'Trà Sữa',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sữa CaCao',
    subtitle: 'Trà sữa cacao béo thơm',
    categoryName: 'Trà Sữa',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sữa Việt Quất',
    subtitle: 'Trà sữa hương việt quất thơm mát',
    categoryName: 'Trà Sữa',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sữa Khoai Môn',
    subtitle: 'Trà sữa khoai môn bùi béo',
    categoryName: 'Trà Sữa',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sữa Bạc Hà',
    subtitle: 'Trà sữa hương bạc hà the mát',
    categoryName: 'Trà Sữa',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sữa Macha',
    subtitle: 'Trà sữa trà xanh matcha Nhật Bản',
    categoryName: 'Trà Sữa',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sữa Dưa Lưới',
    subtitle: 'Trà sữa vị dưa lưới thơm dịu',
    categoryName: 'Trà Sữa',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sữa Xoài',
    subtitle: 'Trà sữa hương xoài chín ngọt thơm',
    categoryName: 'Trà Sữa',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sữa Trân Châu Đường Đen',
    subtitle: 'Sữa tươi/trà sữa quyện sốt đường đen và trân châu dẻo',
    categoryName: 'Trà Sữa',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sữa Kem Dừa Nướng',
    subtitle: 'Phủ lớp kem béo và dừa nướng giòn thơm',
    categoryName: 'Trà Sữa',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sữa Kem Trứng Orion',
    subtitle: 'Phủ kem trứng sánh mịn và vụn bánh Oreo/Orion',
    categoryName: 'Trà Sữa',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Trà Sữa Kem Trứng Macha',
    subtitle: 'Trà sữa matcha phủ kem trứng nướng béo ngậy',
    categoryName: 'Trà Sữa',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sữa Gạo Rang Hàn Quốc',
    subtitle: 'Thức uống gạo rang Hàn Quốc thơm dịu, bổ dưỡng',
    categoryName: 'Trà Sữa',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },

  // ------------------------------------------------
  // XIV. SINH TỐ (PHA_CHE)
  // ------------------------------------------------
  {
    name: 'Bơ Già Dừa Non',
    subtitle: 'Sinh tố bơ sáp kết hợp cùi dừa non béo bùi',
    categoryName: 'Sinh Tố',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sinh Tố Bơ',
    subtitle: 'Bơ tươi xay mịn cùng sữa đặc',
    categoryName: 'Sinh Tố',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sinh Tố Xoài',
    subtitle: 'Xoài chín tươi xay nhuyễn mát lạnh',
    categoryName: 'Sinh Tố',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sinh Tố Việt Quất',
    subtitle: 'Việt quất xay đá mịn chua ngọt',
    categoryName: 'Sinh Tố',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sinh Tố Dâu',
    subtitle: 'Dâu tây tươi xay mịn cùng sữa',
    categoryName: 'Sinh Tố',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sinh Tố Hoa Quả',
    subtitle: 'Sinh tố trái cây tổng hợp giàu vitamin',
    categoryName: 'Sinh Tố',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sinh Tố Bơ Xoài',
    subtitle: 'Sự kết hợp hoàn hảo giữa bơ béo và xoài ngọt',
    categoryName: 'Sinh Tố',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sinh Tố Mãng Cầu',
    subtitle: 'Mãng cầu xiêm tươi xay nhuyễn mát lành',
    categoryName: 'Sinh Tố',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },

  // ------------------------------------------------
  // XV. NƯỚC ÉP HOA QUẢ (PHA_CHE)
  // ------------------------------------------------
  {
    name: 'Ép Cam',
    subtitle: 'Nước ép cam tươi nguyên chất',
    categoryName: 'Nước Ép Hoa Quả',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Ép Dưa Hấu',
    subtitle: 'Nước ép dưa hấu tươi mát ngọt lành',
    categoryName: 'Nước Ép Hoa Quả',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Ép Táo',
    subtitle: 'Nước ép táo tươi nguyên chất',
    categoryName: 'Nước Ép Hoa Quả',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Ép Dứa',
    subtitle: 'Nước ép dứa tươi giàu vitamin C',
    categoryName: 'Nước Ép Hoa Quả',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },

  // ------------------------------------------------
  // XVI. COFFEE (PHA_CHE)
  // ------------------------------------------------
  {
    name: 'Coffee Nâu',
    subtitle: 'Cà phê nâu đá/nóng truyền thống đậm vị',
    categoryName: 'Coffee',
    price: '20000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Coffee Đen',
    subtitle: 'Cà phê đen nguyên chất',
    categoryName: 'Coffee',
    price: '20000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Bạc Xỉu',
    subtitle: 'Cà phê sữa nhiều sữa thơm béo',
    categoryName: 'Coffee',
    price: '25000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Coffee Kem Trứng Nướng',
    subtitle: 'Cà phê phủ lớp kem trứng khè lửa béo mịn',
    categoryName: 'Coffee',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Coffee Cốt Dừa Đá Xay',
    subtitle: 'Cốt dừa đá xay hoà quyện cà phê đậm đà',
    categoryName: 'Coffee',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Bạc Xỉu Trân Châu Đường Đen',
    subtitle: 'Bạc xỉu kết hợp trân châu đường đen dẻo mềm',
    categoryName: 'Coffee',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },

  // ------------------------------------------------
  // XVII. ĐÁ XAY (PHA_CHE)
  // ------------------------------------------------
  {
    name: 'Macha Trà Xanh Đá Xay',
    subtitle: 'Đá xay trà xanh matcha phủ kem',
    categoryName: 'Đá Xay',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Đá Xay Bạc Hà',
    subtitle: 'Đá xay hương bạc hà mát lạnh sảng khoái',
    categoryName: 'Đá Xay',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Đá Xay Việt Quất',
    subtitle: 'Đá xay mứt việt quất chua ngọt',
    categoryName: 'Đá Xay',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Đá Xay Dâu',
    subtitle: 'Đá xay dâu tây ngọt mát',
    categoryName: 'Đá Xay',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Chanh Tuyết',
    subtitle: 'Chanh tươi xay tuyết mịn mát lạnh',
    categoryName: 'Đá Xay',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Xoài Kem Cốt Dừa',
    subtitle: 'Đá xay xoài chín quyện kem cốt dừa béo thơm',
    categoryName: 'Đá Xay',
    price: '35000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },

  // ------------------------------------------------
  // XVIII. SỮA CHUA (PHA_CHE)
  // ------------------------------------------------
  {
    name: 'Sữa Chua Hoa Quả',
    subtitle: 'Sữa chua dầm trái cây tươi cắt hạt lựu',
    categoryName: 'Sữa Chua',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sữa Chua Yến Mạch',
    subtitle: 'Sữa chua ăn kèm hạt yến mạch dinh dưỡng',
    categoryName: 'Sữa Chua',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sữa Chua Trân Châu',
    subtitle: 'Sữa chua mát lạnh kèm trân châu cốt dừa',
    categoryName: 'Sữa Chua',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sữa Chua Xoài',
    subtitle: 'Sữa chua kết hợp mứt và thịt xoài chín',
    categoryName: 'Sữa Chua',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sữa Chua Đánh Đá',
    subtitle: 'Sữa chua đánh đá truyền thống thêm chanh/sữa đặc',
    categoryName: 'Sữa Chua',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sữa Chua Việt Quất',
    subtitle: 'Sữa chua dầm sốt việt quất thơm lừng',
    categoryName: 'Sữa Chua',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sữa Chua Dâu',
    subtitle: 'Sữa chua dầm dâu tây ngọt dịu',
    categoryName: 'Sữa Chua',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },

  // ------------------------------------------------
  // XIX. SỮA TƯƠI MILK FOAM (PHA_CHE)
  // ------------------------------------------------
  {
    name: 'Sữa Tươi Trân Châu Đường Đen',
    subtitle: 'Sữa tươi thanh trùng kết hợp trân châu đường đen',
    categoryName: 'Sữa Tươi Milk Foam',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sữa Tươi Xoài Milk Foam',
    subtitle: 'Sữa tươi vị xoài phủ lớp kem Milk Foam béo nhẹ',
    categoryName: 'Sữa Tươi Milk Foam',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sữa Tươi Đào Milk Foam',
    subtitle: 'Sữa tươi vị đào phủ lớp kem Milk Foam béo nhẹ',
    categoryName: 'Sữa Tươi Milk Foam',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sữa Tươi Dâu Milk Foam',
    subtitle: 'Sữa tươi vị dâu tây phủ lớp kem Milk Foam',
    categoryName: 'Sữa Tươi Milk Foam',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Sữa Tươi Matcha Milk Foam',
    subtitle: 'Sữa tươi trà xanh phủ lớp kem Milk Foam',
    categoryName: 'Sữa Tươi Milk Foam',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },

  // ------------------------------------------------
  // XX. ĐỒ UỐNG NÓNG (PHA_CHE)
  // ------------------------------------------------
  {
    name: 'Trà Gừng Mật Ong',
    subtitle: 'Đồ uống nóng ấm bụng hương gừng tươi và mật ong',
    categoryName: 'Đồ Uống Nóng',
    price: '25000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Matcha Late Nóng',
    subtitle: 'Ly Matcha Latte nóng thơm béo',
    categoryName: 'Đồ Uống Nóng',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },

  // ------------------------------------------------
  // XXI. SODA Ý (PHA_CHE)
  // ------------------------------------------------
  {
    name: 'Soda Bạc Hà',
    subtitle: 'Soda Ý hương bạc hà mát lạnh sảng khoái',
    categoryName: 'Soda Ý',
    price: '25000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Soda Dâu',
    subtitle: 'Soda Ý vị dâu tây ngọt mát',
    categoryName: 'Soda Ý',
    price: '25000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Soda Việt Quất',
    subtitle: 'Soda Ý vị việt quất chua ngọt',
    categoryName: 'Soda Ý',
    price: '25000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Soda Bluberry',
    subtitle: 'Soda Ý vị Blueberry xanh mát',
    categoryName: 'Soda Ý',
    price: '25000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },

  // ------------------------------------------------
  // XXII. NƯỚC NGỌT - BIA - RƯỢU (PHA_CHE)
  // ------------------------------------------------
  {
    name: 'Coca',
    subtitle: 'Lon Coca-Cola ướp lạnh',
    categoryName: 'Nước Ngọt - Bia - Rượu',
    price: '15000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Nước Cam',
    subtitle: 'Nước cam đóng chai/lon ướp lạnh',
    categoryName: 'Nước Ngọt - Bia - Rượu',
    price: '15000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Nước Lọc',
    subtitle: 'Chai nước suối tinh khiết',
    categoryName: 'Nước Ngọt - Bia - Rượu',
    price: '10000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Bia Hà Nội',
    subtitle: 'Lon/Chai Bia Hà Nội ướp lạnh',
    categoryName: 'Nước Ngọt - Bia - Rượu',
    price: '15000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Bia Sài Gòn',
    subtitle: 'Lon/Chai Bia Sài Gòn ướp lạnh',
    categoryName: 'Nước Ngọt - Bia - Rượu',
    price: '15000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Bia Tiger',
    subtitle: 'Lon/Chai Bia Tiger ướp lạnh',
    categoryName: 'Nước Ngọt - Bia - Rượu',
    price: '20000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Rượu Nếp',
    subtitle: 'Rượu nếp êm dịu truyền thống',
    categoryName: 'Nước Ngọt - Bia - Rượu',
    price: '30000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },
  {
    name: 'Rượu Sochu',
    subtitle: 'Chai rượu Soju Hàn Quốc',
    categoryName: 'Nước Ngọt - Bia - Rượu',
    price: '80000.00',
    station: ProductStation.PHA_CHE,
    comboItems: [],
  },

  // ------------------------------------------------
  // XXIII. COMBO GÀ RÁN (COMBO — Đặt cuối để map childProductId)
  // ------------------------------------------------
  {
    name: 'Combo Gà KFC + Gà Sốt',
    subtitle: 'Phần vừa kết hợp Gà KFC giòn rụm và Gà Sốt Hàn Quốc',
    categoryName: 'Combo Gà Rán',
    price: '80000.00',
    station: ProductStation.COMBO,
    comboItems: [
      { productName: 'Đùi Gà KFC', quantity: 1, station: ProductStation.BEP_CHIEN },
      { productName: 'Cánh Sốt Hàn', quantity: 1, station: ProductStation.BEP_CHIEN },
      { productName: 'Miếng Gà KFC', quantity: 1, station: ProductStation.BEP_CHIEN },
    ],
  },
  {
    name: 'Combo Gà KFC + Gà Sốt Lớn',
    subtitle: 'Phần lớn kết hợp Gà KFC giòn rụm và Gà Sốt Hàn Quốc',
    categoryName: 'Combo Gà Rán',
    price: '120000.00',
    station: ProductStation.COMBO,
    comboItems: [
      { productName: 'Đùi Gà KFC', quantity: 1, station: ProductStation.BEP_CHIEN },
      { productName: 'Đùi Sốt Hàn', quantity: 1, station: ProductStation.BEP_CHIEN },
      { productName: 'Cánh Gà KFC', quantity: 1, station: ProductStation.BEP_CHIEN },
      { productName: 'Cánh Sốt Hàn', quantity: 1, station: ProductStation.BEP_CHIEN },
    ],
  },
  {
    name: 'Combo Gà + Khoai Tây',
    subtitle: 'Gà rán tươi ăn kèm Khoai tây lắc phomai',
    categoryName: 'Combo Gà Rán',
    price: '99000.00',
    station: ProductStation.COMBO,
    comboItems: [
      { productName: 'Đùi Gà KFC', quantity: 1, station: ProductStation.BEP_CHIEN },
      { productName: 'Cánh Sốt Hàn', quantity: 1, station: ProductStation.BEP_CHIEN },
      { productName: 'Khoai Tây Lắc Phomai', quantity: 1, station: ProductStation.BEP_CHIEN },
    ],
  },
  {
    name: 'Combo 50k (Gà + Kimpap + Khoai Tây)',
    subtitle: 'Gà + Kimpap + Khoai tây',
    categoryName: 'Combo Gà Rán',
    price: '50000.00',
    station: ProductStation.COMBO,
    comboItems: [
      { productName: 'Miếng Gà KFC', quantity: 1, station: ProductStation.BEP_CHIEN },
      { productName: 'Kimpap Chiên', quantity: 1, station: ProductStation.BEP_CHIEN },
      { productName: 'Khoai Tây Lắc Phomai', quantity: 1, station: ProductStation.BEP_CHIEN },
    ],
  },
];

export const productSeed: ProductSeed[] = rawProductSeed.map((item, idx) => ({
  ...item,
  sortOrder: idx + 1,
}));

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
