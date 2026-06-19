import type { ExtractedContract } from '../../shared/types';
import {
  countGemOrdersOnPage,
  extractGemOrdersFromPage,
} from './gem-orders-extractor';
import { requestOpenSidePanel } from '../../shared/utils/messaging';

const CHECKBOX_CLASS = 'flexhrm-gem-order-checkbox';
const ROW_ATTR = 'data-flexhrm-contract';

const selectedContracts = new Set<string>();

export function getSelectedContractNos(): string[] {
  return [...selectedContracts];
}

export function clearGemOrderSelection(): void {
  selectedContracts.clear();
  document.querySelectorAll(`.${CHECKBOX_CLASS}`).forEach((el) => {
    (el as HTMLInputElement).checked = false;
  });
  updateSelectionBar();
}

export function selectAllGemOrders(): void {
  const orders = extractGemOrdersFromPage();
  for (const order of orders) {
    selectedContracts.add(order.contractNo);
  }
  document.querySelectorAll(`.${CHECKBOX_CLASS}`).forEach((el) => {
    (el as HTMLInputElement).checked = true;
  });
  updateSelectionBar();
}

export function extractSelectedOrders(): ExtractedContract[] {
  const all = extractGemOrdersFromPage();
  if (selectedContracts.size === 0) return all;
  return all.filter((order) => selectedContracts.has(order.contractNo));
}

function findContractAnchor(row: HTMLElement, contractNo: string): HTMLElement {
  const nodes = row.querySelectorAll('span, div, p, a, strong, b, label, td');
  let best: HTMLElement | null = null;
  let bestLen = Infinity;

  for (const node of nodes) {
    const el = node as HTMLElement;
    const text = el.textContent?.trim() ?? '';
    if (!text.includes(contractNo)) continue;
    if (el.closest(`.${CHECKBOX_CLASS}`)) continue;
    const len = text.length;
    if (len < bestLen) {
      best = el;
      bestLen = len;
    }
  }

  return best ?? row;
}

function mountCheckbox(row: HTMLElement, contractNo: string): void {
  if (row.querySelector(`[data-flexhrm-checkbox-for="${contractNo}"]`)) return;

  const wrap = document.createElement('label');
  wrap.setAttribute('data-flexhrm-checkbox-for', contractNo);
  wrap.className = `${CHECKBOX_CLASS}-wrap`;
  wrap.style.cssText = `
    display: inline-flex; align-items: center; gap: 6px; margin-right: 10px;
    background: rgba(255,255,255,0.97); border: 1px solid #fdba74;
    border-radius: 8px; padding: 4px 8px; cursor: pointer;
    font: 700 11px system-ui, sans-serif; color: #c2410c;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08); vertical-align: middle;
    position: relative; z-index: 20;
  `;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = CHECKBOX_CLASS;
  checkbox.checked = selectedContracts.has(contractNo);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) selectedContracts.add(contractNo);
    else selectedContracts.delete(contractNo);
    updateSelectionBar();
  });

  const label = document.createElement('span');
  label.textContent = 'Select';

  wrap.appendChild(checkbox);
  wrap.appendChild(label);

  const anchor = findContractAnchor(row, contractNo);
  if (anchor.parentElement) {
    anchor.parentElement.insertBefore(wrap, anchor);
    return;
  }

  const style = window.getComputedStyle(row);
  if (style.position === 'static') {
    row.style.position = 'relative';
  }
  row.prepend(wrap);
}

export function injectGemOrdersSelectionUi(): void {
  const orders = extractGemOrdersFromPage();
  if (orders.length === 0) return;

  for (const order of orders) {
    const contractNo = order.contractNo;
    const row =
      (document.querySelector(`[${ROW_ATTR}="${contractNo}"]`) as HTMLElement | null) ??
      findOrderRowForContract(contractNo);
    if (!row) continue;
    row.setAttribute(ROW_ATTR, contractNo);
    mountCheckbox(row, contractNo);
  }

  ensureSelectionBar();
  updateSelectionBar();
}

function findOrderRowForContract(contractNo: string): HTMLElement | null {
  const candidates = document.querySelectorAll(
    'tr, [role="row"], .ag-row, .MuiDataGrid-row, li, article, [class*="order"], [class*="contract"]',
  );
  for (const node of candidates) {
    const el = node as HTMLElement;
    if (el.innerText.includes(contractNo)) return el;
  }
  return null;
}

const BAR_ID = 'flexhrm-gem-orders-bar';

function ensureSelectionBar(): void {
  if (document.getElementById(BAR_ID)) return;

  const bar = document.createElement('div');
  bar.id = BAR_ID;
  bar.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    z-index: 2147483645; background: #7c2d12; color: #fff;
    padding: 12px 16px; border-radius: 12px; display: flex; gap: 10px;
    align-items: center; font-family: system-ui, sans-serif; font-size: 13px;
    box-shadow: 0 12px 32px rgba(124,45,18,0.35);
  `;
  bar.innerHTML = `
    <span id="flexhrm-gem-orders-count">0 orders</span>
    <button type="button" id="flexhrm-gem-orders-pull-all" style="
      background:#ea580c;color:#fff;border:none;border-radius:8px;
      padding:8px 14px;font-weight:700;cursor:pointer;font-size:12px;
    ">Pull All Orders</button>
    <button type="button" id="flexhrm-gem-orders-pull-selected" style="
      background:#2563eb;color:#fff;border:none;border-radius:8px;
      padding:8px 14px;font-weight:700;cursor:pointer;font-size:12px;
    ">Pull Selected</button>
    <button type="button" id="flexhrm-gem-orders-select-all" style="
      background:transparent;color:#fed7aa;border:1px solid #fb923c;
      border-radius:8px;padding:8px 10px;cursor:pointer;font-size:12px;
    ">Select All</button>
    <button type="button" id="flexhrm-gem-orders-clear" style="
      background:transparent;color:#fdba74;border:none;
      padding:8px 10px;cursor:pointer;font-size:12px;
    ">Clear</button>
  `;
  document.body.appendChild(bar);

  document.getElementById('flexhrm-gem-orders-pull-all')?.addEventListener('click', () => {
    requestOpenSidePanel();
    document.dispatchEvent(new CustomEvent('flexhrm:pull-all-gem-orders'));
  });
  document.getElementById('flexhrm-gem-orders-pull-selected')?.addEventListener('click', () => {
    requestOpenSidePanel();
    document.dispatchEvent(new CustomEvent('flexhrm:pull-selected-gem-orders'));
  });
  document.getElementById('flexhrm-gem-orders-select-all')?.addEventListener('click', selectAllGemOrders);
  document.getElementById('flexhrm-gem-orders-clear')?.addEventListener('click', clearGemOrderSelection);
}

export function setGemOrdersPullLoading(loading: boolean, mode: 'all' | 'selected'): void {
  const allBtn = document.getElementById('flexhrm-gem-orders-pull-all') as HTMLButtonElement | null;
  const selectedBtn = document.getElementById(
    'flexhrm-gem-orders-pull-selected',
  ) as HTMLButtonElement | null;
  const total = countGemOrdersOnPage();
  const selected = selectedContracts.size;

  if (allBtn) {
    allBtn.disabled = loading || total === 0;
    allBtn.style.opacity = allBtn.disabled ? '0.5' : '1';
    allBtn.textContent =
      loading && mode === 'all' ? `Pulling (${total})…` : `Pull All Orders (${total})`;
  }

  if (selectedBtn) {
    selectedBtn.disabled = loading || selected === 0;
    selectedBtn.style.opacity = selectedBtn.disabled ? '0.5' : '1';
    selectedBtn.textContent =
      loading && mode === 'selected'
        ? `Pulling (${selected})…`
        : selected > 0
          ? `Pull Selected (${selected})`
          : 'Pull Selected';
  }
}

export function updateSelectionBar(): void {
  const countEl = document.getElementById('flexhrm-gem-orders-count');
  const total = countGemOrdersOnPage();
  const selected = selectedContracts.size;
  if (countEl) {
    countEl.textContent =
      selected > 0 ? `${selected} selected · ${total} on page` : `${total} order(s) on page`;
  }
  setGemOrdersPullLoading(false, 'all');
}
