const PDF_MIME_TYPES = new Set(['application/pdf', 'application/x-pdf']);

export function isPdfFile(file: { name: string; type?: string }): boolean {
  const type = (file.type || '').toLowerCase();
  if (PDF_MIME_TYPES.has(type)) return true;
  if (/\.pdf$/i.test(file.name)) return true;
  if (!type || type === 'application/octet-stream') return /\.pdf$/i.test(file.name);
  return false;
}

export function normalizePdfMimeType(name: string, mimeType = ''): string {
  if (/\.pdf$/i.test(name)) return 'application/pdf';
  const type = mimeType.toLowerCase();
  if (PDF_MIME_TYPES.has(type)) return 'application/pdf';
  return mimeType || 'application/pdf';
}

/** GeM expects a clean `.pdf` filename — strip unsafe chars and enforce lowercase extension. */
export function sanitizeGemPdfFileName(name: string): string {
  const trimmed = name.trim().replace(/[/\\:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
  const withoutExt = trimmed.replace(/\.pdf$/i, '').replace(/\.+$/, '');
  const base = withoutExt || 'document';
  return `${base}.pdf`;
}

/** True when buffer contains a PDF header (%PDF-). GeM rejects files without this. */
export function bufferLooksLikePdf(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 5) return false;
  const view = new Uint8Array(buffer.slice(0, Math.min(1024, buffer.byteLength)));
  for (let index = 0; index <= view.length - 5; index += 1) {
    if (
      view[index] === 0x25 &&
      view[index + 1] === 0x50 &&
      view[index + 2] === 0x44 &&
      view[index + 3] === 0x46 &&
      view[index + 4] === 0x2d
    ) {
      return true;
    }
  }
  return false;
}

/** Build a File GeM accepts: valid PDF bytes, application/pdf MIME, sanitized name. */
export function createGemPdfFile(buffer: ArrayBuffer, fileName: string): File {
  const name = sanitizeGemPdfFileName(fileName);
  const pdfBlob = new Blob([buffer], { type: 'application/pdf' });
  return new File([pdfBlob], name, { type: 'application/pdf', lastModified: Date.now() });
}

export async function createGemPdfFileFromBlob(blob: Blob, fileName: string): Promise<File> {
  return createGemPdfFile(await blob.arrayBuffer(), fileName);
}

export function validatePdfForGem(buffer: ArrayBuffer, fileName: string): string | null {
  if (!buffer.byteLength) return `"${fileName}" is empty.`;
  if (!/\.pdf$/i.test(fileName) && !bufferLooksLikePdf(buffer)) {
    return `"${fileName}" is not a PDF. GeM only accepts .pdf files.`;
  }
  if (!bufferLooksLikePdf(buffer)) {
    return `"${fileName}" is not a valid PDF (missing %PDF- header). Re-export it as PDF and try again.`;
  }
  return null;
}
