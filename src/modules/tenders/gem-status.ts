import type { ExtractedTender, TenderStatus } from '../../shared/types';
import {
  countBidsInText,
  extractChunkForBid,
  findTenderCards,
} from './gem-extractor';
import { extractSelectedTenders } from './gem-selection';

export interface GemCardStatus {
  status: TenderStatus;
  outcome: string;
  gemCurrentStage: string;
  gemParticipation: string;
}

const STAGE_DEFS = [
  { key: 'TECHNICAL EVALUATION', label: 'Technical Evaluation' },
  { key: 'FINANCIAL EVALUATION', label: 'Financial Evaluation' },
  { key: 'BID AWARD', label: 'Bid Award' },
] as const;

function extractLabelValue(text: string, labels: string[]): string {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`${escaped}\\s*[:\\-]\\s*([^\\n]+)`, 'i'),
      new RegExp(`${escaped}\\s+([^\\n]+)`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const value = match?.[1]?.trim();
      if (value) return value;
    }
  }
  return '';
}

function readCardText(card: HTMLElement): string {
  return card.innerText || card.textContent || '';
}

function normalizeBidAwardHeader(value: string): boolean {
  const header = value.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    header.includes('bid / ra award') ||
    header.includes('bid/ra award') ||
    header.includes('bid award')
  );
}

/** GeM header status — not Bid/RA Status. */
export function extractProcessStatus(cardText: string): string {
  const block = cardText.match(
    /Status\s*:\s*([^\n]+?)(?=\s*Bid\/RA\s*Status|\s*Items|\s*Quantity|$)/i,
  );
  if (block?.[1]) {
    const value = block[1].trim();
    if (value && !/bid\/ra/i.test(value)) return value;
  }

  const multiline = cardText.match(
    /Status\s*:\s*\n\s*(Technical Evaluation|Financial Evaluation|Bid\s*\/?\s*RA\s*Award|Bid Award|Evaluation)/i,
  );
  if (multiline?.[1]) return multiline[1].trim();

  const inline = cardText.match(
    /Status\s+(Technical Evaluation|Financial Evaluation|Bid\s*\/?\s*RA\s*Award|Bid Award|Evaluation)/i,
  );
  return inline?.[1]?.trim() ?? '';
}

export function mapTechnicalResult(technicalStatus: string): Pick<GemCardStatus, 'status' | 'outcome'> {
  const value = technicalStatus.toLowerCase().trim();
  if (value.includes('disqualified')) {
    return { status: 'disqualified', outcome: 'Disqualified' };
  }
  if (value.includes('qualified')) {
    return { status: 'technical_qualified', outcome: 'Qualified' };
  }
  return { status: 'filed', outcome: 'Participated' };
}

function parseRgb(color: string): [number, number, number] | null {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isGreenColor(color: string): boolean {
  const rgb = parseRgb(color);
  if (!rgb) return /green|success|complete|done/i.test(color);
  const [r, g, b] = rgb;
  return g > 90 && g > r + 25 && g > b + 10;
}

function isBlueColor(color: string): boolean {
  const rgb = parseRgb(color);
  if (!rgb) return /blue|primary|active|progress/i.test(color);
  const [r, g, b] = rgb;
  return b > 90 && b > r + 15 && b >= g - 20;
}

function isGreyColor(color: string): boolean {
  const rgb = parseRgb(color);
  if (!rgb) return /grey|gray|pending|disabled/i.test(color);
  const [r, g, b] = rgb;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return spread < 25 && Math.max(r, g, b) < 200;
}

function detectStageColor(el: HTMLElement): 'blue' | 'green' | 'grey' | '' {
  let node: HTMLElement | null = el;
  for (let depth = 0; depth < 8 && node; depth += 1) {
    const cls = node.className?.toString().toLowerCase() ?? '';
    if (/active|in[- ]?progress|current|primary/.test(cls)) return 'blue';
    if (/complete|completed|done|success/.test(cls)) return 'green';
    if (/pending|disabled|inactive|grey|gray/.test(cls)) return 'grey';

    const style = window.getComputedStyle(node);
    if (isGreenColor(style.backgroundColor) || isGreenColor(style.color)) return 'green';
    if (isBlueColor(style.backgroundColor) || isBlueColor(style.color)) return 'blue';
    if (isGreyColor(style.backgroundColor)) return 'grey';

    node = node.parentElement;
  }
  return '';
}

function findStageElement(card: HTMLElement, stageKey: string): HTMLElement | null {
  const target = stageKey.toUpperCase();
  const nodes = card.querySelectorAll('span, div, p, li, label, strong, b');
  for (const node of nodes) {
    const text = node.textContent?.replace(/\s+/g, ' ').trim().toUpperCase() ?? '';
    if (text === target || text.includes(target)) {
      return node as HTMLElement;
    }
  }
  return null;
}

function inferStageStateFromHeader(
  stageLabel: string,
  processStatus: string,
): 'in progress' | 'completed' | 'pending' {
  const header = processStatus.toLowerCase();
  const stage = stageLabel.toLowerCase();

  if (stage.includes('technical')) {
    if (header.includes('technical evaluation')) return 'in progress';
    if (header.includes('financial') || normalizeBidAwardHeader(header)) return 'completed';
    return 'pending';
  }
  if (stage.includes('financial')) {
    if (header.includes('financial evaluation')) return 'in progress';
    if (normalizeBidAwardHeader(header)) return 'completed';
    if (header.includes('technical evaluation')) return 'pending';
    return 'pending';
  }
  if (stage.includes('bid award')) {
    if (normalizeBidAwardHeader(header)) return 'in progress';
    return 'pending';
  }
  if (stage.includes('evaluation')) {
    if (header.includes('technical evaluation') || header.includes('evaluation')) {
      return 'in progress';
    }
    if (header.includes('financial') || normalizeBidAwardHeader(header)) {
      return 'completed';
    }
    return 'pending';
  }
  return 'pending';
}

type StageState = 'in progress' | 'completed' | 'pending';

function parseStageLine(line: string): { label: string; state: StageState } | null {
  const match = line.match(/^(.+?)\s+\((in progress|completed|pending)\)$/i);
  if (!match) return null;
  return { label: match[1].trim(), state: match[2].toLowerCase() as StageState };
}

function stageState(
  stageLines: string[],
  keyword: string,
): StageState | '' {
  const needle = keyword.toLowerCase();
  for (const line of stageLines) {
    const parsed = parseStageLine(line);
    if (parsed && parsed.label.toLowerCase().includes(needle)) return parsed.state;
  }
  return '';
}

/** True only when GeM text indicates this seller won — not merely that bid award stage ran. */
export function detectSelfBidAward(cardText: string): boolean {
  const text = cardText.toLowerCase();
  if (/not\s+(?:selected|awarded|l1)/i.test(text)) return false;
  if (/unsuccessful|not\s+won|lost\s+bid/i.test(text)) return false;
  if (/\bl1\b/.test(text)) return true;
  if (/single\s+selected/i.test(text)) return true;
  if (/you\s+(?:have\s+been\s+)?(?:awarded|won)/i.test(text)) return true;
  if (/your\s+bid\s+is\s+(?:selected|awarded)/i.test(text)) return true;
  if (/contract\s+awarded\s+to\s+you/i.test(text)) return true;
  if (/won\s+the\s+bid/i.test(text)) return true;
  return false;
}

function bidAwardOutcome(
  bidAward: StageState | '',
  selfAwarded: boolean,
): string {
  if (selfAwarded) return 'Won the Bid';
  if (bidAward === 'completed') return 'Bid Awarded';
  if (bidAward === 'in progress') return 'Bid Award in Progress';
  return 'Qualified';
}

/** Map GeM progress colours / header to FlexHRM tender status. */
export function deriveStatusFromGemProgress(
  processStatus: string,
  technicalStatus: string,
  stageLines: string[],
  participated: boolean,
  cardText = '',
): TenderStatus {
  const techResult = technicalStatus.toLowerCase().trim();
  if (techResult.includes('disqualified')) return 'disqualified';

  const tech = stageState(stageLines, 'technical');
  const financial = stageState(stageLines, 'financial');
  const bidAward = stageState(stageLines, 'bid award');
  const hasFinancialStage = stageLines.some((line) =>
    /financial evaluation/i.test(line),
  );
  const header = processStatus.toLowerCase();
  const atBidAwardStage =
    bidAward === 'completed' ||
    bidAward === 'in progress' ||
    normalizeBidAwardHeader(header);

  if (atBidAwardStage) {
    return detectSelfBidAward(cardText) ? 'won_bid' : 'qualified';
  }
  if (financial === 'in progress' || header.includes('financial evaluation')) {
    return 'financial';
  }
  if (
    techResult.includes('qualified') ||
    tech === 'completed' ||
    (financial === 'completed' && hasFinancialStage)
  ) {
    return 'technical_qualified';
  }
  if (tech === 'in progress' || header.includes('technical evaluation')) {
    return 'filed';
  }
  if (participated) return 'filed';
  return 'not_filed';
}

export function parseProgressStages(card: HTMLElement, processStatus: string): string[] {
  const cardText = readCardText(card).toUpperCase();
  const lines: string[] = [];
  const stageDefs =
    cardText.includes('TECHNICAL EVALUATION') || cardText.includes('FINANCIAL EVALUATION')
      ? STAGE_DEFS
      : cardText.includes('EVALUATION') && cardText.includes('BID AWARD')
        ? ([
            { key: 'EVALUATION', label: 'Technical Evaluation' },
            { key: 'BID AWARD', label: 'Bid Award' },
          ] as const)
        : STAGE_DEFS;

  for (const stage of stageDefs) {
    if (!cardText.includes(stage.key)) continue;

    const el = findStageElement(card, stage.key);
    const color = el ? detectStageColor(el) : '';
    let state: 'in progress' | 'completed' | 'pending';
    if (color === 'green') state = 'completed';
    else if (color === 'blue') state = 'in progress';
    else if (color === 'grey') state = 'pending';
    else state = inferStageStateFromHeader(stage.label, processStatus);

    lines.push(`${stage.label} (${state})`);
  }

  return lines;
}

export function buildGemCurrentStage(card: HTMLElement, processStatus: string): string {
  const progress = parseProgressStages(card, processStatus);
  if (progress.length > 0) return progress.join(' → ');
  if (processStatus) return `${processStatus} (process)`;
  return '';
}

export function isParticipatedFilterActive(): boolean {
  const inputs = document.querySelectorAll('input[type="checkbox"]');
  for (const input of inputs) {
    const el = input as HTMLInputElement;
    if (!el.checked) continue;
    const labelText =
      el.closest('label')?.textContent ??
      el.parentElement?.textContent ??
      el.getAttribute('aria-label') ??
      '';
    if (/bids\/ras already submitted\/participated/i.test(labelText)) return true;
    if (/already submitted/i.test(labelText) && /participat/i.test(labelText)) return true;
  }
  return false;
}

export function parseGemCardStatus(card: HTMLElement): GemCardStatus {
  const text = readCardText(card);
  const technicalStatus = extractLabelValue(text, ['Technical Status']);
  const processStatus = extractProcessStatus(text);
  const participatedContext =
    isParticipatedFilterActive() ||
    Boolean(technicalStatus) ||
    /\bparticipated\b/i.test(text) ||
    /technical evaluation|financial evaluation/i.test(processStatus.toLowerCase()) ||
    normalizeBidAwardHeader(processStatus);

  const stageLines = parseProgressStages(card, processStatus);
  const gemCurrentStage =
    stageLines.length > 0
      ? stageLines.join(' → ')
      : processStatus
        ? `${processStatus} (process)`
        : '';

  const selfAwarded = detectSelfBidAward(text);
  const bidAward = stageState(stageLines, 'bid award');
  let status = deriveStatusFromGemProgress(
    processStatus,
    technicalStatus,
    stageLines,
    participatedContext,
    text,
  );
  let outcome = participatedContext ? 'Participated' : '';

  if (technicalStatus && mapTechnicalResult(technicalStatus).status === 'disqualified') {
    outcome = 'Disqualified';
  } else if (status === 'won_bid' || selfAwarded) {
    outcome = 'Won the Bid';
  } else if (
    bidAward === 'completed' ||
    bidAward === 'in progress' ||
    normalizeBidAwardHeader(processStatus)
  ) {
    outcome = bidAwardOutcome(bidAward, false);
  } else if (technicalStatus) {
    outcome = mapTechnicalResult(technicalStatus).outcome;
  } else if (status === 'financial') {
    outcome = 'Financial Evaluation';
  }

  return {
    status,
    outcome,
    gemCurrentStage,
    gemParticipation: participatedContext ? 'Participated' : '',
  };
}

export function applyCardStatusToTender(
  tender: ExtractedTender,
  card: HTMLElement,
): ExtractedTender {
  const scopedCard = cardElementForStatusParse(card, tender.bidNo.toUpperCase());
  const statusFields = parseGemCardStatus(scopedCard);
  return {
    ...tender,
    status: statusFields.status,
    outcome: statusFields.outcome,
    gemCurrentStage: statusFields.gemCurrentStage || tender.gemCurrentStage,
    gemParticipation: statusFields.gemParticipation || tender.gemParticipation,
  };
}

export function expandCardForStatusParsing(card: HTMLElement, bidNo: string): HTMLElement {
  const cardText = readCardText(card);
  if (
    /status\s*:/i.test(cardText) ||
    normalizeBidAwardHeader(extractProcessStatus(cardText))
  ) {
    return card;
  }

  let current: HTMLElement | null = card.parentElement;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    const text = readCardText(current);
    if (!text.includes(bidNo) || countBidsInText(text) !== 1) break;
    if (text.length > 8000) break;
    if (
      /status\s*:/i.test(text) ||
      normalizeBidAwardHeader(extractProcessStatus(text))
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return card;
}

function readStatusScopeText(card: HTMLElement, bidNo: string): string {
  const expanded = expandCardForStatusParsing(card, bidNo);
  const expandedText = readCardText(expanded);
  if (
    /status\s*:/i.test(expandedText) ||
    normalizeBidAwardHeader(extractProcessStatus(expandedText))
  ) {
    return expandedText;
  }

  const chunks: string[] = [];
  let sibling: Element | null = card.previousElementSibling;
  for (let depth = 0; depth < 4 && sibling; depth += 1) {
    chunks.unshift(readCardText(sibling as HTMLElement));
    sibling = sibling.previousElementSibling;
  }
  chunks.push(readCardText(card));
  const merged = chunks.join('\n');
  if (
    /status\s*:/i.test(merged) ||
    normalizeBidAwardHeader(extractProcessStatus(merged))
  ) {
    return merged;
  }
  return expandedText;
}

function cardElementForStatusParse(card: HTMLElement, bidNo: string): HTMLElement {
  const text = readStatusScopeText(card, bidNo);
  const scoped = document.createElement('div');
  scoped.textContent = text;
  return scoped;
}

function bidNoFromCard(card: HTMLElement): string {
  return (
    card.getAttribute('data-flexhrm-bid')?.toUpperCase() ||
    card.innerText.match(/GEM\/\d{4}\/B\/\d+/i)?.[0]?.toUpperCase() ||
    ''
  );
}

function buildCardIndex(): Map<string, HTMLElement> {
  const cardByBid = new Map<string, HTMLElement>();
  for (const card of findTenderCards()) {
    const bid = bidNoFromCard(card);
    if (bid) cardByBid.set(bid, card);
  }
  return cardByBid;
}

function resolveCardForBid(bidNo: string, cardByBid: Map<string, HTMLElement>): HTMLElement | null {
  const normalized = bidNo.toUpperCase();
  const fromIndex = cardByBid.get(normalized);
  if (fromIndex) return expandCardForStatusParsing(fromIndex, normalized);

  const pageText = document.body?.innerText ?? '';
  const chunk = extractChunkForBid(pageText, normalized);
  if (!chunk) return null;

  const fakeCard = document.createElement('div');
  fakeCard.innerText = chunk;
  return fakeCard;
}

export function extractSelectedTendersForStatusSync(): ExtractedTender[] {
  const tenders = extractSelectedTenders();
  if (tenders.length === 0) return [];

  const cardByBid = buildCardIndex();

  return tenders.map((tender) => {
    const card = resolveCardForBid(tender.bidNo, cardByBid);
    if (!card) return tender;
    return applyCardStatusToTender(tender, card);
  });
}
