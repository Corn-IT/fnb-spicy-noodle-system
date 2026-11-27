import type * as React from 'react';
import type { PosDraftResponse } from '@fnb/shared';
import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

export interface PosDraftsPanelProps {
  drafts: PosDraftResponse[];
  activeDraftId?: string | null;
  canDelete: boolean;
  disabled?: boolean;
  gridStyle?: React.CSSProperties;
  onResume: (draft: PosDraftResponse) => void;
  onDelete: (draft: PosDraftResponse) => void;
}

export function PosDraftsPanel({ drafts, activeDraftId, canDelete, disabled = false, gridStyle, onResume, onDelete }: PosDraftsPanelProps) {
  if (drafts.length === 0) return null;
  return (
    <section data-testid="pos-parked-drafts" className="border-t pt-3">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Giỏ tạm đã lưu ({drafts.length})
      </h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(144px,1fr))] gap-3" style={gridStyle}>
        {drafts.map((draft) => {
          const target = draft.orderType === 'TAKEAWAY'
            ? 'Mang về'
            : draft.orderType === 'DINE_IN'
              ? draft.tableName ?? 'Chưa gán bàn'
              : 'Chưa gán bàn';
          return (
            <div
              key={draft.id}
              data-testid={`pos-draft-card-${draft.id}`}
              className={`relative aspect-square min-w-0 overflow-hidden rounded-2xl border-2 shadow-xs ${activeDraftId === draft.id ? 'border-primary bg-primary/10' : 'border-indigo-500/60 bg-indigo-500/5'}`}
            >
              <button
                type="button"
                data-testid={`pos-resume-draft-${draft.id}`}
                onClick={() => onResume(draft)}
                disabled={disabled}
                aria-pressed={activeDraftId === draft.id}
                className="absolute inset-x-0 top-0 bottom-12 flex w-full min-w-0 flex-col justify-between p-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-50"
              >
                <span className="block w-full truncate text-base font-bold" title={target}>{target} · {draft.items.length} món</span>
                <span className="block text-xs text-muted-foreground">Đã lưu {new Date(draft.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
              </button>
              {canDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  data-testid={`pos-delete-draft-${draft.id}`}
                  disabled={disabled}
                  aria-label={`Xoá giỏ tạm ${target}`}
                  onClick={() => onDelete(draft)}
                  className="absolute bottom-1 right-1 h-11 w-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
