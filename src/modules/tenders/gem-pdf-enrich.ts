import type { ExtractedTender } from '../../shared/types';
import { postDebugLog } from '../../shared/utils/messaging';
import { fetchGemBidPdfByDocId, fetchGemBidPdfOnPage } from './gem-pdf-fetch';
import { parseGemBidPdfText, isJunkTenderFieldValue } from './gem-pdf-parser';

function applyPdfField(current: string, parsed: string): string {
  const next = parsed.trim();
  if (next) return next;
  if (isJunkTenderFieldValue(current)) return '';
  return current;
}

export function applyPdfDetailsToTender(
  tender: ExtractedTender,
  pdfText: string,
  gemDocUrl?: string,
  gemDocId?: string,
): ExtractedTender {
  const details = parseGemBidPdfText(pdfText);
  const docUrl = gemDocUrl || tender.gemDocUrl;
  const docId = gemDocId || tender.gemDocId;
  const preBidAt = details.preBidAt || tender.preBidAt;
  const preBidVenue = details.preBidAddress || tender.preBidVenue;
  const hasPreBid = Boolean(preBidAt.trim() || preBidVenue.trim());

  // #region agent log
  postDebugLog({
    hypothesisId: 'H10',
    location: 'gem-pdf-enrich.ts:applyPdfDetailsToTender',
    message: 'parsed pdf fields',
    data: {
      bidNo: tender.bidNo,
      preBidAt,
      preBidVenue,
      rate: details.rate,
      additionalReqLen: details.additionalRequirements.length,
      noPreBid: !hasPreBid && details.noPreBid,
    },
  });
  if (!hasPreBid) {
    const idx = pdfText.search(/pre\s*[- ]?\s*bid/i);
    const snippet =
      idx >= 0
        ? pdfText.slice(Math.max(0, idx - 40), idx + 500).replace(/\s+/g, ' ')
        : pdfText.slice(0, 500).replace(/\s+/g, ' ');
    postDebugLog({
      hypothesisId: 'H11',
      location: 'gem-pdf-enrich.ts:applyPdfDetailsToTender',
      message: 'prebid parse miss snippet',
      data: { bidNo: tender.bidNo, snippet: snippet.slice(0, 500) },
    });
  }
  // #endregion

  return {
    ...tender,
    preBidAt: applyPdfField(tender.preBidAt, details.preBidAt),
    preBidVenue: applyPdfField(tender.preBidVenue, details.preBidAddress),
    noPreBid: hasPreBid ? false : details.noPreBid || tender.noPreBid,
    ministry: applyPdfField(tender.ministry, details.ministry),
    organisation: applyPdfField(tender.organisation || tender.department, details.organisation),
    consigneeOfficer: applyPdfField(
      tender.consigneeOfficer || tender.officerName,
      details.consigneeOfficer,
    ),
    department: applyPdfField(tender.organisation || tender.department, details.organisation),
    officerName: applyPdfField(
      tender.consigneeOfficer || tender.officerName,
      details.consigneeOfficer,
    ),
    address: applyPdfField(tender.address, details.address),
    description: applyPdfField(tender.description, details.description),
    additionalRequirements: applyPdfField(
      tender.additionalRequirements,
      details.additionalRequirements,
    ),
    status: 'not_filed',
    outcome: '',
    gemDocUrl: docUrl || tender.gemDocUrl,
    gemDocId: docId || tender.gemDocId,
    notes: [
      tender.notes,
      details.preBidAt && `Pre-Bid: ${details.preBidAt}`,
      details.preBidAddress && `Pre-Bid Venue: ${details.preBidAddress}`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

function resolveDocId(tender: ExtractedTender): string {
  if (tender.gemDocId) return tender.gemDocId;
  const fromUrl = tender.gemDocUrl.match(/(?:showbidDocument|downloadBidDocument)\/(\d+)/i)?.[1];
  return fromUrl ?? '';
}

export async function enrichTenderFromPdf(
  tender: ExtractedTender,
  tabId?: number,
): Promise<{ tender: ExtractedTender; ok: boolean; reason?: string }> {
  const docId = resolveDocId(tender);
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/bcae18f5-5314-4ad9-8289-d7be847351ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3941a9'},body:JSON.stringify({sessionId:'3941a9',runId:'post-fix',hypothesisId:'H1',location:'gem-pdf-enrich.ts:45',message:'enrichTenderFromPdf start',data:{bidNo:tender.bidNo,hasDocId:!!docId,hasDocUrl:!!tender.gemDocUrl,hasTabId:!!tabId},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!docId && !tender.gemDocUrl) {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/bcae18f5-5314-4ad9-8289-d7be847351ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3941a9'},body:JSON.stringify({sessionId:'3941a9',runId:'post-fix',hypothesisId:'H1',location:'gem-pdf-enrich.ts:47',message:'enrichTenderFromPdf skipped missing doc reference',data:{bidNo:tender.bidNo},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return { tender, ok: false, reason: 'missing_doc_reference' };
  }

  try {
    const pdfText = await fetchGemBidPdfByDocId(docId, tender.gemDocUrl, tabId);
    const docUrl =
      tender.gemDocUrl ||
      (docId ? `https://bidplus.gem.gov.in/showbidDocument/${docId}` : '');
    return { tender: applyPdfDetailsToTender(tender, pdfText, docUrl, docId), ok: true };
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/bcae18f5-5314-4ad9-8289-d7be847351ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3941a9'},body:JSON.stringify({sessionId:'3941a9',runId:'post-fix',hypothesisId:'H2',location:'gem-pdf-enrich.ts:60',message:'enrichTenderFromPdf failed',data:{bidNo:tender.bidNo,error:err instanceof Error ? err.message : 'unknown',docId,hasDocUrl:!!tender.gemDocUrl,hasTabId:!!tabId},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const reason = err instanceof Error ? err.message : 'unknown_pdf_fetch_error';
    return { tender, ok: false, reason };
  }
}

async function enrichTenderFromPdfWithFetcher(
  tender: ExtractedTender,
  fetchPdf: (docId: string, fallbackUrl: string) => Promise<string>,
): Promise<{ tender: ExtractedTender; ok: boolean; reason?: string }> {
  const docId = resolveDocId(tender);
  if (!docId && !tender.gemDocUrl) {
    return { tender, ok: false, reason: 'missing_doc_reference' };
  }

  try {
    const pdfText = await fetchPdf(docId, tender.gemDocUrl);
    const docUrl =
      tender.gemDocUrl ||
      (docId ? `https://bidplus.gem.gov.in/showbidDocument/${docId}` : '');
    return { tender: applyPdfDetailsToTender(tender, pdfText, docUrl, docId), ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown_pdf_fetch_error';
    return { tender, ok: false, reason };
  }
}

function summarizePdfEnrichment(
  tenders: ExtractedTender[],
  results: Array<{ tender: ExtractedTender; ok: boolean; reason?: string }>,
) {
  const enriched: ExtractedTender[] = [];
  let pdfFetched = 0;
  let pdfFailed = 0;
  const pdfFailureReasons: string[] = [];

  for (let i = 0; i < tenders.length; i += 1) {
    const tender = tenders[i];
    const result = results[i];
    enriched.push(result.tender);
    if (result.ok) pdfFetched += 1;
    else if (resolveDocId(tender) || tender.gemDocUrl) {
      pdfFailed += 1;
      const bid = tender.bidNo || 'UNKNOWN_BID';
      pdfFailureReasons.push(`${bid}: ${result.reason || 'pdf_read_failed'}`);
    }
  }

  return { tenders: enriched, pdfFetched, pdfFailed, pdfFailureReasons };
}

/** Enrich on the GeM page itself so authenticated cookies are available. */
export async function enrichTendersFromPdfsOnPage(tenders: ExtractedTender[]) {
  const results = await Promise.all(
    tenders.map((tender) =>
      enrichTenderFromPdfWithFetcher(tender, (docId, fallbackUrl) =>
        fetchGemBidPdfOnPage(docId, fallbackUrl, tender.bidNo),
      ),
    ),
  );
  return summarizePdfEnrichment(tenders, results);
}

export async function enrichTendersFromPdfs(
  tenders: ExtractedTender[],
  tabId?: number,
): Promise<{
  tenders: ExtractedTender[];
  pdfFetched: number;
  pdfFailed: number;
  pdfFailureReasons: string[];
}> {
  const results = await Promise.all(
    tenders.map((tender) => enrichTenderFromPdf(tender, tabId)),
  );
  return summarizePdfEnrichment(tenders, results);
}
