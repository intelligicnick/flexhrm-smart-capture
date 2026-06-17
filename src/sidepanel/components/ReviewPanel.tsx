import type { CaptureDraft, DuplicateMatch, SaveTargetType } from '../../shared/types';
import { FieldEditor, DuplicateWarning, ConfidenceBadge } from '../../shared/components/FieldEditor';

interface ReviewPanelProps {
  draft: CaptureDraft;
  duplicates: DuplicateMatch[];
  saving: boolean;
  message: string;
  readOnly?: boolean;
  onFieldChange: (field: keyof CaptureDraft['extracted'], value: string) => void;
  onSaveTargetChange: (target: SaveTargetType) => void;
  onSave: () => void;
}

export function ReviewPanel({
  draft,
  duplicates,
  saving,
  message,
  readOnly = false,
  onFieldChange,
  onSaveTargetChange,
  onSave,
}: ReviewPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ConfidenceBadge confidence={draft.extracted.overallConfidence} />
        <span className="text-xs text-slate-500">{draft.metadata.sourceSite}</span>
        {readOnly && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            Already saved
          </span>
        )}
      </div>

      <DuplicateWarning matches={duplicates} />

      {!readOnly && (
        <div>
          <label className="text-xs font-semibold text-slate-500">Save as</label>
          <select
            value={draft.saveTarget}
            onChange={(e) => onSaveTargetChange(e.target.value as SaveTargetType)}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="candidate">Candidate</option>
            <option value="lead">Lead</option>
            <option value="contact">Contact</option>
            <option value="employee">Employee</option>
          </select>
        </div>
      )}

      <div className="grid gap-3">
        <FieldEditor label="Full Name" field="fullName" value={draft.extracted.fullName} onChange={(v: string) => onFieldChange('fullName', v)} />
        <FieldEditor label="Email" field="email" value={draft.extracted.email} onChange={(v: string) => onFieldChange('email', v)} />
        <FieldEditor label="Mobile" field="mobile" value={draft.extracted.mobile} onChange={(v: string) => onFieldChange('mobile', v)} />
        <FieldEditor label="Designation" field="designation" value={draft.extracted.designation} onChange={(v: string) => onFieldChange('designation', v)} />
        <FieldEditor label="Current Company" field="currentCompany" value={draft.extracted.currentCompany} onChange={(v: string) => onFieldChange('currentCompany', v)} />
        <FieldEditor label="Location" field="currentLocation" value={draft.extracted.currentLocation} onChange={(v: string) => onFieldChange('currentLocation', v)} />
        <FieldEditor label="LinkedIn" field="linkedInUrl" value={draft.extracted.linkedInUrl} onChange={(v: string) => onFieldChange('linkedInUrl', v)} />
      </div>

      <details className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">Original source</summary>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-slate-600">
          {draft.rawContent.slice(0, 3000)}
        </pre>
      </details>

      {message && (
        <p className={`text-sm ${message.includes('failed') || message.includes('not configured') ? 'text-red-600' : 'text-emerald-600'}`}>
          {message}
        </p>
      )}

      {!readOnly && (
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save to FlexHRM'}
        </button>
      )}
    </div>
  );
}
