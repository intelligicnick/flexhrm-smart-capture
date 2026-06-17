import type { ExtractedTender } from '../../shared/types';
import { extractGemTendersFromPage, findTenderCards } from './gem-extractor';
import { requestOpenSidePanel } from '../../shared/utils/messaging';

const CHECKBOX_CLASS = 'flexhrm-gem-checkbox';
const CARD_ATTR = 'data-flexhrm-bid';

const selectedBids = new Set<string>();

export function getSelectedBidNos(): string[] {
  return [...selectedBids];
}

export function clearGemSelection(): void {
  selectedBids.clear();
  document.querySelectorAll(`.${CHECKBOX_CLASS}`).forEach((el) => {
    (el as HTMLInputElement).checked = false;
  });
  updateSelectionBar();
}

export function selectAllGemTenders(): void {
  const cards = findTenderCards();
  for (const card of cards) {
    const bid = card.getAttribute(CARD_ATTR);
    if (bid) selectedBids.add(bid);
  }
  document.querySelectorAll(`.${CHECKBOX_CLASS}`).forEach((el) => {
    (el as HTMLInputElement).checked = true;
  });
  updateSelectionBar();
}

export function extractSelectedTenders(): ExtractedTender[] {
  const all = extractGemTendersFromPage();
  if (selectedBids.size === 0) return [];
  return all.filter((t) => selectedBids.has(t.bidNo.toUpperCase()));
}

function findBidNoAnchor(card: HTMLElement, bidNo: string): HTMLElement {
  const nodes = card.querySelectorAll('span, div, p, a, strong, b, label, td');
  let best: HTMLElement | null = null;
  let bestLen = Infinity;

  for (const node of nodes) {
    const el = node as HTMLElement;
    const text = el.textContent?.trim() ?? '';
    if (!text.includes(bidNo)) continue;
    if (el.closest(`.${CHECKBOX_CLASS}`)) continue;
    const len = text.length;
    if (len < bestLen) {
      best = el;
      bestLen = len;
    }
  }

  return best ?? card;
}

function mountCheckbox(card: HTMLElement, bidNo: string): void {
  if (card.querySelector(`[data-flexhrm-checkbox-for="${bidNo}"]`)) return;

  const wrap = document.createElement('label');
  wrap.setAttribute('data-flexhrm-checkbox-for', bidNo);
  wrap.className = CHECKBOX_CLASS + '-wrap';
  wrap.style.cssText = `
    display: inline-flex; align-items: center; gap: 6px; margin-right: 10px;
    background: rgba(255,255,255,0.97); border: 1px solid #93c5fd;
    border-radius: 8px; padding: 4px 8px; cursor: pointer;
    font: 700 11px system-ui, sans-serif; color: #1e40af;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08); vertical-align: middle;
    position: relative; z-index: 20;
  `;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = CHECKBOX_CLASS;
  checkbox.checked = selectedBids.has(bidNo);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) selectedBids.add(bidNo);
    else selectedBids.delete(bidNo);
    updateSelectionBar();
  });

  const label = document.createElement('span');
  label.textContent = 'Select';

  wrap.appendChild(checkbox);
  wrap.appendChild(label);

  const anchor = findBidNoAnchor(card, bidNo);
  if (anchor.parentElement) {
    anchor.parentElement.insertBefore(wrap, anchor);
    return;
  }

  const style = window.getComputedStyle(card);
  if (style.position === 'static') {
    card.style.position = 'relative';
  }
  card.prepend(wrap);
}

export function injectGemSelectionUi(): void {
  const cards = findTenderCards();
  if (cards.length === 0) return;

  for (const card of cards) {
    const bidMatch = card.innerText.match(/GEM\/\d{4}\/B\/\d+/i);
    if (!bidMatch) continue;
    const bidNo = bidMatch[0].toUpperCase();
    card.setAttribute(CARD_ATTR, bidNo);
    mountCheckbox(card, bidNo);
  }

  ensureSelectionBar();
  updateSelectionBar();
}

const BAR_ID = 'flexhrm-gem-selection-bar';

function ensureSelectionBar(): void {
  if (document.getElementById(BAR_ID)) return;

  const bar = document.createElement('div');
  bar.id = BAR_ID;
  bar.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    z-index: 2147483645; background: #0f172a; color: #fff;
    padding: 12px 16px; border-radius: 12px; display: flex; gap: 10px;
    align-items: center; font-family: system-ui, sans-serif; font-size: 13px;
    box-shadow: 0 12px 32px rgba(15,23,42,0.35);
  `;
  bar.innerHTML = `
    <span id="flexhrm-gem-selection-count">0 selected</span>
    <button type="button" id="flexhrm-gem-pull-btn" style="
      background:#2563eb;color:#fff;border:none;border-radius:8px;
      padding:8px 14px;font-weight:700;cursor:pointer;font-size:12px;
    ">Pull & Read PDFs</button>
    <button type="button" id="flexhrm-gem-select-all" style="
      background:transparent;color:#93c5fd;border:1px solid #334155;
      border-radius:8px;padding:8px 10px;cursor:pointer;font-size:12px;
    ">Select All</button>
    <button type="button" id="flexhrm-gem-clear-selection" style="
      background:transparent;color:#cbd5e1;border:none;
      padding:8px 10px;cursor:pointer;font-size:12px;
    ">Clear</button>
  `;
  document.body.appendChild(bar);

  document.getElementById('flexhrm-gem-pull-btn')?.addEventListener('click', () => {
    requestOpenSidePanel();
    document.dispatchEvent(new CustomEvent('flexhrm:pull-selected-tenders'));
  });
  document.getElementById('flexhrm-gem-select-all')?.addEventListener('click', selectAllGemTenders);
  document.getElementById('flexhrm-gem-clear-selection')?.addEventListener('click', clearGemSelection);
}

export function setGemPullLoading(loading: boolean): void {
  const pullBtn = document.getElementById('flexhrm-gem-pull-btn') as HTMLButtonElement | null;
  if (!pullBtn) return;
  const count = selectedBids.size;
  pullBtn.disabled = loading || count === 0;
  pullBtn.style.opacity = pullBtn.disabled ? '0.5' : '1';
  if (loading) {
    pullBtn.textContent = `Reading PDFs (${count})…`;
    return;
  }
  pullBtn.textContent =
    count > 0 ? `Pull & Read PDFs (${count})` : 'Pull & Read PDFs';
}

function updateSelectionBar(): void {
  const countEl = document.getElementById('flexhrm-gem-selection-count');
  const pullBtn = document.getElementById('flexhrm-gem-pull-btn') as HTMLButtonElement | null;
  const count = selectedBids.size;
  if (countEl) countEl.textContent = `${count} selected`;
  if (pullBtn && !pullBtn.textContent?.includes('Reading PDFs')) {
    pullBtn.disabled = count === 0;
    pullBtn.style.opacity = count === 0 ? '0.5' : '1';
    pullBtn.textContent =
      count > 0 ? `Pull & Read PDFs (${count})` : 'Pull & Read PDFs';
  }
}
