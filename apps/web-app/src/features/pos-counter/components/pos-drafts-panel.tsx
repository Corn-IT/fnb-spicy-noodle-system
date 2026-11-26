import type { PosDraftResponse } from '@fnb/shared';
import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

export interface PosDraftsPanelProps {
  drafts: PosDraftResponse[];
  activeDraftId?: string | null;
  canDelete: boolean;
  onResume: (draft: PosDraftResponse) => void;
  onDelete: (draft: PosDraftResponse) => void;
}

export function PosDraftsPanel({ drafts, activeDraftId, canDelete, onResume, onDelete }: PosDraftsPanelProps) {
  if (drafts.length === 0) return null;
  return (
    <section data-testid="pos-parked-drafts" className="border-t pt-3">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Giỏ tạm đã lưu ({drafts.length})
      </h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
        {drafts.map((draft) => {
          const target = draft.orderType === 'TAKEAWAY'
            ? 'Mang về'
            : draft.orderType === 'DINE_IN'
              ? draft.tableName ?? 'Chưa gán bàn'
              : 'Chưa gán bàn';
          return (
            <div key={draft.id} className="flex min-w-0 items-stretch gap-1">
              <button
                type="button"
                data-testid={`pos-resume-draft-${draft.id}`}
                onClick={() => onResume(draft)}
                className={`min-h-11 min-w-0 flex-1 rounded-lg border px-3 py-2 text-left text-xs hover:bg-muted ${activeDraftId === draft.id ? 'border-primary bg-primary/10' : ''}`}
              >
                <span className="block truncate font-bold">{target} · {draft.items.length} món</span>
                <span className="block text-muted-foreground">Đã lưu {new Date(draft.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
              </button>
              {canDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  data-testid={`pos-delete-draft-${draft.id}`}
                  aria-label={`Xoá giỏ tạm ${target}`}
                  onClick={() => onDelete(draft)}
                  className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
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
