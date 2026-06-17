import { extractPdfText } from '../pdf/extractor';
import { postDebugLog } from '../../shared/utils/messaging';

const MIN_EXTRACTED_TEXT_LEN = 40;

const GEM_BASE = 'https://bidplus.gem.gov.in';

type TabPageSnapshot = {
  pageText?: string;
  urls?: string[];
};

type TabFetchResult =
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; base64: string }
  | { error: string };

function buildGemPdfUrls(docId: string, fallbackUrl = ''): Set<string> {
  const pdfUrls = new Set<string>();
  if (docId) {
    pdfUrls.add(`${GEM_BASE}/bidding/downloadBidDocument/${docId}`);
    pdfUrls.add(`${GEM_BASE}/showbidDocument/${docId}`);
  }
  if (fallbackUrl) pdfUrls.add(fallbackUrl);
  return pdfUrls;
}

function isPdfBuffer(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 5));
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function decodeHtmlBuffer(buffer: ArrayBuffer): string {
  const html = new TextDecoder().decode(buffer.slice(0, Math.min(buffer.byteLength, 500000)));
  if (!html.includes('<html') && !html.includes('<body')) {
    throw new Error('Not PDF or readable HTML');
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text.length > 200) return text;
  throw new Error('Not PDF or readable HTML');
}

function debugIngest(payload: Record<string, unknown>): void {
  postDebugLog(payload);
}

async function extractPdfTextFromBuffer(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    parts.push(
      content.items.map((item) => ('str' in item ? item.str : '')).join(' '),
    );
  }
  const text = parts.join('\n\n').trim();
  if (text.length > 0) return text;
  throw new Error('PDF contained no extractable text.');
}

async function extractTextFromBuffer(buffer: ArrayBuffer, contentType: string): Promise<string> {
  if (contentType.includes('pdf') || isPdfBuffer(buffer)) {
    return extractPdfTextFromBuffer(buffer);
  }
  return decodeHtmlBuffer(buffer);
}

export function collectGemPdfUrlsFromPage(root: ParentNode = document): string[] {
  const urls = new Set<string>();
  const push = (value: string | null | undefined) => {
    if (!value || value.length > 500) return;
    try {
      urls.add(new URL(value, window.location.href).href);
    } catch {
      if (value.startsWith('http')) urls.add(value);
    }
  };

  for (const el of root.querySelectorAll('embed, iframe, object, a[href]')) {
    push(el.getAttribute('src'));
    push(el.getAttribute('data'));
    push((el as HTMLAnchorElement).href);
  }

  for (const el of root.querySelectorAll('[onclick], [ng-click]')) {
    const attr = `${el.getAttribute('onclick') ?? ''} ${el.getAttribute('ng-click') ?? ''}`;
    const match = attr.match(/(?:showbidDocument|downloadBidDocument)\/?(\d+)/i);
    if (match) {
      push(`${window.location.origin}/showbidDocument/${match[1]}`);
      push(`${window.location.origin}/bidding/downloadBidDocument/${match[1]}`);
    }
  }

  return [...urls];
}

async function fetchAndExtractPdf(url: string): Promise<string> {
  const response = await fetch(url, { credentials: 'include' });
  debugIngest({
    hypothesisId: 'H2',
    location: 'gem-pdf-fetch.ts:fetchAndExtractPdf',
    message: 'page fetch response',
    data: {
      url,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type') || '',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get('content-type') || '';
  const buffer = await response.arrayBuffer();

  if (/showbidDocument/i.test(url) && !isPdfBuffer(buffer)) {
    try {
      return decodeHtmlBuffer(buffer);
    } catch {
      // Fall through to generic extraction.
    }
  }

  return extractTextFromBuffer(buffer, contentType);
}

async function readGemPageSnapshot(tabId: number): Promise<TabPageSnapshot> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const urls: string[] = [];
      const push = (value: string | null | undefined) => {
        if (!value || value.length > 500) return;
        try {
          urls.push(new URL(value, window.location.href).href);
        } catch {
          if (value.startsWith('http')) urls.push(value);
        }
      };

      for (const el of document.querySelectorAll('embed, iframe, object, a[href]')) {
        push(el.getAttribute('src'));
        push(el.getAttribute('data'));
        push((el as HTMLAnchorElement).href);
      }

      for (const el of document.querySelectorAll('[onclick], [ng-click]')) {
        const attr = `${el.getAttribute('onclick') ?? ''} ${el.getAttribute('ng-click') ?? ''}`;
        const match = attr.match(/(?:showbidDocument|downloadBidDocument)\/?(\d+)/i);
        if (match) {
          push(`${window.location.origin}/showbidDocument/${match[1]}`);
          push(`${window.location.origin}/bidding/downloadBidDocument/${match[1]}`);
        }
      }

      return { pageText: document.body?.innerText ?? '', urls: [...new Set(urls)] };
    },
  });

  return (result as TabPageSnapshot) ?? {};
}

async function fetchAndExtractPdfInTab(tabId: number, url: string): Promise<string> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [url],
    func: async (targetUrl: string): Promise<TabFetchResult> => {
      try {
        const response = await fetch(targetUrl, { credentials: 'include' });
        if (!response.ok) return { error: `HTTP ${response.status}` };

        const contentType = response.headers.get('content-type') || '';
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer.slice(0, 5));
        const isPdf =
          bytes[0] === 0x25 &&
          bytes[1] === 0x50 &&
          bytes[2] === 0x44 &&
          bytes[3] === 0x46;

        if (contentType.includes('pdf') || isPdf) {
          const arr = new Uint8Array(buffer);
          let binary = '';
          const chunkSize = 0x8000;
          for (let i = 0; i < arr.length; i += chunkSize) {
            binary += String.fromCharCode.apply(
              null,
              Array.from(arr.subarray(i, i + chunkSize)),
            );
          }
          return { kind: 'pdf', base64: btoa(binary) };
        }

        const html = new TextDecoder().decode(
          buffer.slice(0, Math.min(buffer.byteLength, 500000)),
        );
        if (html.includes('<html') || html.includes('<body')) {
          const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, '\n')
            .replace(/\s+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          if (text.length > 200) return { kind: 'text', text };
        }

        return { error: 'Not PDF or readable HTML' };
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'fetch failed' };
      }
    },
  });

  const data = result as TabFetchResult | undefined;
  if (!data || 'error' in data) {
    throw new Error(data?.error || 'Empty tab fetch result');
  }
  if (data.kind === 'text') return data.text;

  const binary = atob(data.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const { fullText } = await extractPdfText(bytes.buffer);
  return fullText.trim();
}

async function tryUrlsForText(
  urls: Iterable<string>,
  fetcher: (url: string) => Promise<string>,
): Promise<string> {
  let lastError = 'No URLs attempted';
  for (const url of urls) {
    try {
      const text = await fetcher(url);
      debugIngest({
        hypothesisId: 'H4',
        location: 'gem-pdf-fetch.ts:tryUrlsForText',
        message: 'parsed text length',
        data: { url, textLength: text.length },
      });
      if (text.length > MIN_EXTRACTED_TEXT_LEN) return text;
      lastError = `Extracted text too short (${text.length} chars) from ${url}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'unknown';
      debugIngest({
        hypothesisId: 'H2',
        location: 'gem-pdf-fetch.ts:tryUrlsForText',
        message: 'url fetch failed',
        data: { url, error: lastError },
      });
    }
  }
  throw new Error(
    `Could not download bid PDF. Stay logged in to GeM and try again. (${lastError})`,
  );
}

async function fetchGemBidPdfWithTabFallback(
  docId: string,
  fallbackUrl: string,
  tabId?: number,
): Promise<string> {
  const pdfUrls = buildGemPdfUrls(docId, fallbackUrl);
  if (pdfUrls.size === 0) {
    throw new Error('No GeM document ID found for this tender.');
  }

  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/bcae18f5-5314-4ad9-8289-d7be847351ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3941a9'},body:JSON.stringify({sessionId:'3941a9',runId:'post-fix',hypothesisId:'H3',location:'gem-pdf-fetch.ts:fetchGemBidPdfWithTabFallback',message:'URL candidates prepared',data:{docId,urlCount:pdfUrls.size,hasTabId:!!tabId},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  try {
    return await tryUrlsForText(pdfUrls, fetchAndExtractPdf);
  } catch {
    // Background fetch often lacks GeM session cookies — retry in the active tab.
  }

  if (!tabId) {
    throw new Error('Could not download bid PDF. Stay logged in to GeM and try again.');
  }

  try {
    const snapshot = await readGemPageSnapshot(tabId);
    for (const url of snapshot.urls ?? []) {
      if (/downloadBidDocument|showbidDocument|\.pdf/i.test(url)) {
        pdfUrls.add(url);
      }
    }

    const pageText = snapshot.pageText?.trim() ?? '';
    if (
      pageText.length > 300 &&
      /pre\s*bid|estimated|item description|bid number/i.test(pageText)
    ) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/bcae18f5-5314-4ad9-8289-d7be847351ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3941a9'},body:JSON.stringify({sessionId:'3941a9',runId:'post-fix',hypothesisId:'H2',location:'gem-pdf-fetch.ts:fetchGemBidPdfWithTabFallback',message:'using tab page text fallback',data:{textLength:pageText.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return pageText;
    }
  } catch {
    // Continue with tab-context fetch attempts.
  }

  return tryUrlsForText(pdfUrls, (url) => fetchAndExtractPdfInTab(tabId, url));
}

/** Fetch bid PDF/HTML using the active GeM page session (content-script context). */
export async function fetchGemBidPdfOnPage(
  docId: string,
  fallbackUrl = '',
  bidNo = '',
): Promise<string> {
  const pdfUrls = buildGemPdfUrls(docId, fallbackUrl);
  if (pdfUrls.size === 0) {
    throw new Error('No GeM document ID found for this tender.');
  }

  const scopedRoot =
    bidNo
      ? document.querySelector(`[data-flexhrm-bid="${bidNo.toUpperCase()}"]`)
      : null;
  if (scopedRoot) {
    for (const url of collectGemPdfUrlsFromPage(scopedRoot)) {
      if (/downloadBidDocument|showbidDocument/i.test(url)) {
        pdfUrls.add(url);
      }
    }
  }

  debugIngest({
    hypothesisId: 'H6',
    location: 'gem-pdf-fetch.ts:fetchGemBidPdfOnPage',
    message: 'page-context fetch start',
    data: { docId, urlCount: pdfUrls.size },
  });

  return tryUrlsForText(pdfUrls, fetchAndExtractPdf);
}

export async function fetchGemBidPdfByDocId(
  docId: string,
  fallbackUrl = '',
  tabId?: number,
): Promise<string> {
  return fetchGemBidPdfWithTabFallback(docId, fallbackUrl, tabId);
}

export async function fetchGemBidPdfText(
  pageUrl: string,
  tabId?: number,
): Promise<string> {
  const docId = pageUrl.match(/showbidDocument\/(\d+)/i)?.[1];
  if (!docId) throw new Error('Not a GeM bid document page.');

  try {
    return await fetchGemBidPdfWithTabFallback(docId, pageUrl, tabId);
  } catch {
    throw new Error(
      'Could not read the GeM bid PDF. Wait for the document to fully load, then click Extract PDF Details again.',
    );
  }
}
