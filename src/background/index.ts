import type { CaptureDraft, CaptureMetadata, ContractCaptureBatch, TenderCaptureBatch } from '../shared/types';
import { saveDraft } from '../shared/services/storage';
import {
  getTenderBatches,
  saveTenderBatch,
  getLatestTenderBatch,
} from '../shared/services/tender-storage';
import {
  getContractBatches,
  saveContractBatch,
} from '../shared/services/contract-storage';
import { loadConfig } from '../shared/services/secure-storage';
import {
  extractData,
  processOfflineQueue,
  saveWithOfflineFallback,
  checkDuplicates,
  importTenders,
  checkTenderDuplicates,
  syncTenderStatuses,
  importContracts,
  checkContractDuplicates,
} from '../shared/services/flexhrm-api';
import { buildDraftFromContent, enrichDraftWithExtraction } from '../modules/resume/parser';
import { validateCapture } from '../modules/capture/validation';
import { isPdfUrl } from '../modules/pdf/extractor';
import { fetchGemBidPdfText } from '../modules/tenders/gem-pdf-fetch';
import { parseGemBidPdfText } from '../modules/tenders/gem-pdf-parser';
import {
  applyPdfDetailsToTender,
  enrichTendersFromPdfs,
} from '../modules/tenders/gem-pdf-enrich';
import type { ExtractedTender } from '../shared/types';
import { EMPTY_TENDER } from '../shared/types';
import type { GemPdfDetails } from '../modules/tenders/gem-pdf-parser';
import { broadcastExtensionEvent, isIgnorableRuntimeError } from '../shared/utils/messaging';
import { formatThrownError, formatUserFacingErrorText } from '../shared/utils/api-error-messages';
import { FlexHRMApiError } from '../shared/services/flexhrm-api';
const CONTEXT_MENU_ID = 'flexhrm-save-selection';
const SELLER_BIDS_MATCH = 'https://bidplus.gem.gov.in/seller-bids*';

function tenderFromPdfDetails(
  bidNo: string,
  details: GemPdfDetails,
  gemDocUrl: string,
  docId: string,
): ExtractedTender {
  return {
    ...EMPTY_TENDER,
    bidNo,
    ministry: details.ministry,
    organisation: details.organisation,
    consigneeOfficer: details.consigneeOfficer,
    department: details.organisation,
    officerName: details.consigneeOfficer,
    address: details.address || details.preBidAddress,
    rate: details.rate,
    additionalRequirements: details.additionalRequirements,
    preBidAt: details.preBidAt,
    preBidVenue: details.preBidAddress,
    startDate: details.startDate,
    gemStartDate: details.startDate,
    endDate: details.endDate,
    gemEndDate: details.endDate,
    noPreBid: details.noPreBid,
    notes: details.description,
    description: details.description,
    gemDocUrl,
    gemDocId: docId,
    entryDate: new Date().toISOString().slice(0, 10),
    sourceUrl: gemDocUrl,
  };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Save to FlexHRM',
    contexts: ['selection'],
    documentUrlPatterns: [SELLER_BIDS_MATCH],
  });

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([
      {
        id: 'seller-bids-only',
        conditions: [
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostEquals: 'bidplus.gem.gov.in', pathPrefix: '/seller-bids' },
          }),
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostEquals: 'fulfilment.gem.gov.in' },
          }),
        ],
        actions: [new chrome.declarativeContent.ShowAction()],
      },
    ]);
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void (async () => {
    try {
      if (!tab?.id) return;

      await chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined);

      const metadata: CaptureMetadata = {
        sourceUrl: tab.url ?? '',
        sourceTitle: tab.title ?? '',
        sourceSite: tab.url ? new URL(tab.url).hostname : '',
        capturedAt: new Date().toISOString(),
        capturedBy: (await loadConfig())?.username ?? 'unknown',
        captureType: info.mediaType === 'image' ? 'image' : 'selection',
      };

      let content = info.selectionText ?? '';
      if (info.mediaType === 'image' && info.srcUrl) {
        content = `Image URL: ${info.srcUrl}`;
      }

      const captureType: CaptureMetadata['captureType'] =
        info.mediaType === 'image' ? 'image' : 'selection';
      const validation = validateCapture(content, captureType, metadata.sourceUrl);
      if (!validation.accepted) return;

      const draft = buildDraftFromContent({ content, metadata: { ...metadata, captureType } });
      await saveDraft(draft);
      await broadcastExtensionEvent({ type: 'DRAFT_CREATED', payload: draft });
    } catch {
      // Ignore menu handler failures.
    }
  })();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let responded = false;
  const reply = (response: unknown) => {
    if (responded) return;
    responded = true;
    try {
      sendResponse(response);
    } catch {
      // Message port already closed.
    }
  };

  void handleMessage(message, sender)
    .then(reply)
    .catch((err) => {
      const facing =
        err instanceof FlexHRMApiError ? err.userFacing : formatThrownError(err, 'save');
      reply({ success: false, error: formatUserFacingErrorText(facing), userFacing: facing });
    });
  return true;
});

async function openSidePanel(tabId?: number): Promise<void> {
  try {
    if (tabId) {
      await chrome.sidePanel.open({ tabId }).catch(() => undefined);
      return;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
    }
  } catch {
    // Side panel may fail without a user gesture.
  }
}

async function handleMessage(
  message: { type: string; payload?: unknown },
  sender?: chrome.runtime.MessageSender,
) {
  switch (message.type) {
    case 'PING':
      return { success: true, pong: true };

    case 'DEBUG_LOG': {
      const payload = (message.payload ?? {}) as Record<string, unknown>;
      void fetch('http://127.0.0.1:3001/api/health/debug-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, timestamp: Date.now() }),
      }).catch(() => undefined);
      return { ok: true };
    }

    case 'CAPTURE_GEM_TENDERS': {
      const payload = message.payload as {
        batchId?: string;
        tenders?: TenderCaptureBatch['tenders'];
        metadata?: CaptureMetadata;
        fetchPdfs?: boolean;
        pdfFetched?: number;
        pdfFailed?: number;
        pdfFailureReasons?: string[];
      };

      const pdfFetched = payload.pdfFetched ?? 0;
      const pdfFailed = payload.pdfFailed ?? 0;
      const pdfFailureReasons = payload.pdfFailureReasons ?? [];

      let batch: TenderCaptureBatch | null = null;
      if (payload.batchId) {
        batch = (await getTenderBatches()).find((item) => item.id === payload.batchId) ?? null;
        if (!batch) {
          throw new FlexHRMApiError({
            title: 'Capture failed',
            message: 'Tender batch could not be loaded after save.',
            hint: 'Reload the extension at chrome://extensions, refresh this page, and try again.',
          });
        }
      } else if (payload.tenders?.length && payload.metadata) {
        const now = new Date().toISOString();
        let tenders = payload.tenders;
        let fetched = pdfFetched;
        let failed = pdfFailed;
        let failureReasons = pdfFailureReasons;

        if (payload.fetchPdfs !== false) {
          const enriched = await enrichTendersFromPdfs(tenders, sender?.tab?.id);
          tenders = enriched.tenders;
          fetched = enriched.pdfFetched;
          failed = enriched.pdfFailed;
          failureReasons = enriched.pdfFailureReasons;
        }

        batch = {
          id: crypto.randomUUID(),
          tenders,
          metadata: payload.metadata,
          status: 'review',
          createdAt: now,
          updatedAt: now,
        };
        await saveTenderBatch(batch);
      } else {
        throw new FlexHRMApiError({
          title: 'Capture failed',
          message: 'No tender data was received from the GeM page.',
          hint: 'Select tenders with the checkboxes, then click Pull & Read PDFs again.',
        });
      }

      if (sender?.tab?.id) {
        await chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => undefined);
      }
      await broadcastExtensionEvent({ type: 'TENDER_BATCH_CREATED', payload: batch });
      return {
        success: true,
        count: batch.tenders.length,
        pdfFetched,
        pdfFailed,
        pdfFailureReasons,
        batch,
      };
    }

    case 'CHECK_TENDER_DUPLICATES': {
      const batch = message.payload as TenderCaptureBatch;
      const config = await loadConfig();
      if (!config) return { existing: [] };
      const bidNos = batch.tenders.map((t) => t.bidNo);
      return checkTenderDuplicates(config, bidNos);
    }

    case 'SAVE_TENDER_BATCH': {
      const batch = message.payload as TenderCaptureBatch;
      const config = await loadConfig();
      if (!config?.flexhrmUrl || !config.accessToken) {
        throw new FlexHRMApiError({
          title: 'Not connected',
          message: 'FlexHRM is not connected yet.',
          hint: 'Open extension Settings, enter your API URL, and connect with a code from FlexHRM Profile → Browser Extension.',
        });
      }
      const result = await importTenders(config, batch.tenders);
      batch.status = 'saved';
      batch.updatedAt = new Date().toISOString();
      await saveTenderBatch(batch);
      return { success: true, ...result };
    }

    case 'CAPTURE_GEM_CONTRACTS': {
      const payload = message.payload as { batchId?: string };
      let batch: ContractCaptureBatch | null = null;
      if (payload.batchId) {
        batch = (await getContractBatches()).find((item) => item.id === payload.batchId) ?? null;
        if (!batch) {
          throw new FlexHRMApiError({
            title: 'Capture failed',
            message: 'Contract batch could not be loaded after save.',
            hint: 'Reload the extension at chrome://extensions, refresh the GeM Orders page, and try again.',
          });
        }
      } else {
        throw new FlexHRMApiError({
          title: 'Capture failed',
          message: 'No GeM order data was received.',
          hint: 'Open GeM Orders and click Pull All Orders again.',
        });
      }

      if (sender?.tab?.id) {
        await chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => undefined);
      }
      await broadcastExtensionEvent({ type: 'CONTRACT_BATCH_CREATED', payload: batch });
      return { success: true, count: batch.contracts.length, batch };
    }

    case 'CHECK_CONTRACT_DUPLICATES': {
      const batch = message.payload as ContractCaptureBatch;
      const config = await loadConfig();
      if (!config) return { existing: [] };
      const keys = batch.contracts.map(
        (c) => c.gemContractPdfUrl || c.contractNo,
      );
      return checkContractDuplicates(config, keys);
    }

    case 'SAVE_CONTRACT_BATCH': {
      const batch = message.payload as ContractCaptureBatch;
      const config = await loadConfig();
      if (!config?.flexhrmUrl || !config.accessToken) {
        throw new FlexHRMApiError({
          title: 'Not connected',
          message: 'FlexHRM is not connected yet.',
          hint: 'Open extension Settings, enter your API URL, and connect with a code from FlexHRM Profile → Browser Extension.',
        });
      }
      const result = await importContracts(config, batch.contracts);
      batch.status = 'saved';
      batch.updatedAt = new Date().toISOString();
      await saveContractBatch(batch);
      return { success: true, ...result };
    }

    case 'SYNC_TENDER_STATUSES': {
      const payload = message.payload as { tenders: ExtractedTender[] };
      const config = await loadConfig();
      if (!config?.flexhrmUrl || !config.accessToken) {
        throw new FlexHRMApiError({
          title: 'Not connected',
          message: 'FlexHRM is not connected yet.',
          hint: 'Open extension Settings, enter your API URL, and connect with a code from FlexHRM Profile → Browser Extension.',
        });
      }
      const result = await syncTenderStatuses(config, payload.tenders || []);
      return { success: true, ...result };
    }

    case 'ENRICH_GEM_PDF': {
      const payload = message.payload as { url: string; docId?: string };
      if (sender?.tab?.id) {
        await chrome.sidePanel.open({ tabId: sender.tab.id });
      }
      const pdfText = await fetchGemBidPdfText(payload.url, sender?.tab?.id);
      const details = parseGemBidPdfText(pdfText);
      const bidFromPdf = pdfText.match(/GEM\/\d{4}\/B\/\d+/i)?.[0]?.toUpperCase() ?? '';
      const docId = payload.docId || payload.url.match(/showbidDocument\/(\d+)/i)?.[1] || '';
      const gemDocUrl = payload.url;

      let batch = (await getLatestTenderBatch()) ?? null;
      const now = new Date().toISOString();
      const applyPdfDetails = (tender: ExtractedTender): ExtractedTender =>
        applyPdfDetailsToTender(tender, pdfText, gemDocUrl, docId);

      const matchesTender = (t: ExtractedTender): boolean => {
        if (docId && (t.gemDocId === docId || t.gemDocUrl.includes(docId))) return true;
        if (gemDocUrl && t.gemDocUrl === gemDocUrl) return true;
        if (bidFromPdf && t.bidNo.toUpperCase() === bidFromPdf) return true;
        return false;
      };

      if (batch) {
        const idx = batch.tenders.findIndex(matchesTender);
        if (idx >= 0) {
          batch.tenders[idx] = applyPdfDetails(batch.tenders[idx]);
        } else if (bidFromPdf) {
          batch.tenders.unshift(
            applyPdfDetails(tenderFromPdfDetails(bidFromPdf, details, gemDocUrl, docId)),
          );
        }
        batch.updatedAt = now;
        batch.status = 'review';
        await saveTenderBatch(batch);
      } else {
        batch = {
          id: crypto.randomUUID(),
          tenders: [
            applyPdfDetails(
              tenderFromPdfDetails(
                bidFromPdf || `GEM/DOC/${docId || 'unknown'}`,
                details,
                gemDocUrl,
                docId,
              ),
            ),
          ],
          metadata: {
            sourceUrl: gemDocUrl,
            sourceTitle: 'GeM Bid PDF',
            sourceSite: 'bidplus.gem.gov.in',
            capturedAt: now,
            capturedBy: (await loadConfig())?.username ?? 'extension-user',
            captureType: 'pdf',
          },
          status: 'review',
          createdAt: now,
          updatedAt: now,
        };
        await saveTenderBatch(batch);
      }

      await broadcastExtensionEvent({ type: 'TENDER_BATCH_CREATED', payload: batch });
      return {
        success: true,
        details,
        batch,
        extracted: {
          preBidAt: details.preBidAt,
          rate: details.rate,
          descriptionLength: details.description.length,
          textLength: pdfText.length,
        },
      };
    }

    case 'CAPTURE_CONTENT': {
      const payload = message.payload as {
        content: string;
        htmlContent?: string;
        imageBase64?: string;
        tableData?: Record<string, unknown>[];
        metadata: CaptureMetadata;
      };

      const validation = validateCapture(
        payload.content,
        payload.metadata.captureType,
        payload.metadata.sourceUrl,
      );
      if (!validation.accepted) {
        return { success: false, rejected: true, reason: validation.reason };
      }

      const draft = buildDraftFromContent(payload);
      const config = await loadConfig();
      if (config?.accessToken && config.flexhrmUrl) {
        try {
          const extracted = await extractData(config, payload.content, payload.metadata.captureType);
          Object.assign(draft, enrichDraftWithExtraction(draft, extracted));
        } catch {
          // Keep local extraction
        }
      }
      await saveDraft(draft);
      return { success: true, draft };
    }

    case 'RUN_DUPLICATE_CHECK': {
      const draft = message.payload as CaptureDraft;
      const config = await loadConfig();
      if (!config) return { hasDuplicates: false, matches: [] };
      return checkDuplicates(config, {
        email: draft.extracted.email,
        mobile: draft.extracted.mobile,
        fullName: draft.extracted.fullName,
      });
    }

    case 'SAVE_DRAFT': {
      const draft = message.payload as CaptureDraft;
      const config = await loadConfig();
      if (!config?.flexhrmUrl || !config.accessToken) {
        throw new FlexHRMApiError({
          title: 'Not connected',
          message: 'FlexHRM is not connected yet.',
          hint: 'Open extension Settings, enter your API URL, and connect with a code from FlexHRM Profile → Browser Extension.',
        });
      }
      const result = await saveWithOfflineFallback(config, draft);
      if (!result.queued) {
        const { addToHistory } = await import('../shared/services/storage');
        await addToHistory({ ...draft, status: 'saved' });
      }
      return { success: true, ...result };
    }

    case 'BULK_CAPTURE_TABS': {
      const config = await loadConfig();
      if (!config?.accessToken) throw new Error('Not configured');
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const results = [];
      for (const tab of tabs) {
        if (!tab.id || !tab.url?.startsWith('http')) continue;
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({
            content: document.body.innerText.slice(0, 10000),
            title: document.title,
            url: window.location.href,
          }),
        });
        const data = result as { content: string; title: string; url: string };
        const metadata: CaptureMetadata = {
          sourceUrl: data.url,
          sourceTitle: data.title,
          sourceSite: new URL(data.url).hostname,
          capturedAt: new Date().toISOString(),
          capturedBy: config.username,
          captureType: 'text',
        };
        const draft = buildDraftFromContent({ content: data.content, metadata });
        await saveDraft(draft);
        results.push(draft.id);
      }
      return { success: true, captured: results.length, draftIds: results };
    }

    case 'SYNC_OFFLINE_QUEUE': {
      const config = await loadConfig();
      if (!config) return { processed: 0 };
      const processed = await processOfflineQueue(config);
      return { processed };
    }

    case 'DETECT_PDF': {
      const url = String((message.payload as { url?: string })?.url ?? '');
      return { isPdf: isPdfUrl(url) };
    }

    case 'OPEN_SIDE_PANEL': {
      const tabId =
        (message.payload as { tabId?: number })?.tabId ?? sender?.tab?.id;
      await openSidePanel(tabId);
      return { success: true };
    }

    case 'CAPTURE_SCREENSHOT': {
      const mode = (message.payload as { mode?: string })?.mode ?? 'visible';
      const tabId = (message.payload as { tabId?: number })?.tabId;
      if (mode === 'full' && tabId) {
        const dataUrl = await captureFullPage(tabId);
        return { success: true, dataUrl };
      }
      const dataUrl = await captureVisibleTab();
      return { success: true, dataUrl };
    }

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

async function captureVisibleTab(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(dataUrl);
    });
  });
}

async function captureFullPage(tabId: number): Promise<string> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const width = document.documentElement.scrollWidth;
      const height = document.documentElement.scrollHeight;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      return canvas.toDataURL('image/png');
    },
  });
  return String(result ?? '');
}

// Retry offline queue when back online
chrome.alarms?.create?.('sync-queue', { periodInMinutes: 5 });
chrome.alarms?.onAlarm?.addListener((alarm) => {
  void (async () => {
    try {
      if (alarm.name !== 'sync-queue') return;
      const config = await loadConfig();
      if (config && navigator.onLine) {
        await processOfflineQueue(config);
      }
    } catch {
      // Ignore background sync failures.
    }
  })();
});

self.addEventListener('online', () => {
  void (async () => {
    try {
      const config = await loadConfig();
      if (config) await processOfflineQueue(config);
    } catch {
      // Ignore background sync failures.
    }
  })();
});

self.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : '';
  if (isIgnorableRuntimeError(message)) {
    event.preventDefault();
  }
});
