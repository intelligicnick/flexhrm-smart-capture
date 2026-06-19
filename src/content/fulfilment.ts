import type { CaptureMetadata, ContractCaptureBatch } from '../shared/types';
import {
  EXTENSION_RELOAD_HINT,
  isExtensionContextValid,
  pingExtensionBackground,
  requestOpenSidePanel,
  sendExtensionMessage,
} from '../shared/utils/messaging';
import { saveContractBatch } from '../shared/services/contract-storage';
import { extractGemOrdersFromPage as extractOrders } from '../modules/contracts/gem-orders-extractor';
import {
  extractSelectedOrders,
  injectGemOrdersSelectionUi,
  setGemOrdersPullLoading,
} from '../modules/contracts/gem-orders-selection';
import { isGemFulfilmentPage, isGemOrdersPage } from '../modules/contracts/gem-orders-url';

const FAB_ID = 'flexhrm-fab-fulfilment';
const MENU_ID = 'flexhrm-fab-fulfilment-menu';

function getMetadata(): CaptureMetadata {
  return {
    sourceUrl: window.location.href,
    sourceTitle: document.title,
    sourceSite: window.location.hostname,
    capturedAt: new Date().toISOString(),
    capturedBy: 'extension-user',
    captureType: 'gem-contracts',
  };
}

function showToast(message: string, tone: 'info' | 'error' = 'info'): void {
  const id = 'flexhrm-gem-orders-toast';
  document.getElementById(id)?.remove();
  const toast = document.createElement('div');
  toast.id = id;
  const bg = tone === 'error' ? '#991b1b' : '#9a3412';
  toast.style.cssText = `
    position: fixed; top: 16px; right: 16px; z-index: 2147483646;
    background: ${bg}; color: #fff; padding: 12px 16px; border-radius: 10px;
    font: 13px/1.45 system-ui, sans-serif; max-width: 380px; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), tone === 'error' ? 10000 : 6000);
}

function showError(error?: string, hint?: string): void {
  const message = [error || 'FlexHRM could not capture GeM orders.', hint].filter(Boolean).join(' ');
  showToast(message, 'error');
}

function captureGemOrders(
  orders = extractOrders(),
  mode: 'all' | 'selected' = 'all',
  onComplete?: (success: boolean) => void,
): void {
  if (!orders.length) {
    alert('No GeM orders found on this page. Open the Orders workspace and scroll to load all rows.');
    onComplete?.(false);
    return;
  }

  if (!isExtensionContextValid()) {
    showError('FlexHRM extension was updated or reloaded.', EXTENSION_RELOAD_HINT);
    onComplete?.(false);
    return;
  }

  requestOpenSidePanel();
  void (async () => {
    const now = new Date().toISOString();
    const batch: ContractCaptureBatch = {
      id: crypto.randomUUID(),
      contracts: orders,
      metadata: getMetadata(),
      status: 'review',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await saveContractBatch(batch);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('Extension context invalidated')) {
        showError('FlexHRM extension was updated or reloaded.', EXTENSION_RELOAD_HINT);
      } else {
        showError('Could not save orders locally in the extension.', message || 'Try reloading the extension.');
      }
      onComplete?.(false);
      return;
    }

    pingExtensionBackground();
    const response = await sendExtensionMessage<{ success?: boolean; error?: string; hint?: string }>({
      type: 'CAPTURE_GEM_CONTRACTS',
      payload: { batchId: batch.id },
    });

    if (!response?.success) {
      showError(
        response?.error,
        response?.hint || 'Open chrome://extensions and reload FlexHRM Smart Capture.',
      );
      onComplete?.(false);
      return;
    }

    showToast(`${batch.contracts.length} GeM order(s) sent to FlexHRM sidebar for review.`);
    onComplete?.(true);
  })();
}

function pullAllOrders(): void {
  setGemOrdersPullLoading(true, 'all');
  captureGemOrders(extractOrders(), 'all', () => setGemOrdersPullLoading(false, 'all'));
}

function pullSelectedOrders(): void {
  setGemOrdersPullLoading(true, 'selected');
  captureGemOrders(extractSelectedOrders(), 'selected', () =>
    setGemOrdersPullLoading(false, 'selected'),
  );
}

function setupGemOrdersUi(): void {
  if (!isGemOrdersPage()) return;
  injectGemOrdersSelectionUi();
}

function createFab(): void {
  if (document.getElementById(FAB_ID)) return;

  const fab = document.createElement('button');
  fab.id = FAB_ID;
  fab.title = 'FlexHRM Smart Capture — GeM Orders';
  fab.setAttribute('aria-label', 'FlexHRM Smart Capture');

  const icon = document.createElement('img');
  icon.src = chrome.runtime.getURL('src/assets/icon-48.png');
  icon.alt = 'FlexHRM';
  icon.width = 28;
  icon.height = 28;
  icon.style.borderRadius = '6px';
  fab.appendChild(icon);

  fab.addEventListener('click', toggleMenu);
  document.body.appendChild(fab);
}

function toggleMenu(): void {
  const existing = document.getElementById(MENU_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const menu = document.createElement('div');
  menu.id = MENU_ID;
  const total = extractOrders().length;
  const actions = [
    { label: `Pull All Orders (${total})`, action: () => pullAllOrders() },
    {
      label: `Pull Selected (${extractSelectedOrders().length || 0})`,
      action: () => pullSelectedOrders(),
    },
    { label: 'Open Review Panel', action: () => requestOpenSidePanel() },
  ];

  for (const { label, action } of actions) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      action();
      menu.remove();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
}

function setupExtensionMessageAck(): void {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'CONTRACT_BATCH_CREATED') {
      sendResponse({ ack: true });
      return true;
    }
    return false;
  });
}

function init(): void {
  if (window.self !== window.top) return;
  if (!isGemFulfilmentPage()) return;

  pingExtensionBackground();
  setupExtensionMessageAck();
  createFab();
  setupGemOrdersUi();
  document.addEventListener('flexhrm:pull-all-gem-orders', pullAllOrders);
  document.addEventListener('flexhrm:pull-selected-gem-orders', pullSelectedOrders);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (isGemOrdersPage()) setupGemOrdersUi();
    }, 500);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
