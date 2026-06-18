import type { CaptureMetadata } from '../shared/types';
import { sendExtensionMessage, requestOpenSidePanel, postDebugLog } from '../shared/utils/messaging';
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

    const response = await sendExtensionMessage<{
      success?: boolean;
      error?: string;
      pdfFetched?: number;
      pdfFailed?: number;
      pdfFailureReasons?: string[];
    }>({
      type: 'CAPTURE_GEM_TENDERS',
      payload: {
        tenders: enrichedTenders,
        metadata: getMetadata(),
        fetchPdfs: false,
        pdfFetched,
        pdfFailed,
        pdfFailureReasons,
      },
    });

    if (!response) {
      alert(
        'FlexHRM extension is not responding. Open chrome://extensions and click Reload on FlexHRM Smart Capture.',
      );
      onComplete?.(false);
      return;
    }
    if (response.success) {
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
      }
      onComplete?.(true, response);
      return;
    }
    alert(response.error || 'Import failed. Reload the extension and try again.');
    onComplete?.(false);
  })();
}

function showGemToast(message: string): void {
  const id = 'flexhrm-gem-toast';
  document.getElementById(id)?.remove();
  const toast = document.createElement('div');
  toast.id = id;
  toast.style.cssText = `
    position: fixed; top: 16px; right: 16px; z-index: 2147483646;
    background: #1e3a8a; color: #fff; padding: 12px 16px; border-radius: 10px;
    font: 13px system-ui, sans-serif; max-width: 360px; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 6000);
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

  setGemSyncLoading(true);
  void (async () => {
    const response = await sendExtensionMessage<{
      success?: boolean;
      error?: string;
      updated?: number;
      notFound?: number;
      errors?: string[];
    }>({
      type: 'SYNC_TENDER_STATUSES',
      payload: { tenders },
    });

    setGemSyncLoading(false);

    if (!response) {
      alert(
        'FlexHRM extension is not responding. Open chrome://extensions and click Reload on FlexHRM Smart Capture.',
      );
      return;
    }
    if (!response.success) {
      alert(response.error || 'Status sync failed. Check extension settings and try again.');
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
