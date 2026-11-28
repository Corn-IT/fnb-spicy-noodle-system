import {
  CheckSquare,
  Flame,
  Layers,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Input } from '@/components/ui/input';
import {
  appendBlankModifier,
  applyGroupPatch,
  applyModifierPatch,
  applyRemoveModifier,
  applyToggleAllowedSubstitute,
  buildBlankModifierGroup,
  buildDefaultGarnishPresetGroup,
  buildExtraToppingPresetGroup,
  buildMainIngredientSubstitutionPresetGroup,
  buildSizePresetGroup,
  buildSpicePresetGroup,
  type EditableModifier,
  type EditableModifierGroup,
} from '../utils/product-modifier-presets';

interface ProductModifierGroupsSectionProps {
  modifierGroups: EditableModifierGroup[];
  onModifierGroupsChange: React.Dispatch<React.SetStateAction<EditableModifierGroup[]>>;
}

/** Manages product modifier groups, 1-click presets, availability flags, and substitution matrix rules. */
export function ProductModifierGroupsSection({
  modifierGroups,
  onModifierGroupsChange,
}: ProductModifierGroupsSectionProps) {
  const addPresetDrinkSizeGroup = () => {
    onModifierGroupsChange((prev) => {
      if (prev.some((g) => /^size$/i.test(g.name.trim()))) return prev;
      return [buildSizePresetGroup(), ...prev];
    });
  };

  const addPresetSpiceGroup = () => {
    onModifierGroupsChange((prev) => [...prev, buildSpicePresetGroup()]);
  };

  const addPresetDefaultGarnishGroup = () => {
    onModifierGroupsChange((prev) => [...prev, buildDefaultGarnishPresetGroup()]);
  };

  const addPresetMainIngredientSubstitutionGroup = () => {
    onModifierGroupsChange((prev) => [...prev, buildMainIngredientSubstitutionPresetGroup()]);
  };

  const addPresetExtraToppingGroup = () => {
    onModifierGroupsChange((prev) => [...prev, buildExtraToppingPresetGroup()]);
  };

  const addBlankGroup = () => {
    onModifierGroupsChange((prev) => [...prev, buildBlankModifierGroup()]);
  };

  const updateGroup = (index: number, patch: Partial<EditableModifierGroup>) => {
    onModifierGroupsChange((prev) =>
      prev.map((group, idx) => (idx === index ? applyGroupPatch(group, patch) : group)),
    );
  };

  const removeGroup = (index: number) => {
    onModifierGroupsChange((prev) => prev.filter((_, idx) => idx !== index));
  };

  const addModifierToGroup = (groupIdx: number) => {
    onModifierGroupsChange((prev) =>
      prev.map((group, idx) => (idx === groupIdx ? appendBlankModifier(group) : group)),
    );
  };

  const updateModifier = (
    groupIdx: number,
    modIdx: number,
    patch: Partial<EditableModifier>,
  ) => {
    onModifierGroupsChange((prev) =>
      prev.map((group, gIdx) =>
        gIdx === groupIdx ? applyModifierPatch(group, modIdx, patch) : group,
      ),
    );
  };

  const toggleAllowedSubstitute = (
    groupIdx: number,
    modIdx: number,
    targetName: string,
    checked: boolean,
  ) => {
    onModifierGroupsChange((prev) =>
      prev.map((group, gIdx) =>
        gIdx === groupIdx
          ? applyToggleAllowedSubstitute(group, modIdx, targetName, checked)
          : group,
      ),
    );
  };

  const removeModifier = (groupIdx: number, modIdx: number) => {
    onModifierGroupsChange((prev) =>
      prev.map((group, gIdx) =>
        gIdx === groupIdx ? applyRemoveModifier(group, modIdx) : group,
      ),
    );
  };

  return (
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
  );
}
