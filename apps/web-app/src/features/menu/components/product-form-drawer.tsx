import {
  isDrinkSizeCategoryName,
  normalizeSubstituteNameList,
  validateGroupSubstitutionRules,
  type CreateProductInput,
  type MdmItem,
  type Product,
  type ProductStation,
} from '@fnb/shared';
import * as React from 'react';

import { Button } from '@/components/ui/button';
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
import {
  buildSizePresetGroup,
  hydrateEditableModifierGroups,
  type EditableComboItem,
  type EditableModifierGroup,
} from '../utils/product-modifier-presets';
import {
  ProductBasicInfoSection,
  ProductComboSection,
} from './product-basic-and-combo-sections';
import { ProductModifierGroupsSection } from './product-modifier-groups-section';

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

/** Drawer form for creating and configuring menu items, combos, and dynamic modifier groups. */
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
      setModifierGroups(hydrateEditableModifierGroups(editingProduct.modifierGroups));
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
          <ProductBasicInfoSection
            name={name}
            subtitle={subtitle}
            station={station}
            categoryId={categoryId}
            price={price}
            sortOrder={sortOrder}
            isAvailable={isAvailable}
            stations={stations}
            categories={categories}
            onNameChange={setName}
            onSubtitleChange={setSubtitle}
            onStationChange={setStation}
            onCategoryChange={handleCategoryChange}
            onPriceChange={setPrice}
            onSortOrderChange={setSortOrder}
            onAvailableChange={setIsAvailable}
            onOpenCategoryManager={onOpenCategoryManager}
            onOpenStationManager={onOpenStationManager}
          />

          {station === 'COMBO' ? (
            <ProductComboSection
              comboItems={comboItems}
              physicalProducts={physicalProducts}
              onComboItemsChange={setComboItems}
            />
          ) : null}

          <ProductModifierGroupsSection
            modifierGroups={modifierGroups}
            onModifierGroupsChange={setModifierGroups}
          />
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
