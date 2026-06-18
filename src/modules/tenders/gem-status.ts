import type { ExtractedTender, TenderStatus } from '../../shared/types';
import { findTenderCards } from './gem-extractor';
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

/** GeM header status — not Bid/RA Status. */
export function extractProcessStatus(cardText: string): string {
  const block = cardText.match(
    /Status\s*:\s*([^\n]+?)(?=\s*Bid\/RA\s*Status|\s*Items|\s*Quantity|$)/i,
  );
  if (block?.[1]) {
    const value = block[1].trim();
    if (value && !/bid\/ra/i.test(value)) return value;
  }

  const inline = cardText.match(
    /Status\s+(Technical Evaluation|Financial Evaluation|Bid Award|Evaluation)/i,
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
    if (header.includes('financial') || header.includes('bid award')) return 'completed';
    return 'pending';
  }
  if (stage.includes('financial')) {
    if (header.includes('financial')) return 'in progress';
    if (header.includes('bid award')) return 'completed';
    if (header.includes('technical evaluation')) return 'pending';
    return 'pending';
  }
  if (stage.includes('bid award')) {
    if (header.includes('bid award')) return 'completed';
    return 'pending';
  }
  return 'pending';
}

export function parseProgressStages(card: HTMLElement, processStatus: string): string[] {
  const cardText = card.innerText.toUpperCase();
  const lines: string[] = [];

  for (const stage of STAGE_DEFS) {
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
  const text = card.innerText;
  const technicalStatus = extractLabelValue(text, ['Technical Status']);
  const processStatus = extractProcessStatus(text);
  const participatedContext =
    isParticipatedFilterActive() ||
    Boolean(technicalStatus) ||
    /\bparticipated\b/i.test(text) ||
    /technical evaluation|financial evaluation|bid award/i.test(processStatus.toLowerCase());

  let status: TenderStatus = participatedContext ? 'filed' : 'not_filed';
  let outcome = participatedContext ? 'Participated' : '';

  if (technicalStatus) {
    const mapped = mapTechnicalResult(technicalStatus);
    status = mapped.status;
    outcome = mapped.outcome;
  }

  return {
    status,
    outcome,
    gemCurrentStage: buildGemCurrentStage(card, processStatus),
    gemParticipation: participatedContext ? 'Participated' : '',
  };
}

export function applyCardStatusToTender(
  tender: ExtractedTender,
  card: HTMLElement,
): ExtractedTender {
  const statusFields = parseGemCardStatus(card);
  return {
    ...tender,
    status: statusFields.status,
    outcome: statusFields.outcome,
    gemCurrentStage: statusFields.gemCurrentStage || tender.gemCurrentStage,
    gemParticipation: statusFields.gemParticipation || tender.gemParticipation,
  };
}

export function extractSelectedTendersForStatusSync(): ExtractedTender[] {
  const tenders = extractSelectedTenders();
  if (tenders.length === 0) return [];

  const cardByBid = new Map<string, HTMLElement>();
  for (const card of findTenderCards()) {
    const bid = card.getAttribute('data-flexhrm-bid')?.toUpperCase();
    if (bid) cardByBid.set(bid, card);
  }

  return tenders.map((tender) => {
    const card = cardByBid.get(tender.bidNo.toUpperCase());
    if (!card) {
      if (isParticipatedFilterActive()) {
        return {
          ...tender,
          status: 'filed',
          outcome: 'Participated',
          gemParticipation: 'Participated',
        };
      }
      return tender;
    }
    return applyCardStatusToTender(tender, card);
  });
}
