import type { CaptureMetadata, TenderCaptureBatch } from '../shared/types';
import {
  EXTENSION_RELOAD_HINT,
  isExtensionContextValid,
  pingExtensionBackground,
  postDebugLog,
  requestOpenSidePanel,
  sendExtensionMessage,
} from '../shared/utils/messaging';
import { saveTenderBatch } from '../shared/services/tender-storage';
import {
  extractGemTendersFromPage,
  isGemListingPage,
  isGemSellerBidsPage,
} from '../modules/tenders/gem-extractor';
import { enrichTendersFromPdfsOnPage } from '../modules/tenders/gem-pdf-enrich';
import {
  extractSelectedTenders,
  getSelectedBidNos,
  injectGemSelectionUi,
  setGemPullLoading,
  setGemSyncLoading,
} from '../modules/tenders/gem-selection';
import { extractSelectedTendersForStatusSync } from '../modules/tenders/gem-status';

const FAB_ID = 'flexhrm-fab';
const MENU_ID = 'flexhrm-fab-menu';

function getMetadata(): CaptureMetadata {
  return {
    sourceUrl: window.location.href,
    sourceTitle: document.title,
    sourceSite: window.location.hostname,
    capturedAt: new Date().toISOString(),
    capturedBy: 'extension-user',
    captureType: 'gem-tenders',
  };
}

function showExtensionReloadError(): void {
  showGemError('FlexHRM extension was updated or reloaded.', EXTENSION_RELOAD_HINT);
}

function captureGemTenders(
  tenders = extractGemTendersFromPage(),
  onComplete?: (
    success: boolean,
    response?: { pdfFetched?: number; pdfFailed?: number; pdfFailureReasons?: string[] },
  ) => void,
) {
  if (!tenders.length) {
    alert('No GeM tenders selected. Tick the checkboxes on tenders you want, then pull to sidebar.');
    onComplete?.(false);
    return;
  }

  if (!isExtensionContextValid()) {
    showExtensionReloadError();
    onComplete?.(false);
    return;
  }

  requestOpenSidePanel();
  void (async () => {
    let enrichedTenders = tenders;
    let pdfFetched = 0;
    let pdfFailed = 0;
    let pdfFailureReasons: string[] = [];

    postDebugLog({
      hypothesisId: 'H5',
      location: 'content/index.ts:captureGemTenders',
      message: 'pull selected started',
      data: {
        tenderCount: tenders.length,
        docIds: tenders.map((t) => t.gemDocId || '').filter(Boolean),
      },
    });

    try {
      const enriched = await enrichTendersFromPdfsOnPage(tenders);
      enrichedTenders = enriched.tenders;
      pdfFetched = enriched.pdfFetched;
      pdfFailed = enriched.pdfFailed;
      pdfFailureReasons = enriched.pdfFailureReasons;
    } catch (err) {
      pdfFailureReasons = [
        `page-enrich: ${err instanceof Error ? err.message : 'unknown error'}`,
      ];
    }

    postDebugLog({
      hypothesisId: 'H6',
      location: 'content/index.ts:captureGemTenders',
      message: 'pull selected enrich complete',
      data: { pdfFetched, pdfFailed, pdfFailureReasons },
    });

    const now = new Date().toISOString();
    const batch: TenderCaptureBatch = {
      id: crypto.randomUUID(),
      tenders: enrichedTenders,
      metadata: getMetadata(),
      status: 'review',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await saveTenderBatch(batch);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('Extension context invalidated')) {
        showExtensionReloadError();
      } else {
        showGemError(
          'Could not save tenders locally in the extension.',
          message || 'Try reloading the extension.',
        );
      }
      onComplete?.(false);
      return;
    }

    pingExtensionBackground();
    const response = await sendExtensionMessage<{
      success?: boolean;
      error?: string;
      hint?: string;
      pdfFetched?: number;
      pdfFailed?: number;
      pdfFailureReasons?: string[];
    }>({
      type: 'CAPTURE_GEM_TENDERS',
      payload: {
        batchId: batch.id,
        fetchPdfs: false,
        pdfFetched,
        pdfFailed,
        pdfFailureReasons,
      },
    });

    if (!response?.success) {
      showGemError(
        response?.error,
        response?.hint || 'Open chrome://extensions and reload FlexHRM Smart Capture.',
      );
      onComplete?.(false);
      return;
    }

    const fetched = Number(response.pdfFetched ?? pdfFetched) || 0;
    const failed = Number(response.pdfFailed ?? pdfFailed) || 0;
    const reasons =
      (Array.isArray(response.pdfFailureReasons) && response.pdfFailureReasons.length > 0
        ? response.pdfFailureReasons
        : pdfFailureReasons) ?? [];
    if (fetched > 0 || failed > 0) {
      const firstReason = reasons.length > 0 ? ` Reason: ${reasons[0]}.` : '';
      const msg =
        failed > 0
          ? `PDF details loaded for ${fetched} tender(s). ${failed} could not be read (listing data still saved).${firstReason}`
          : `PDF details loaded for ${fetched} tender(s). Review in sidebar.`;
      showGemToast(msg);
    } else {
      showGemToast(`${batch.tenders.length} tender(s) sent to FlexHRM sidebar.`);
    }
    onComplete?.(true, response);
  })();
}

function showGemToast(message: string, tone: 'info' | 'error' = 'info'): void {
  const id = 'flexhrm-gem-toast';
  document.getElementById(id)?.remove();
  const toast = document.createElement('div');
  toast.id = id;
  const bg = tone === 'error' ? '#991b1b' : '#1e3a8a';
  toast.style.cssText = `
    position: fixed; top: 16px; right: 16px; z-index: 2147483646;
    background: ${bg}; color: #fff; padding: 12px 16px; border-radius: 10px;
    font: 13px/1.45 system-ui, sans-serif; max-width: 380px; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), tone === 'error' ? 10000 : 6000);
}

function showGemError(error?: string, hint?: string): void {
  const message = [error || 'FlexHRM extension could not complete this action.', hint]
    .filter(Boolean)
    .join(' ');
  showGemToast(message, 'error');
}

function pullSelectedTenders() {
  const fab = document.getElementById(FAB_ID);
  fab?.classList.add('loading');
  setGemPullLoading(true);
  const tenders = extractSelectedTenders();
  captureGemTenders(tenders, () => {
    setGemPullLoading(false);
    fab?.classList.remove('loading');
  });
}

function syncSelectedTenderStatuses() {
  const tenders = extractSelectedTendersForStatusSync();
  if (!tenders.length) {
    alert('No GeM tenders selected. Tick checkboxes on tenders you want to sync.');
    return;
  }

  if (!isExtensionContextValid()) {
    showExtensionReloadError();
    return;
  }

  setGemSyncLoading(true);
  void (async () => {
    pingExtensionBackground();
    const response = await sendExtensionMessage<{
      success?: boolean;
      error?: string;
      hint?: string;
      updated?: number;
      notFound?: number;
      errors?: string[];
    }>({
      type: 'SYNC_TENDER_STATUSES',
      payload: { tenders },
    });

    setGemSyncLoading(false);

    if (!response?.success) {
      showGemError(
        response?.error,
        response?.hint || 'Connect the extension in Settings, then try again.',
      );
      return;
    }

    const updated = Number(response.updated) || 0;
    const notFound = Number(response.notFound) || 0;
    const errors = Array.isArray(response.errors) ? response.errors : [];
    let msg = `Synced status for ${updated} tender(s) in FlexHRM.`;
    if (notFound > 0) {
      msg += ` ${notFound} bid(s) not found — import them first with Pull & Read PDFs.`;
    }
    if (errors.length > 0) {
      msg += ` ${errors.length} error(s).`;
    }
    showGemToast(msg);
  })();
}

function setupGemListingUi() {
  if (!isGemListingPage()) return;
  injectGemSelectionUi();
}

function createFab() {
  if (document.getElementById(FAB_ID)) return;

  const fab = document.createElement('button');
  fab.id = FAB_ID;
  fab.title = 'FlexHRM Smart Capture';
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

function toggleMenu() {
  const existing = document.getElementById(MENU_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const menu = document.createElement('div');
  menu.id = MENU_ID;
  const actions = [
    {
      label: `Pull Selected (${getSelectedBidNos().length || 0})`,
      action: () => pullSelectedTenders(),
    },
    {
      label: `Sync Status (${getSelectedBidNos().length || 0})`,
      action: () => syncSelectedTenderStatuses(),
    },
    { label: 'Open Review Panel', action: () => requestOpenSidePanel() },
  ];

  for (const { label, action } of actions) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.style.opacity = '0.6';
      const original = btn.textContent;
      btn.textContent = 'Working…';
      action();
      window.setTimeout(() => {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.textContent = original;
      }, 1200);
      menu.remove();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
}

function setupExtensionMessageAck(): void {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'DRAFT_CREATED' || msg?.type === 'TENDER_BATCH_CREATED') {
      sendResponse({ ack: true });
      return true;
    }
    return false;
  });
}

function init() {
  if (window.self !== window.top) return;
  if (!isGemSellerBidsPage()) return;

  pingExtensionBackground();
  setupExtensionMessageAck();
  createFab();
  setupGemListingUi();
  document.addEventListener('flexhrm:pull-selected-tenders', pullSelectedTenders);
  document.addEventListener('flexhrm:sync-selected-tender-statuses', syncSelectedTenderStatuses);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (isGemSellerBidsPage()) setupGemListingUi();
    }, 500);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
