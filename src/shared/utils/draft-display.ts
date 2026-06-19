import type { CaptureDraft, CaptureType } from '../types';

const CAPTURE_TYPE_LABELS: Record<CaptureType, string> = {
  text: 'Full page',
  selection: 'Selection',
  section: 'Section',
  table: 'Table',
  image: 'Image',
  form: 'Form',
  pdf: 'PDF',
  'pdf-page': 'PDF page',
  screenshot: 'Screenshot',
  resume: 'Resume',
  'gem-tender': 'GeM tender',
  'gem-tenders': 'GeM tenders',
  'gem-contracts': 'GeM contracts',
};

export function formatCaptureType(type: CaptureType): string {
  return CAPTURE_TYPE_LABELS[type] ?? type;
}

export function getDraftTitle(draft: CaptureDraft): string {
  return (
    draft.extracted.fullName ||
    draft.metadata.sourceTitle ||
    draft.rawContent.slice(0, 80) ||
    'Untitled capture'
  );
}

export function getDraftSubtitle(draft: CaptureDraft): string {
  const capturedAt = new Date(draft.metadata.capturedAt);
  const time = Number.isNaN(capturedAt.getTime())
    ? ''
    : capturedAt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  const parts = [
    draft.metadata.sourceSite,
    formatCaptureType(draft.metadata.captureType),
    time,
  ].filter(Boolean);
  return parts.join(' · ');
}
