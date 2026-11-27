import {
  DEFAULT_DRINK_SIZE_MODIFIER_GROUP,
  isDrinkSizeCategoryName,
  normalizeSubstituteNameList,
  syncSubstitutionRulesOnModifierChange,
  validateGroupSubstitutionRules,
  type CreateProductInput,
  type MdmItem,
  type Product,
  type ProductStation,
} from '@fnb/shared';
import {
  CheckSquare,
  Flame,
  Layers,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAppMessages } from '@/hooks/use-app-messages';
import { DEFAULT_KITCHEN_STATIONS, type KitchenStationOption } from '@/lib/menu-sync';

import {
  useCreateProductMutation,
  useUpdateProductMutation,
} from '../api/menu-admin.api';

interface EditableModifier {
  name: string;
  extraPrice: number | '';
  isDefaultChecked: boolean;
  isAvailable: boolean;
  defaultSubstituteName: string;
  allowedSubstituteNames: string[] | null;
}

interface EditableModifierGroup {
  name: string;
  isRequired: boolean;
  maxSelect: number;
  isAutoSelect: boolean;
  allowSubstitution: boolean;
  modifiers: EditableModifier[];
}

interface EditableComboItem {
  productId: number;
  quantity: number;
}

interface ProductFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProduct: Product | null;
  allProducts: Product[];
  categories: MdmItem[];
  stations?: KitchenStationOption[];
  onOpenCategoryManager: () => void;
  onOpenStationManager?: () => void;
}

export function ProductFormDrawer({
  open,
  onOpenChange,
  editingProduct,
  allProducts,
  categories,
  stations = DEFAULT_KITCHEN_STATIONS,
  onOpenCategoryManager,
  onOpenStationManager,
}: ProductFormDrawerProps) {
  const { notify, resolveErrorMessage } = useAppMessages();
  const [name, setName] = React.useState('');
  const [subtitle, setSubtitle] = React.useState('');
  const [station, setStation] = React.useState<ProductStation>('BEP_NAU');
  const [categoryId, setCategoryId] = React.useState<number | null>(null);
  const [price, setPrice] = React.useState<string>('45000');
  const [sortOrder, setSortOrder] = React.useState<string>('1');
  const [isAvailable, setIsAvailable] = React.useState<boolean>(true);
  const [modifierGroups, setModifierGroups] = React.useState<EditableModifierGroup[]>([]);
  const [comboItems, setComboItems] = React.useState<EditableComboItem[]>([]);

  const createMutation = useCreateProductMutation();
  const updateMutation = useUpdateProductMutation();

  const physicalProducts = React.useMemo(
    () => allProducts.filter((p) => p.station !== 'COMBO' && p.id !== editingProduct?.id),
    [allProducts, editingProduct],
  );

  React.useEffect(() => {
    if (!open) return;
    if (editingProduct) {
      setName(editingProduct.name);
      setSubtitle(editingProduct.subtitle ?? '');
      setStation(editingProduct.station);
      setCategoryId(editingProduct.categoryId ?? null);
      setPrice(String(editingProduct.price));
      setSortOrder(String(editingProduct.sortOrder));
      setIsAvailable(editingProduct.isAvailable);
      setModifierGroups(
        editingProduct.modifierGroups.map((g) => {
          const allowSubstitution = g.allowSubstitution ?? false;
          const siblingNames = g.modifiers
            .map((item) => item.name.trim())
            .filter(Boolean);
          return {
            name: g.name,
            isRequired: g.isRequired,
            maxSelect: g.maxSelect,
            isAutoSelect: g.isAutoSelect ?? false,
            allowSubstitution,
            modifiers: g.modifiers.map((m) => {
              const modName = m.name.trim();
              const fallbackLegacyAllowed = siblingNames.filter(
                (candidate) => candidate !== modName,
              );
              const allowedSubstituteNames = allowSubstitution
                ? Array.isArray(m.allowedSubstituteNames)
                  ? (normalizeSubstituteNameList(m.allowedSubstituteNames, modName) ?? [])
                  : fallbackLegacyAllowed
                : null;
              const rawDefault = m.defaultSubstituteName?.trim() ?? '';
              const defaultSubstituteName =
                allowSubstitution && allowedSubstituteNames
                  ? allowedSubstituteNames.includes(rawDefault)
                    ? rawDefault
                    : (allowedSubstituteNames[0] ?? '')
                  : '';

              return {
                name: m.name,
                extraPrice: m.extraPrice,
                isDefaultChecked: m.isDefaultChecked ?? false,
                isAvailable: m.isAvailable ?? true,
                defaultSubstituteName,
                allowedSubstituteNames,
              };
            }),
          };
        }),
      );
      setComboItems(
        editingProduct.comboItems.map((c) => ({
          productId: c.productId,
          quantity: c.quantity,
        })),
      );
    } else {
      setName('');
      setSubtitle('');
      setStation('BEP_NAU');
      const firstCat = categories.find((c) => c.metadata?.defaultStation === 'BEP_NAU') ?? categories[0];
      setCategoryId(firstCat ? firstCat.id : null);
      setPrice('69000');
      setSortOrder(String(allProducts.length + 1));
      setIsAvailable(true);
      setModifierGroups([]);
      setComboItems([]);
    }
  }, [open, editingProduct, categories, allProducts.length]);

  const buildSizePresetGroup = (): EditableModifierGroup => ({
    name: DEFAULT_DRINK_SIZE_MODIFIER_GROUP.name,
    isRequired: DEFAULT_DRINK_SIZE_MODIFIER_GROUP.isRequired,
    maxSelect: DEFAULT_DRINK_SIZE_MODIFIER_GROUP.maxSelect,
    isAutoSelect: DEFAULT_DRINK_SIZE_MODIFIER_GROUP.isAutoSelect,
    allowSubstitution: DEFAULT_DRINK_SIZE_MODIFIER_GROUP.allowSubstitution,
    modifiers: DEFAULT_DRINK_SIZE_MODIFIER_GROUP.modifiers.map((m) => ({
      name: m.name,
      extraPrice: m.extraPrice,
      isDefaultChecked: m.isDefaultChecked,
      isAvailable: m.isAvailable,
      defaultSubstituteName: m.defaultSubstituteName ?? '',
      allowedSubstituteNames: null,
    })),
  });

  const handleCategoryChange = (nextCategoryId: number | null) => {
    setCategoryId(nextCategoryId);
    if (nextCategoryId !== null && station !== 'COMBO') {
      const matched = categories.find((c) => c.id === nextCategoryId);
      const defaultStation = matched?.metadata?.defaultStation;
      if (typeof defaultStation === 'string' && defaultStation.trim()) {
        setStation(defaultStation as ProductStation);
      }
      if (!editingProduct && isDrinkSizeCategoryName(matched?.name)) {
        setModifierGroups((prev) => {
          if (prev.some((g) => /^size$/i.test(g.name.trim()))) return prev;
          return [buildSizePresetGroup(), ...prev];
        });
      }
    }
  };

  // Preset Group Helpers
  const addPresetDrinkSizeGroup = () => {
    setModifierGroups((prev) => {
      if (prev.some((g) => /^size$/i.test(g.name.trim()))) return prev;
      return [buildSizePresetGroup(), ...prev];
    });
  };

  const addPresetSpiceGroup = () => {
    setModifierGroups((prev) => [
      ...prev,
      {
        name: 'Cấp độ cay',
        isRequired: true,
        maxSelect: 1,
        isAutoSelect: false,
        allowSubstitution: false,
        modifiers: Array.from({ length: 8 }, (_, i) => ({
          name: `Cấp ${i}`,
          extraPrice: 0,
          isDefaultChecked: false,
          isAvailable: true,
          defaultSubstituteName: '',
          allowedSubstituteNames: null,
        })),
      },
    ]);
  };

  const addPresetDefaultGarnishGroup = () => {
    setModifierGroups((prev) => [
      ...prev,
      {
        name: 'Đồ ăn mặc định (0đ)',
        isRequired: false,
        maxSelect: 6,
        isAutoSelect: true,
        allowSubstitution: false,
        modifiers: ['Tôm viên', 'Xúc xích', 'Ngô', 'Rau', 'Nấm kim châm', 'Kim chi'].map(
          (item) => ({
            name: item,
            extraPrice: 0,
            isDefaultChecked: true,
            isAvailable: true,
            defaultSubstituteName: '',
            allowedSubstituteNames: null,
          }),
        ),
      },
    ]);
  };

  const addPresetMainIngredientSubstitutionGroup = () => {
    setModifierGroups((prev) => [
      ...prev,
      {
        name: 'Đồ ăn chính của món',
        isRequired: false,
        maxSelect: 3,
        isAutoSelect: true,
        allowSubstitution: true,
        modifiers: [
          {
            name: 'Ngao',
            extraPrice: 0,
            isDefaultChecked: true,
            isAvailable: true,
            defaultSubstituteName: '',
            allowedSubstituteNames: [],
          },
          {
            name: 'Tôm',
            extraPrice: 0,
            isDefaultChecked: true,
            isAvailable: true,
            defaultSubstituteName: 'Mực',
            allowedSubstituteNames: ['Mực', 'Ngao'],
          },
          {
            name: 'Mực',
            extraPrice: 0,
            isDefaultChecked: true,
            isAvailable: true,
            defaultSubstituteName: 'Tôm',
            allowedSubstituteNames: ['Tôm', 'Ngao'],
          },
        ],
      },
    ]);
  };

  const addPresetExtraToppingGroup = () => {
    setModifierGroups((prev) => [
      ...prev,
      {
        name: 'Đồ ăn thêm',
        isRequired: false,
        maxSelect: 10,
        isAutoSelect: false,
        allowSubstitution: false,
        modifiers: [
          { name: 'Xúc xích', extraPrice: 5000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
          { name: 'Tôm viên', extraPrice: 5000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
          { name: 'Đậu hũ', extraPrice: 5000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
          { name: 'Bò Mỹ', extraPrice: 10000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
          { name: 'Sườn sụn', extraPrice: 10000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
          { name: 'Ngao', extraPrice: 5000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
          { name: 'Tôm', extraPrice: 10000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
          { name: 'Mực', extraPrice: 10000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
          { name: 'Kim chi', extraPrice: 5000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
          { name: 'Nấm kim châm', extraPrice: 5000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
        ],
      },
    ]);
  };

  const addBlankGroup = () => {
    setModifierGroups((prev) => [
      ...prev,
      {
        name: '',
        isRequired: false,
        maxSelect: 1,
        isAutoSelect: false,
        allowSubstitution: false,
        modifiers: [
          { name: '', extraPrice: 0, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
        ],
      },
    ]);
  };

  const updateGroup = (index: number, patch: Partial<EditableModifierGroup>) => {
    setModifierGroups((prev) =>
      prev.map((group, idx) => {
        if (idx !== index) return group;
        const updated = { ...group, ...patch };
        if (patch.isAutoSelect !== undefined) {
          updated.modifiers = updated.modifiers.map((m) => ({
            ...m,
            isDefaultChecked: Boolean(patch.isAutoSelect),
          }));
          if (patch.isAutoSelect && updated.maxSelect < updated.modifiers.length) {
            updated.maxSelect = Math.max(updated.modifiers.length, 1);
          }
        }
        if (patch.allowSubstitution === true) {
          updated.isAutoSelect = true;
          const siblingNames = updated.modifiers
            .map((item) => item.name.trim())
            .filter(Boolean);
          updated.modifiers = updated.modifiers.map((m) => {
            const modName = m.name.trim();
            const existingAllowed = Array.isArray(m.allowedSubstituteNames)
              ? (normalizeSubstituteNameList(m.allowedSubstituteNames, modName) ?? [])
              : siblingNames.filter((candidate) => candidate !== modName);
            const currentDefault = m.defaultSubstituteName.trim();
            const nextDefault = existingAllowed.includes(currentDefault)
              ? currentDefault
              : (existingAllowed[0] ?? '');
            return {
              ...m,
              isDefaultChecked: true,
              allowedSubstituteNames: existingAllowed,
              defaultSubstituteName: nextDefault,
            };
          });
          updated.maxSelect = Math.max(updated.modifiers.length, 1);
        } else if (patch.allowSubstitution === false) {
          updated.modifiers = updated.modifiers.map((m) => ({
            ...m,
            allowedSubstituteNames: null,
            defaultSubstituteName: '',
          }));
        }
        return updated;
      }),
    );
  };

  const removeGroup = (index: number) => {
    setModifierGroups((prev) => prev.filter((_, idx) => idx !== index));
  };

  const addModifierToGroup = (groupIdx: number) => {
    setModifierGroups((prev) =>
      prev.map((group, idx) => {
        if (idx !== groupIdx) return group;
        const nextModifiers: EditableModifier[] = [
          ...group.modifiers,
          {
            name: '',
            extraPrice: 0,
            isDefaultChecked: group.isAutoSelect,
            isAvailable: true,
            defaultSubstituteName: '',
            allowedSubstituteNames: group.allowSubstitution ? [] : null,
          },
        ];
        return {
          ...group,
          maxSelect: group.isAutoSelect
            ? Math.max(group.maxSelect, nextModifiers.length)
            : group.maxSelect,
          modifiers: nextModifiers,
        };
      }),
    );
  };

  const updateModifier = (
    groupIdx: number,
    modIdx: number,
    patch: Partial<EditableModifier>,
  ) => {
    setModifierGroups((prev) =>
      prev.map((group, gIdx) => {
        if (gIdx !== groupIdx) return group;
        const prevMod = group.modifiers[modIdx];
        const nextModifiers = group.modifiers.map((m, mIdx) => {
          if (mIdx !== modIdx) return m;
          const nextRow = { ...m, ...patch };
          if (patch.name !== undefined && Array.isArray(nextRow.allowedSubstituteNames)) {
            nextRow.allowedSubstituteNames =
              normalizeSubstituteNameList(nextRow.allowedSubstituteNames, patch.name) ?? [];
            if (
              nextRow.defaultSubstituteName.trim() &&
              !nextRow.allowedSubstituteNames.includes(nextRow.defaultSubstituteName.trim())
            ) {
              nextRow.defaultSubstituteName = nextRow.allowedSubstituteNames[0] ?? '';
            }
          }
          return nextRow;
        });

        const syncedModifiers =
          group.allowSubstitution && patch.name !== undefined && prevMod
            ? syncSubstitutionRulesOnModifierChange(nextModifiers, {
                type: 'rename',
                oldName: prevMod.name,
                newName: patch.name,
              }).map((m) => ({
                ...m,
                defaultSubstituteName: m.defaultSubstituteName ?? '',
                allowedSubstituteNames: m.allowedSubstituteNames ?? null,
              }))
            : nextModifiers;

        return {
          ...group,
          modifiers: syncedModifiers,
        };
      }),
    );
  };

  const toggleAllowedSubstitute = (
    groupIdx: number,
    modIdx: number,
    targetName: string,
    checked: boolean,
  ) => {
    setModifierGroups((prev) =>
      prev.map((group, gIdx) => {
        if (gIdx !== groupIdx) return group;
        return {
          ...group,
          modifiers: group.modifiers.map((m, mIdx) => {
            if (mIdx !== modIdx) return m;
            const modName = m.name.trim();
            const siblingNames = group.modifiers
              .map((other) => other.name.trim())
              .filter((nameVal) => nameVal && nameVal !== modName);
            const currentAllowed = Array.isArray(m.allowedSubstituteNames)
              ? m.allowedSubstituteNames
              : siblingNames;
            const rawNext = checked
              ? [...currentAllowed, targetName]
              : currentAllowed.filter((entry) => entry.trim() !== targetName);
            const nextAllowed = normalizeSubstituteNameList(rawNext, modName) ?? [];
            const currentDefault = m.defaultSubstituteName.trim();
            const nextDefault = nextAllowed.includes(currentDefault)
              ? currentDefault
              : (nextAllowed[0] ?? '');

            return {
              ...m,
              allowedSubstituteNames: nextAllowed,
              defaultSubstituteName: nextDefault,
            };
          }),
        };
      }),
    );
  };

  const removeModifier = (groupIdx: number, modIdx: number) => {
    setModifierGroups((prev) =>
      prev.map((group, gIdx) => {
        if (gIdx !== groupIdx) return group;
        const removedMod = group.modifiers[modIdx];
        const filtered = group.modifiers.filter((_, mIdx) => mIdx !== modIdx);
        const syncedModifiers =
          group.allowSubstitution && removedMod
            ? syncSubstitutionRulesOnModifierChange(filtered, {
                type: 'remove',
                removedName: removedMod.name,
              }).map((m) => ({
                ...m,
                defaultSubstituteName: m.defaultSubstituteName ?? '',
                allowedSubstituteNames: m.allowedSubstituteNames ?? null,
              }))
            : filtered;

        return {
          ...group,
          modifiers: syncedModifiers,
        };
      }),
    );
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      notify('menu.product.missingName', { variant: 'destructive' });
      return;
    }

    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      notify('menu.product.invalidPrice', { variant: 'destructive' });
      return;
    }

    if (station === 'COMBO' && comboItems.length === 0) {
      notify('menu.product.comboRequiresItems', { variant: 'destructive' });
      return;
    }

    for (const group of modifierGroups) {
      if (!group.name.trim()) {
        notify('menu.product.modifierGroupMissingName', { variant: 'destructive' });
        return;
      }
      if (group.modifiers.length === 0 || group.modifiers.some((m) => !m.name.trim())) {
        notify('menu.product.modifierOptionMissingName', {
          variant: 'destructive',
          vars: { groupName: group.name },
        });
        return;
      }
      const substitutionError = validateGroupSubstitutionRules({
        allowSubstitution: group.allowSubstitution,
        modifiers: group.modifiers.map((m) => ({
          name: m.name.trim(),
          defaultSubstituteName: m.defaultSubstituteName.trim() || null,
          allowedSubstituteNames: group.allowSubstitution
            ? (normalizeSubstituteNameList(m.allowedSubstituteNames, m.name) ?? [])
            : null,
        })),
      });
      if (substitutionError) {
        notify('menu.product.saveError', {
          variant: 'destructive',
          vars: { reason: substitutionError },
        });
        return;
      }
    }

    const payload: CreateProductInput = {
      name: trimmedName,
      subtitle: subtitle.trim() ? subtitle.trim() : null,
      categoryId,
      price: numericPrice,
      station,
      isAvailable,
      sortOrder: Math.max(0, Number.parseInt(sortOrder || '0', 10) || 0),
      comboItems: station === 'COMBO' ? comboItems : [],
      modifierGroups: modifierGroups.map((group) => ({
        name: group.name.trim(),
        isRequired: group.isRequired,
        maxSelect: Math.max(1, Number(group.maxSelect) || 1),
        isAutoSelect: group.isAutoSelect,
        allowSubstitution: group.allowSubstitution,
        modifiers: group.modifiers.map((m) => ({
          name: m.name.trim(),
          extraPrice: Math.max(0, Number(m.extraPrice) || 0),
          isDefaultChecked: m.isDefaultChecked,
          isAvailable: m.isAvailable,
          defaultSubstituteName:
            group.allowSubstitution && m.defaultSubstituteName.trim()
              ? m.defaultSubstituteName.trim()
              : null,
          allowedSubstituteNames: group.allowSubstitution
            ? (normalizeSubstituteNameList(m.allowedSubstituteNames, m.name) ?? [])
            : null,
        })),
      })),
    };

    try {
      if (editingProduct) {
        await updateMutation.mutateAsync({ id: editingProduct.id, body: payload });
        notify('menu.product.updateSuccess', {
          variant: 'success',
          vars: { productName: trimmedName },
        });
      } else {
        await createMutation.mutateAsync(payload);
        notify('menu.product.createSuccess', {
          variant: 'success',
          vars: { productName: trimmedName },
        });
      }
      onOpenChange(false);
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'menu.product.saveError',
        error,
        'Không thể lưu cấu hình sản phẩm',
      );
      notify('menu.product.saveError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Không thể lưu cấu hình sản phẩm' },
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-4xl p-0 gap-0 overflow-hidden flex flex-col h-dvh"
        data-testid="product-form-drawer"
      >
        <SheetHeader className="p-4 sm:p-5 border-b border-border bg-card shrink-0 pr-12">
          <SheetTitle className="text-base sm:text-xl font-bold leading-snug">
            {editingProduct ? `Cấu hình món: ${editingProduct.name}` : 'Thêm món mới vào Thực đơn'}
          </SheetTitle>
          <SheetDescription className="text-xs sm:text-sm">
            Thiết lập Phân cấp 3 tầng (Khu vực Bếp → Danh mục con → Sản phẩm + Subtitle động) và các nhóm tuỳ chọn linh hoạt.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3.5 sm:p-6 space-y-5">
          {/* PHẦN 1: THÔNG TIN CƠ BẢN & PHÂN CẤP 3 TẦNG */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <UtensilsCrossed className="h-4 w-4 text-accent-text" />
              <span>1. Phân cấp Menu & Thông tin gốc</span>
            </h3>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <span className="text-xs font-bold text-foreground">
                {isAvailable ? 'Đang mở bán' : 'Tạm hết món'}
              </span>
            </label>
          </div>

          {/* Tầng 1: Khu vực Bếp */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground">
                Tầng 1 — Khu vực Bếp (Quyết định trạm in nhiệt 80mm)
              </label>
              {onOpenStationManager ? (
                <button
                  type="button"
                  onClick={onOpenStationManager}
                  className="text-xs font-bold text-accent-text hover:underline"
                >
                  Quản lý khu vực bếp
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {stations.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  data-testid={`product-station-${opt.code}`}
                  onClick={() => setStation(opt.code)}
                  className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                    station === opt.code
                      ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-accent/50'
                  }`}
                >
                  <span className="text-xs font-bold text-foreground">{opt.name}</span>
                  <span className="text-[11px] leading-tight mt-0.5 line-clamp-1">
                    {opt.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Tầng 2: Danh mục con MDM */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-6 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">
                  Tầng 2 — Danh mục con (MDM)
                </label>
                <button
                  type="button"
                  onClick={onOpenCategoryManager}
                  className="text-xs font-bold text-accent-text hover:underline"
                >
                  Quản lý danh mục con
                </button>
              </div>
              <select
                data-testid="product-category-select"
                value={categoryId ?? ''}
                onChange={(e) =>
                  handleCategoryChange(e.target.value ? Number(e.target.value) : null)
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">-- Chưa phân nhóm danh mục con --</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4 space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Đơn giá gốc (VNĐ) *
              </label>
              <CurrencyInput
                data-testid="product-price-input"
                value={price}
                onValueChange={(rawDigits) => setPrice(rawDigits)}
                placeholder="VD: 79.000"
                suffix="đ"
                className="h-10"
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Thứ tự</label>
              <Input
                type="number"
                min={0}
                data-testid="product-sort-input"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
          </div>

          {/* Tầng 3: Tên sản phẩm & Subtitle động */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-6 space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Tầng 3 — Tên sản phẩm *
              </label>
              <Input
                data-testid="product-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Mì cay hải sản"
              />
            </div>

            <div className="sm:col-span-6 space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Mô tả phụ / Subtitle động (hiển thị trong ngoặc)
              </label>
              <Input
                data-testid="product-subtitle-input"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="VD: Ngao, tôm, mực"
              />
            </div>
          </div>

          {name.trim() ? (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <span className="font-semibold">Xem trước hiển thị:</span>
              <span className="font-bold text-foreground">
                {name.trim()}
                {subtitle.trim() ? (
                  <span className="ml-1 font-normal text-muted-foreground">
                    ({subtitle.trim()})
                  </span>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>

        {/* PHẦN COMBO (NẾU LÀ TRẠM COMBO) */}
        {station === 'COMBO' ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Cấu hình Món thành phần Combo (Bắt buộc)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Khi bấm Tách Bếp, Combo sẽ tự động phân rã về đúng Bếp Nấu, Bếp Chiên, Pha Chế.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const first = physicalProducts[0];
                  if (!first) return;
                  setComboItems((prev) => [...prev, { productId: first.id, quantity: 1 }]);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Thêm thành phần</span>
              </Button>
            </div>

            <div className="space-y-2">
              {comboItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={item.productId}
                    onChange={(e) => {
                      const nextId = Number(e.target.value);
                      setComboItems((prev) =>
                        prev.map((c, cIdx) => (cIdx === idx ? { ...c, productId: nextId } : c)),
                      );
                    }}
                    className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {physicalProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.station})
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => {
                      const qty = Math.max(1, Number(e.target.value) || 1);
                      setComboItems((prev) =>
                        prev.map((c, cIdx) => (cIdx === idx ? { ...c, quantity: qty } : c)),
                      );
                    }}
                    className="w-20 h-9"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-destructive"
                    onClick={() =>
                      setComboItems((prev) => prev.filter((_, cIdx) => cIdx !== idx))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* PHẦN 2: CẤU HÌNH NHÓM TUỲ CHỌN ĐỘNG */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-2xs">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Layers className="h-4 w-4 text-accent-text" />
                <span>2. Các Nhóm Tuỳ Chọn Trong Sản Phẩm ({modifierGroups.length})</span>
              </h3>
              <Button
                type="button"
                size="sm"
                data-testid="add-blank-modifier-group-btn"
                onClick={addBlankGroup}
                className="font-bold"
              >
                <span>Tự thêm nhóm tuỳ chọn</span>
              </Button>
            </div>

            {/* Thanh mẫu tạo nhanh 1 chạm */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-semibold text-muted-foreground mr-1">
                Chèn mẫu nhanh:
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs font-semibold"
                onClick={addPresetDrinkSizeGroup}
              >
                <Layers className="h-3.5 w-3.5 text-sky-600" />
                <span>Size Pha chế (M +0đ / L +7k)</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs font-semibold"
                onClick={addPresetSpiceGroup}
              >
                <Flame className="h-3.5 w-3.5 text-accent-text" />
                <span>Cấp độ cay (0–7)</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs font-semibold"
                onClick={addPresetDefaultGarnishGroup}
              >
                <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />
                <span>Đồ ăn mặc định (0đ - Auto bật)</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs font-semibold"
                onClick={addPresetMainIngredientSubstitutionGroup}
              >
                <RefreshCw className="h-3.5 w-3.5 text-blue-600" />
                <span>Đồ ăn chính (Đổi món thông minh)</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs font-semibold"
                onClick={addPresetExtraToppingGroup}
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>Đồ ăn thêm (+Giá)</span>
              </Button>
            </div>
          </div>

          {modifierGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Sản phẩm này chưa có nhóm tuỳ chọn nào. Bạn có thể bấm các nút <strong>Chèn mẫu nhanh</strong> phía trên hoặc <strong>Tự thêm nhóm tuỳ chọn</strong>.
            </div>
          ) : (
            <div className="space-y-4">
              {modifierGroups.map((group, gIdx) => (
                <div
                  key={gIdx}
                  className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-3"
                  data-testid={`modifier-group-card-${gIdx}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 flex-1">
                      <div className="sm:col-span-6">
                        <label className="text-[11px] font-semibold text-muted-foreground">
                          Tên nhóm tuỳ chọn #{gIdx + 1}
                        </label>
                        <Input
                          value={group.name}
                          onChange={(e) => updateGroup(gIdx, { name: e.target.value })}
                          placeholder="VD: Cấp độ cay, Đồ ăn mặc định (0đ), Đồ ăn thêm..."
                          className="h-9 mt-0.5 font-semibold"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="text-[11px] font-semibold text-muted-foreground">
                          Số lượng chọn tối đa
                        </label>
                        <Input
                          type="number"
                          min={1}
                          value={group.maxSelect}
                          onChange={(e) =>
                            updateGroup(gIdx, {
                              maxSelect: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="h-9 mt-0.5"
                        />
                      </div>
                      <div className="sm:col-span-3 flex items-end pb-1">
                        <Badge variant="secondary" className="text-xs">
                          {group.maxSelect === 1 ? 'Chọn 1 ( Đơn )' : `Chọn tối đa ${group.maxSelect}`}
                        </Badge>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive shrink-0"
                      onClick={() => removeGroup(gIdx)}
                      title="Xoá nhóm tuỳ chọn này"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Các cờ điều khiển thông minh của nhóm */}
                  <div className="flex flex-wrap items-center gap-4 rounded-lg bg-background/80 px-3 py-2 border border-border/60 text-xs">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={group.isRequired}
                        onChange={(e) =>
                          updateGroup(gIdx, { isRequired: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      <span className="font-semibold">Bắt buộc chọn</span>
                    </label>

                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={group.isAutoSelect}
                        onChange={(e) =>
                          updateGroup(gIdx, { isAutoSelect: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        Auto bật (Tự động tích sẵn tất cả khi mở món)
                      </span>
                    </label>

                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={group.allowSubstitution}
                        onChange={(e) =>
                          updateGroup(gIdx, { allowSubstitution: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      <span className="font-semibold text-blue-700 dark:text-blue-400">
                         Logic đổi món chính (Bỏ tích tự động thay bằng món còn lại)
                      </span>
                    </label>
                  </div>

                  {/* Danh sách từng Line Item trong nhóm */}
                  <div className="space-y-2">
                    <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <div className={group.allowSubstitution ? 'sm:col-span-2' : 'sm:col-span-4'}>
                        Tên tuỳ chọn
                      </div>
                      <div className={group.allowSubstitution ? 'sm:col-span-2' : 'sm:col-span-3'}>
                        {group.allowSubstitution ? 'Giá thêm' : 'Đơn giá cộng thêm'}
                      </div>
                      {group.allowSubstitution ? (
                        <>
                          <div className="sm:col-span-3">Đổi món</div>
                          <div className="sm:col-span-2">Mặc định</div>
                        </>
                      ) : null}
                      <div className={group.allowSubstitution ? 'sm:col-span-1 text-center' : 'sm:col-span-2 text-center'}>
                        {group.allowSubstitution ? 'Auto' : 'Auto bật'}
                      </div>
                      <div className={group.allowSubstitution ? 'sm:col-span-1 text-center' : 'sm:col-span-2 text-center'}>
                        Tạm hết
                      </div>
                      <div className="sm:col-span-1 text-right">Xoá</div>
                    </div>

                    {group.modifiers.map((mod, mIdx) => {
                      const modTrimmedName = mod.name.trim();
                      const seenSiblings = new Set<string>();
                      const otherModifiers = group.modifiers
                        .map((other, idx) => ({ other, idx }))
                        .filter(({ other, idx }) => {
                          const targetName = other.name.trim();
                          if (idx === mIdx || !targetName || targetName === modTrimmedName) {
                            return false;
                          }
                          if (seenSiblings.has(targetName)) return false;
                          seenSiblings.add(targetName);
                          return true;
                        });
                      const allowedSet = new Set(
                        Array.isArray(mod.allowedSubstituteNames)
                          ? mod.allowedSubstituteNames.map((entry) => entry.trim())
                          : otherModifiers.map(({ other }) => other.name.trim()),
                      );
                      const checkedTargets = otherModifiers
                        .map(({ other }) => other.name.trim())
                        .filter((targetName) => allowedSet.has(targetName));

                      return (
                      <div
                        key={mIdx}
                        className={`rounded-lg border p-2.5 sm:p-0 sm:border-0 grid grid-cols-12 items-center gap-2 ${
                          !mod.isAvailable
                            ? 'border-rose-500/40 bg-rose-500/5 sm:rounded-md sm:bg-rose-500/5 sm:p-1'
                            : 'border-border/60 bg-background/70 sm:bg-transparent'
                        }`}
                      >
                        <div
                          className={
                            group.allowSubstitution
                              ? 'col-span-7 sm:col-span-2'
                              : 'col-span-7 sm:col-span-4'
                          }
                        >
                          <span className="block sm:hidden text-[10px] font-semibold text-muted-foreground mb-0.5">
                            Tên tuỳ chọn #{mIdx + 1}
                          </span>
                          <Input
                            value={mod.name}
                            onChange={(e) =>
                              updateModifier(gIdx, mIdx, { name: e.target.value })
                            }
                            placeholder="Tên món (VD: Tôm, Xúc xích, Cấp 1)..."
                            className={`h-8 text-xs ${!mod.isAvailable ? 'line-through opacity-75' : ''}`}
                          />
                        </div>

                        <div
                          className={
                            group.allowSubstitution
                              ? 'col-span-5 sm:col-span-2'
                              : 'col-span-5 sm:col-span-3'
                          }
                        >
                          <span className="block sm:hidden text-[10px] font-semibold text-muted-foreground mb-0.5">
                            Giá thêm (đ)
                          </span>
                          <CurrencyInput
                            value={mod.extraPrice}
                            onValueChange={(_, numeric) =>
                              updateModifier(gIdx, mIdx, {
                                extraPrice: numeric === null ? '' : Math.max(0, numeric),
                              })
                            }
                            placeholder="0"
                            suffix="đ"
                            className="h-8 text-xs font-mono"
                          />
                        </div>

                        {group.allowSubstitution ? (
                          <>
                            <div className="col-span-12 sm:col-span-3">
                              <span className="block sm:hidden text-[10px] font-semibold text-muted-foreground mb-1">
                                Đổi món (được phép thay thế)
                              </span>
                              {otherModifiers.length === 0 ? (
                                <span className="text-[11px] text-muted-foreground">
                                  Cần ít nhất 2 món
                                </span>
                              ) : (
                                <div
                                  data-testid={`modifier-allowed-subs-${gIdx}-${mIdx}`}
                                  className="flex flex-wrap gap-1"
                                >
                                  {otherModifiers.map(({ other, idx: siblingIdx }) => {
                                    const targetName = other.name.trim();
                                    const isAllowed = allowedSet.has(targetName);
                                    return (
                                      <label
                                        key={siblingIdx}
                                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium cursor-pointer select-none transition-colors ${
                                          isAllowed
                                            ? 'border-blue-500/50 bg-blue-500/10 text-blue-800 dark:text-blue-300'
                                            : 'border-border/60 bg-background text-muted-foreground hover:text-foreground'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          data-testid={`modifier-sub-checkbox-${gIdx}-${mIdx}-${siblingIdx}`}
                                          aria-label={`Cho phép đổi ${modTrimmedName || 'món này'} sang ${targetName}`}
                                          checked={isAllowed}
                                          onChange={(e) =>
                                            toggleAllowedSubstitute(
                                              gIdx,
                                              mIdx,
                                              targetName,
                                              e.target.checked,
                                            )
                                          }
                                          className="h-3.5 w-3.5 rounded border-border accent-blue-600 cursor-pointer"
                                        />
                                        <span>{targetName}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            <div className="col-span-12 sm:col-span-2">
                              <span className="block sm:hidden text-[10px] font-semibold text-muted-foreground mb-0.5">
                                Thay thế mặc định
                              </span>
                              <select
                                data-testid={`modifier-default-sub-select-${gIdx}-${mIdx}`}
                                aria-label={`Món thay thế mặc định cho ${modTrimmedName || 'món này'}`}
                                disabled={checkedTargets.length === 0}
                                value={checkedTargets.length === 0 ? '' : mod.defaultSubstituteName}
                                onChange={(e) =>
                                  updateModifier(gIdx, mIdx, {
                                    defaultSubstituteName: e.target.value,
                                  })
                                }
                                className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-65"
                              >
                                {checkedTargets.length === 0 ? (
                                  <option value="">Chỉ bỏ, không đổi</option>
                                ) : (
                                  <>
                                    <option value="">-- Chọn mặc định --</option>
                                    {checkedTargets.map((targetName) => (
                                      <option key={targetName} value={targetName}>
                                        {targetName}
                                      </option>
                                    ))}
                                  </>
                                )}
                              </select>
                            </div>
                          </>
                        ) : null}

                        <div
                          className={
                            group.allowSubstitution
                              ? 'col-span-4 sm:col-span-1 flex items-center sm:justify-center gap-1.5 pt-1 sm:pt-0'
                              : 'col-span-5 sm:col-span-2 flex items-center sm:justify-center gap-1.5 pt-1 sm:pt-0'
                          }
                        >
                          <input
                            type="checkbox"
                            checked={mod.isDefaultChecked}
                            onChange={(e) =>
                              updateModifier(gIdx, mIdx, {
                                isDefaultChecked: e.target.checked,
                              })
                            }
                            title="Tự động tích chọn khi mở sản phẩm"
                            className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                          />
                          <span className="sm:hidden text-xs font-medium text-muted-foreground">
                            Auto bật
                          </span>
                        </div>

                        <div
                          className={
                            group.allowSubstitution
                              ? 'col-span-5 sm:col-span-1 flex items-center sm:justify-center gap-1.5 pt-1 sm:pt-0'
                              : 'col-span-5 sm:col-span-2 flex items-center sm:justify-center gap-1.5 pt-1 sm:pt-0'
                          }
                        >
                          <input
                            type="checkbox"
                            data-testid={`modifier-unavailable-toggle-${gIdx}-${mIdx}`}
                            checked={!mod.isAvailable}
                            onChange={(e) =>
                              updateModifier(gIdx, mIdx, {
                                isAvailable: !e.target.checked,
                              })
                            }
                            title="Đánh dấu tuỳ chọn tạm hết (vô hiệu hoá và gạch ngang trên POS & QR)"
                            className="h-4 w-4 rounded border-rose-400 accent-rose-600 cursor-pointer"
                          />
                          <span className="sm:hidden text-xs font-medium text-rose-600 dark:text-rose-400">
                            Tạm hết
                          </span>
                        </div>

                        <div
                          className={
                            group.allowSubstitution
                              ? 'col-span-3 sm:col-span-1 flex justify-end pt-1 sm:pt-0'
                              : 'col-span-2 sm:col-span-1 flex justify-end pt-1 sm:pt-0'
                          }
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-testid={`modifier-remove-btn-${gIdx}-${mIdx}`}
                            className="h-7 w-7 p-0 text-destructive"
                            disabled={group.modifiers.length <= 1}
                            onClick={() => removeModifier(gIdx, mIdx)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      );
                    })}

                    <div className="pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs font-semibold"
                        onClick={() => addModifierToGroup(gIdx)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Thêm dòng tuỳ chọn</span>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>

        <SheetFooter className="p-3.5 sm:p-4 bg-card border-t border-border shrink-0 flex flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ bỏ
          </Button>
          <Button
            data-testid="save-product-submit-btn"
            onClick={() => void handleSave()}
            disabled={createMutation.isPending || updateMutation.isPending}
            className="font-bold"
          >
            {editingProduct ? 'Lưu cấu hình sản phẩm' : 'Tạo sản phẩm vào Thực đơn'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
