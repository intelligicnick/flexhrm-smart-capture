import type { CaptureType } from '../../shared/types';
import { extractLocally, isResumeLike } from '../ai/extraction';

export interface CaptureValidationResult {
  accepted: boolean;
  reason?: string;
}

const MIN_SELECTION_CHARS = 12;
const MIN_FULL_PAGE_CHARS = 200;

const JUNK_PATTERNS: RegExp[] = [
  /^showing\s+\d+\s*[-–]\s*\d+\s+records\b/i,
  /^\d+\s*[-–]\s*\d+\s+of\s+[\d,]+\s+records?\b/i,
  /^(login|logout|sign\s*in|sign\s*up|register|english|hindi|menu|home|back|next|prev|previous|submit|cancel|ok)$/i,
  /^"?(su|mo|tu|we|th|fr|sa)"?(,\s*"?[a-z]{2}"?){5,6}$/i,
  /^image:\s*(menu|logo|icon|banner|untitled)\b/i,
];

function normalize(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

function isJunkText(text: string): boolean {
  return JUNK_PATTERNS.some((pattern) => pattern.test(text));
}

function hasUsefulSignals(content: string, sourceUrl: string): boolean {
  const extracted = extractLocally(content);
  if (extracted.email || extracted.mobile || extracted.linkedInUrl) return true;
  if (extracted.fullName.length >= 3) return true;
  if (isResumeLike(content, sourceUrl)) return true;
  if (/GEM\/\d{4}\/B\/\d+/i.test(content)) return true;
  return false;
}

function isCalendarTable(text: string): boolean {
  const dayHits = (text.match(/"(su|mo|tu|we|th|fr|sa)"/gi) ?? []).length;
  return dayHits >= 5;
}

export function validateCapture(
  content: string,
  captureType: CaptureType,
  sourceUrl = '',
): CaptureValidationResult {
  const text = normalize(content);

  if (!text) {
    return { accepted: false, reason: 'Nothing to capture — highlight text or pick a section first.' };
  }

  if (isJunkText(text)) {
    return {
      accepted: false,
      reason: 'That looks like page navigation or pagination, not useful data.',
    };
  }

  const useful = hasUsefulSignals(text, sourceUrl);

  if (text.length < 8 && !useful) {
    return { accepted: false, reason: 'Selection is too short to save.' };
  }

  if (captureType === 'text' && text.length < MIN_FULL_PAGE_CHARS && !useful) {
    return {
      accepted: false,
      reason: 'Page text is too short. Highlight the specific block you need instead.',
    };
  }

  if (
    (captureType === 'selection' || captureType === 'section') &&
    text.length < MIN_SELECTION_CHARS &&
    !useful
  ) {
    return {
      accepted: false,
      reason: 'Highlight a name, contact details, or tender block before saving.',
    };
  }

  if (captureType === 'table' && isCalendarTable(text) && !useful) {
    return {
      accepted: false,
      reason: 'That table looks like a calendar or date picker.',
    };
  }

  if (captureType === 'image' && text.length < 30 && !useful) {
    return {
      accepted: false,
      reason: 'Image label is too generic. Capture a section that includes context.',
    };
  }

  return { accepted: true };
}
