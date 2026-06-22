import type { ExtractedTender, TenderStatus, TenderType } from '../../shared/types';
import { parseGemOrganisationFromText, normalizeGemPdfDate, normalizeGemPdfDateTime } from './gem-pdf-parser';

const BID_NO_RE = /GEM\/\d{4}\/B\/\d+/gi;

/** True only on GeM Seller Bids listing — extension activation page. */
export function isGemSellerBidsPage(url = window.location.href): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    return hostname === 'bidplus.gem.gov.in' && pathname.startsWith('/seller-bids');
  } catch {
    return false;
  }
}

/** True only on GeM bid workspace pages — not SSO/login/homepage. */
export function isGemTenderPage(url = window.location.href): boolean {
  return isGemSellerBidsPage(url);
}

export function isGemParticipatedPage(url = window.location.href): boolean {
  try {
    const { pathname } = new URL(url);
    if (!isGemTenderPage(url)) return false;
    return /participat/i.test(pathname) || /my-?bid/i.test(pathname);
  } catch {
    return false;
  }
}

export function isGemListingPage(url = window.location.href): boolean {
  return isGemSellerBidsPage(url);
}

function extractLabelValue(text: string, labels: string[]): string {
  for (const label of labels) {
    const patterns = [
      new RegExp(`${label}\\s*[:\\-]\\s*([^\\n]+)`, 'i'),
      new RegExp(`${label}\\s+([^\\n]+)`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]?.trim()) return match[1].trim();
    }
  }
  return '';
}

function extractDateAfterLabel(text: string, labels: string[], dateOnly = false): string {
  for (const label of labels) {
    const pattern = new RegExp(
      `${label}\\s*[:\\-]?\\s*(\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}(?:\\s+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?)`,
      'i',
    );
    const match = text.match(pattern);
    if (match?.[1]?.trim()) {
      const raw = match[1].trim();
      return dateOnly ? normalizeGemPdfDate(raw) : normalizeGemPdfDateTime(raw);
    }
  }
  return '';
}

function inferTenderType(items: string): TenderType {
  const lower = items.toLowerCase();
  if (lower.includes('travel') || lower.includes('ticket') || lower.includes('passage')) {
    return 'travel';
  }
  return 'manpower';
}

function inferStatus(participation: string, stage: string): TenderStatus {
  const p = participation.toLowerCase();
  const s = stage.toLowerCase();
  if (p.includes('participated') && !p.includes('not participated')) return 'filed';
  if (s.includes('technical')) return 'technical_not_open';
  if (p.includes('qualified') && !p.includes('disqualified')) return 'qualified';
  if (p.includes('disqualified')) return 'disqualified';
  if (p.includes('cancel')) return 'cancelled';
  return 'filed';
}

function parseGemOrganisationFields(text: string): {
  ministry: string;
  organisation: string;
  consigneeOfficer: string;
  address: string;
  department: string;
  officerName: string;
  additionalRequirements: string;
} {
  const fields = parseGemOrganisationFromText(text);

  if (
    fields.ministry ||
    fields.organisation ||
    fields.consigneeOfficer ||
    fields.address ||
    fields.additionalRequirements
  ) {
    return {
      ...fields,
      department: fields.organisation,
      officerName: fields.consigneeOfficer,
    };
  }

  const legacy = parseDepartmentBlock(text);
  return {
    ministry: '',
    organisation: legacy.department,
    consigneeOfficer: legacy.officerName,
    address: legacy.address,
    department: legacy.department,
    officerName: legacy.officerName,
    additionalRequirements: '',
  };
}

function parseDepartmentBlock(text: string): { department: string; officerName: string; address: string } {
  const block = extractLabelValue(text, [
    'Department Name and Address',
    'Department Name',
    'Department',
  ]);

  if (!block) {
    return { department: '', officerName: '', address: '' };
  }

  const lines = block
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length >= 2) {
    return {
      officerName: lines[0],
      department: lines[lines.length - 1],
      address: lines.slice(1).join(', '),
    };
  }

  return { department: block, officerName: '', address: '' };
}

function parseDepartmentFromCard(card: HTMLElement): string[] {
  const lines: string[] = [];
  const allText = card.innerText;

  const deptSection = allText.match(
    /Department Name and Address\s*([\s\S]*?)(?=Start Date|End Date|Quantity|Items|BID NO|Participat|$)/i,
  );
  if (deptSection?.[1]) {
    deptSection[1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^department/i.test(l))
      .forEach((l) => lines.push(l));
  }

  return lines;
}

export function countBidsInText(text: string): number {
  return new Set((text.match(/GEM\/\d{4}\/B\/\d+/gi) ?? []).map((b) => b.toUpperCase())).size;
}

function isTenderCardBlock(el: HTMLElement, bidNo: string): boolean {
  const block = el.innerText ?? '';
  if (!block.includes(bidNo)) return false;
  if (!block.includes('End Date') && !block.includes('Items')) return false;
  if (block.length > 6000) return false;
  return countBidsInText(block) === 1;
}

function findTenderCardForElement(el: HTMLElement, bidNo: string): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestLen = Infinity;
  let container: HTMLElement | null = el;

  for (let depth = 0; depth < 15 && container; depth += 1) {
    if (isTenderCardBlock(container, bidNo)) {
      const len = container.innerText?.length ?? 0;
      if (len < bestLen) {
        best = container;
        bestLen = len;
      }
    }
    container = container.parentElement;
  }

  return best;
}

export function findTenderCards(root: ParentNode = document): HTMLElement[] {
  const byBid = new Map<string, HTMLElement>();

  const candidates = Array.from(
    root.querySelectorAll('a, span, div, p, h1, h2, h3, h4, td, li'),
  );

  for (const el of candidates) {
    const text = el.textContent ?? '';
    const bidMatch = text.match(/GEM\/\d{4}\/B\/\d+/i);
    if (!bidMatch) continue;

    const bidNo = bidMatch[0].toUpperCase();
    const card = findTenderCardForElement(el as HTMLElement, bidNo);
    if (!card) continue;

    const existing = byBid.get(bidNo);
    const cardLen = card.innerText?.length ?? 0;
    const existingLen = existing?.innerText?.length ?? Infinity;
    if (!existing || cardLen < existingLen) {
      byBid.set(bidNo, card);
    }
  }

  return [...byBid.values()];
}

function findGemDocUrl(card: HTMLElement): { gemDocUrl: string; gemDocId: string } {
  const selectors = [
    'a[href*="showbidDocument"]',
    'a[href*="bidDocument"]',
    'a[href*="downloadBidDocument"]',
  ];
  for (const selector of selectors) {
    const anchor = card.querySelector(selector) as HTMLAnchorElement | null;
    if (anchor?.href) {
      const id = anchor.href.match(/(?:show)?bidDocument\/(\d+)|downloadBidDocument\/(\d+)/i);
      return { gemDocUrl: anchor.href, gemDocId: id?.[1] || id?.[2] || '' };
    }
  }

  for (const el of card.querySelectorAll('[onclick], [ng-click], a')) {
    const attr = `${el.getAttribute('onclick') ?? ''} ${el.getAttribute('ng-click') ?? ''}`;
    const match = attr.match(/(?:showbidDocument|downloadBidDocument)\/?(\d+)/i);
    if (match) {
      const id = match[1];
      return {
        gemDocUrl: `https://bidplus.gem.gov.in/showbidDocument/${id}`,
        gemDocId: id,
      };
    }
  }

  for (const anchor of card.querySelectorAll('a[href]')) {
    const link = anchor as HTMLAnchorElement;
    const label = link.textContent?.trim() ?? '';
    const hrefId =
      link.href.match(/(?:showbidDocument|downloadBidDocument)\/(\d+)/i)?.[1] ||
      '';
    if (hrefId) {
      return { gemDocUrl: link.href, gemDocId: hrefId };
    }
    if (/view|document|bid\s*doc/i.test(label) && /gem\.gov\.in/i.test(link.href)) {
      const id = link.href.match(/(\d{5,})/)?.[1] || '';
      if (id) return { gemDocUrl: link.href, gemDocId: id };
    }
  }

  const htmlMatch = card.innerHTML.match(
    /(?:showbidDocument|downloadBidDocument)[/"'](\d+)/i,
  );
  if (htmlMatch?.[1]) {
    const id = htmlMatch[1];
    return {
      gemDocUrl: `https://bidplus.gem.gov.in/showbidDocument/${id}`,
      gemDocId: id,
    };
  }

  return { gemDocUrl: '', gemDocId: '' };
}

function parseTenderCard(card: HTMLElement, sourceUrl: string): ExtractedTender | null {
  const text = card.innerText.replace(/\s+/g, ' ').trim();
  const bidMatch = text.match(/GEM\/\d{4}\/B\/\d+/i);
  if (!bidMatch) return null;

  const bidNo = bidMatch[0].toUpperCase();
  const gemItems =
    extractLabelValue(card.innerText, ['Items', 'Item']) ||
    (card.querySelector('a[href*="bid"], a[href*="tender"]')?.textContent?.trim() ?? '');

  const gemQuantity = extractLabelValue(card.innerText, ['Quantity', 'Qty']);
  const gemStartDate = extractDateAfterLabel(card.innerText, [
    'Start Date',
    'Bid Start Date',
    'Bid Start Date/Time',
  ], true);
  const gemEndDate = extractDateAfterLabel(card.innerText, [
    'End Date',
    'Bid End Date',
    'Bid End Date/Time',
  ]);
  const gemParticipation =
    extractLabelValue(card.innerText, ['Participation', 'Participation Status']) ||
    (/\bnot participated\b/i.test(text) ? 'Not participated' : '') ||
    (/\bparticipated\b/i.test(text) ? 'Participated' : '');

  const stageMatch = text.match(
    /(TECHNICAL BID|OFFER PRICE|UPLOAD DOCUMENTS|EMD\/EPBG|VERIFY\s*&?\s*E\s*SIGN)/gi,
  );
  const gemCurrentStage = stageMatch?.[0]?.toUpperCase() ?? '';

  const gemBidDocHash = extractLabelValue(card.innerText, ['Bid Doc Hash', 'Document Hash']) || 'View';
  const { gemDocUrl, gemDocId } = findGemDocUrl(card);

  const deptLines = parseDepartmentFromCard(card);
  const orgFields = parseGemOrganisationFields(card.innerText);
  const department = orgFields.organisation || (deptLines.length > 1 ? deptLines[deptLines.length - 1] : deptLines[0] || '');
  const officerName = orgFields.consigneeOfficer || (deptLines.length > 1 ? deptLines[0] : '');
  const address = orgFields.address || deptLines.slice(1, -1).join(', ') || '';

  const tenderType = inferTenderType(gemItems);

  const notes = [
    gemQuantity && `Quantity: ${gemQuantity}`,
    gemParticipation && `Participation: ${gemParticipation}`,
    gemCurrentStage && `Current Stage: ${gemCurrentStage}`,
    gemStartDate && `Start Date: ${gemStartDate}`,
    gemBidDocHash && `Bid Doc Hash: ${gemBidDocHash}`,
    `Source: ${sourceUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    bidNo,
    category: gemItems,
    ministry: orgFields.ministry,
    organisation: orgFields.organisation,
    consigneeOfficer: orgFields.consigneeOfficer,
    department,
    officerName,
    address,
    tenderType,
    quantity: parseQuantityNumber(gemQuantity),
    rate: '',
    additionalRequirements: orgFields.additionalRequirements,
    endDate: gemEndDate,
    startDate: gemStartDate,
    filedDate: '',
    preBidAt: '',
    preBidVenue: '',
    noPreBid: true,
    status: 'not_filed',
    outcome: '',
    notes,
    gemItems,
    gemQuantity,
    gemStartDate,
    gemEndDate,
    gemParticipation,
    gemCurrentStage,
    gemBidDocHash,
    gemDocUrl,
    gemDocId,
    gemDepartmentLines: deptLines.length ? deptLines : [department, officerName].filter(Boolean),
    sourceUrl,
    description: '',
    entryDate: new Date().toISOString().slice(0, 10),
  };
}

function parseQuantityNumber(raw: string): number {
  const match = raw.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

export function extractTenderFromCard(card: HTMLElement): ExtractedTender | null {
  return parseTenderCard(card, window.location.href);
}

export function extractGemTendersFromPage(root: ParentNode = document): ExtractedTender[] {
  const cards = findTenderCards(root);
  const sourceUrl = window.location.href;
  const tenders: ExtractedTender[] = [];
  const seen = new Set<string>();

  for (const card of cards) {
    const tender = parseTenderCard(card, sourceUrl);
    if (tender && !seen.has(tender.bidNo)) {
      seen.add(tender.bidNo);
      tenders.push(tender);
    }
  }

  if (tenders.length === 0) {
    const pageText = (root as Document).body?.innerText ?? '';
    const bids = [...new Set((pageText.match(BID_NO_RE) ?? []).map((b) => b.toUpperCase()))];
    for (const bidNo of bids) {
      const chunk = extractChunkForBid(pageText, bidNo);
      if (!chunk) continue;
      const fakeCard = document.createElement('div');
      fakeCard.innerText = chunk;
      const tender = parseTenderCard(fakeCard, sourceUrl);
      if (tender) tenders.push(tender);
    }
  }

  return tenders;
}

export function extractChunkForBid(pageText: string, bidNo: string): string {
  const idx = pageText.indexOf(bidNo);
  if (idx === -1) return '';
  const start = Math.max(0, idx - 100);
  const end = Math.min(pageText.length, idx + 2500);
  return pageText.slice(start, end);
}

export function countGemTendersOnPage(): number {
  return extractGemTendersFromPage().length;
}

export function tenderToFlexHRMPayload(tender: ExtractedTender) {
  return {
    bidNo: tender.bidNo,
    category: tender.category,
    ministry: tender.ministry,
    organisation: tender.organisation || tender.department,
    consigneeOfficer: tender.consigneeOfficer || tender.officerName,
    department: tender.organisation || tender.department,
    officerName: tender.consigneeOfficer || tender.officerName,
    address: tender.address,
    tenderType: tender.tenderType,
    quantity: tender.quantity,
    rate: tender.rate,
    additionalRequirements: tender.additionalRequirements,
    endDate: tender.endDate,
    startDate: tender.startDate || tender.gemStartDate,
    filedDate: tender.filedDate,
    preBidAt: tender.preBidAt,
    preBidVenue: tender.preBidVenue,
    noPreBid: tender.noPreBid,
    status: 'not_filed',
    outcome: '',
    notes: tender.notes,
    description: tender.description,
    entryDate: tender.entryDate || new Date().toISOString().slice(0, 10),
    gemDocUrl: tender.gemDocUrl,
    gemCurrentStage: tender.gemCurrentStage,
  };
}
