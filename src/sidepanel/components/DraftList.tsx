import type { CaptureDraft } from '../../shared/types';
import { getDraftSubtitle, getDraftTitle } from '../../shared/utils/draft-display';

interface DraftListProps {
  drafts: CaptureDraft[];
  emptyMessage?: string;
  clearLabel?: string;
  readOnly?: boolean;
  onClear?: () => void | Promise<void>;
  onDelete?: (draft: CaptureDraft) => void | Promise<void>;
  onSelect: (draft: CaptureDraft) => void;
}

export function DraftList({
  drafts,
  emptyMessage = 'No items yet.',
  clearLabel,
  readOnly = false,
  onClear,
  onDelete,
  onSelect,
}: DraftListProps) {
  if (!drafts.length) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {onClear && clearLabel && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">{drafts.length} item(s)</p>
          <button
            type="button"
            onClick={() => void onClear()}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            {clearLabel}
          </button>
        </div>
      )}
      <div className="space-y-2">
        {drafts.map((draft) => (
          <div key={draft.id} className="flex gap-2">
            <button
              type="button"
              onClick={() => onSelect(draft)}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-blue-300"
            >
              <p className="truncate text-sm font-medium text-slate-900">{getDraftTitle(draft)}</p>
              <p className="truncate text-xs text-slate-500">{getDraftSubtitle(draft)}</p>
              {readOnly && (
                <p className="mt-1 text-[11px] font-medium text-emerald-600">Saved to FlexHRM</p>
              )}
            </button>
            {onDelete && (
              <button
                type="button"
                title="Delete"
                aria-label={`Delete ${getDraftTitle(draft)}`}
                onClick={() => void onDelete(draft)}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-400 hover:border-red-300 hover:text-red-600"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
