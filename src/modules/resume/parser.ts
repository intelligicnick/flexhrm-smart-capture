import { extractLocally, isResumeLike } from '../ai/extraction';
import type { CaptureDraft, CaptureMetadata } from '../../shared/types';
import { EMPTY_EXTRACTION } from '../../shared/types';

export function buildDraftFromContent(params: {
  content: string;
  htmlContent?: string;
  imageBase64?: string;
  tableData?: Record<string, unknown>[];
  metadata: CaptureMetadata;
}): CaptureDraft {
  const now = new Date().toISOString();
  const localExtraction = extractLocally(params.content);
  const resumeDetected = isResumeLike(params.content, params.metadata.sourceUrl);

  return {
    id: crypto.randomUUID(),
    rawContent: params.content,
    htmlContent: params.htmlContent,
    imageBase64: params.imageBase64,
    tableData: params.tableData,
    extracted: localExtraction,
    metadata: {
      ...params.metadata,
      captureType: resumeDetected ? 'resume' : params.metadata.captureType,
    },
    saveTarget: resumeDetected ? 'candidate' : 'candidate',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

export function enrichDraftWithExtraction(
  draft: CaptureDraft,
  extracted: typeof EMPTY_EXTRACTION,
): CaptureDraft {
  return {
    ...draft,
    extracted,
    status: 'review',
    updatedAt: new Date().toISOString(),
  };
}
