import type { UserFacingError } from '../utils/api-error-messages';

interface StatusAlertProps {
  tone: 'ok' | 'error' | 'warning';
  title?: string;
  message: string;
  hint?: string;
}

const toneClasses: Record<StatusAlertProps['tone'], string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-rose-200 bg-rose-50 text-rose-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
};

export function StatusAlert({ tone, title, message, hint }: StatusAlertProps) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${toneClasses[tone]}`} role="alert">
      {title && <p className="font-semibold">{title}</p>}
      <p className={title ? 'mt-1' : undefined}>{message}</p>
      {hint && <p className="mt-2 text-xs opacity-90">{hint}</p>}
    </div>
  );
}

export function statusAlertFromError(error: UserFacingError, tone: 'error' | 'warning' = 'error') {
  return (
    <StatusAlert
      tone={tone}
      title={error.title}
      message={error.message}
      hint={error.hint}
    />
  );
}
