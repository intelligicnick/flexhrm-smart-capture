import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export interface PdfPageText {
  pageNumber: number;
  text: string;
}

type PdfTextItem = {
  str: string;
  x: number;
  y: number;
};

type PdfTextContentItem = {
  str?: string;
  transform?: number[];
};

function pdfTextItems(content: { items: PdfTextContentItem[] }): PdfTextItem[] {
  const items: PdfTextItem[] = [];
  for (const item of content.items) {
    if (!item.str?.trim() || !item.transform) continue;
    items.push({
      str: item.str,
      x: item.transform[4],
      y: Math.round(item.transform[5]),
    });
  }
  return items;
}

/** Group PDF glyphs by Y position so GeM label/value lines stay intact. */
export function extractPageTextWithLines(content: { items: PdfTextContentItem[] }): string {
  const items = pdfTextItems(content);
  if (items.length === 0) return '';

  const lines = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    const bucket = lines.get(item.y) ?? [];
    bucket.push(item);
    lines.set(item.y, bucket);
  }

  return [...lines.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) =>
      row
        .sort((a, b) => a.x - b.x)
        .map((part) => part.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}

export async function extractPdfText(data: ArrayBuffer): Promise<{
  fullText: string;
  pages: PdfPageText[];
  pageCount: number;
}> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: PdfPageText[] = [];

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = extractPageTextWithLines(content as { items: PdfTextContentItem[] });
    pages.push({ pageNumber: i, text });
  }

  return {
    fullText: pages.map((p) => p.text).join('\n\n'),
    pages,
    pageCount: pdf.numPages,
  };
}

export async function extractPdfPage(
  data: ArrayBuffer,
  pageNumber: number,
): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  return extractPageTextWithLines(content as { items: PdfTextContentItem[] });
}

export function isPdfUrl(url: string): boolean {
  return /\.pdf($|\?)/i.test(url) || url.includes('application/pdf');
}

export async function fetchPdfAsArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
  return response.arrayBuffer();
}
