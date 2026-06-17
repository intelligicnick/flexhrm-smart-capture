import type { FieldConfidence } from '../types';

interface Props {
  field: string;
  label: string;
  value: string;
  confidence?: number;
  onChange: (value: string) => void;
  onDelete?: () => void;
}

export function FieldEditor({
  field,
  label,
  value,
  confidence,
  onChange,
  onDelete,
}: Props) {
  const pct = confidence !== undefined ? Math.round(confidence * 100) : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={field} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </label>
        <div className="flex items-center gap-2">
          {pct !== null && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                pct >= 80
                  ? 'bg-emerald-100 text-emerald-700'
                  : pct >= 50
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700'
              }`}
            >
              {pct}%
            </span>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <input
        id={field}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
      />
    </div>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  return (
    <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
      {pct}% confidence
    </span>
  );
}

export function DuplicateWarning({
  matches,
}: {
  matches: Array<{ type: string; name: string; matchReason: string[] }>;
}) {
  if (!matches.length) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">Possible duplicates found</p>
      <ul className="mt-2 list-disc pl-5">
        {matches.map((m, i) => (
          <li key={i}>
            {m.name || 'Unknown'} ({m.type}) — matched by {m.matchReason.join(', ')}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function fieldConfidencesFromExtracted(
  extracted: Record<string, unknown>,
): FieldConfidence[] {
  const fields = [
    'fullName', 'mobile', 'email', 'address', 'currentLocation',
    'designation', 'currentCompany', 'linkedInUrl',
  ];
  return fields
    .map((field) => ({
      field,
      value: String(extracted[field] ?? ''),
      confidence: 0.7,
    }))
    .filter((f) => f.value);
}
