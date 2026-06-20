import { describe, expect, it } from 'vitest';
import {
  bufferLooksLikePdf,
  createGemPdfFile,
  isPdfFile,
  normalizePdfMimeType,
  sanitizeGemPdfFileName,
  validatePdfForGem,
} from '../src/shared/utils/pdf-file';

describe('pdf-file', () => {
  it('accepts common PDF mime types and extensions', () => {
    expect(isPdfFile({ name: 'doc.pdf', type: 'application/pdf' })).toBe(true);
    expect(isPdfFile({ name: 'doc.pdf', type: 'application/x-pdf' })).toBe(true);
    expect(isPdfFile({ name: 'doc.pdf', type: '' })).toBe(true);
    expect(isPdfFile({ name: 'doc.pdf', type: 'application/octet-stream' })).toBe(true);
  });

  it('rejects non-pdf files', () => {
    expect(isPdfFile({ name: 'doc.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toBe(false);
    expect(isPdfFile({ name: 'data.bin', type: 'application/octet-stream' })).toBe(false);
  });

  it('normalizes mime type to application/pdf for pdf files', () => {
    expect(normalizePdfMimeType('Experience Criteria.pdf', 'application/x-pdf')).toBe('application/pdf');
    expect(normalizePdfMimeType('Experience Criteria.pdf', '')).toBe('application/pdf');
    expect(normalizePdfMimeType('notes.txt', 'text/plain')).toBe('text/plain');
  });

  it('sanitizes filenames for GeM upload', () => {
    expect(sanitizeGemPdfFileName('EXP-CRITERIA.PDF')).toBe('EXP-CRITERIA.pdf');
    expect(sanitizeGemPdfFileName('bad/name?.pdf')).toBe('bad_name_.pdf');
    expect(sanitizeGemPdfFileName('noext')).toBe('noext.pdf');
  });

  it('detects PDF magic bytes', () => {
    const pdf = new TextEncoder().encode('%PDF-1.4 sample').buffer;
    const txt = new TextEncoder().encode('hello').buffer;
    expect(bufferLooksLikePdf(pdf)).toBe(true);
    expect(bufferLooksLikePdf(txt)).toBe(false);
  });

  it('validates files before GeM upload', () => {
    const pdf = new TextEncoder().encode('%PDF-1.4').buffer;
    expect(validatePdfForGem(pdf, 'doc.pdf')).toBeNull();
    expect(validatePdfForGem(new ArrayBuffer(0), 'doc.pdf')).toMatch(/empty/i);
    expect(validatePdfForGem(new TextEncoder().encode('x').buffer, 'doc.pdf')).toMatch(/valid PDF/i);
  });

  it('creates files with application/pdf type', () => {
    const pdf = new TextEncoder().encode('%PDF-1.4').buffer;
    const file = createGemPdfFile(pdf, 'Experience Criteria.pdf');
    expect(file.type).toBe('application/pdf');
    expect(file.name).toBe('Experience Criteria.pdf');
  });
});
