import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export interface PdfPageText {
  pageNumber: number;
  text: string;
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
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
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
  return content.items
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isPdfUrl(url: string): boolean {
  return /\.pdf($|\?)/i.test(url) || url.includes('application/pdf');
}

export async function fetchPdfAsArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
  return response.arrayBuffer();
}
