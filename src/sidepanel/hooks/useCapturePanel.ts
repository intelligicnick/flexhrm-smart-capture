import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptureDraft, ContractCaptureBatch, DuplicateMatch, TenderCaptureBatch } from '../../shared/types';
import type { CaptureStoreKind } from '../../shared/services/capture-store';
import {
  clearCaptureStore,
  removeCaptureItem,
} from '../../shared/services/capture-store';
import {
  deleteDraft,
  getDrafts,
  getHistory,
  getQueue,
  saveDraft,
} from '../../shared/services/storage';
import { getLatestTenderBatch, getTenderBatches } from '../../shared/services/tender-storage';
import { getContractBatches } from '../../shared/services/contract-storage';
import { confirmDeleteAll, confirmDeleteOne } from '../../shared/utils/confirm-delete';
import { getDraftTitle } from '../../shared/utils/draft-display';
import { EXTENSION_EVENT_KEY, sendExtensionMessage } from '../../shared/utils/messaging';

export type PanelTab = 'review' | 'tenders' | 'contracts' | 'drafts' | 'history' | 'queue';

export function useCapturePanel() {
  const [tab, setTab] = useState<PanelTab>('review');
  const [drafts, setDrafts] = useState<CaptureDraft[]>([]);
  const [history, setHistory] = useState<CaptureDraft[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const [activeDraft, setActiveDraft] = useState<CaptureDraft | null>(null);
  const [tenderBatch, setTenderBatch] = useState<TenderCaptureBatch | null>(null);
  const [contractBatch, setContractBatch] = useState<ContractCaptureBatch | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const activeDraftIdRef = useRef<string | null>(null);
  activeDraftIdRef.current = activeDraft?.id ?? null;

  const refresh = useCallback(async () => {
    const [nextDrafts, nextHistory, queue, tenderBatches, contractBatches] = await Promise.all([
      getDrafts(),
      getHistory(),
      getQueue(),
      getTenderBatches(),
      getContractBatches(),
    ]);

    setDrafts(nextDrafts);
    setHistory(nextHistory);
    setQueueCount(queue.length);

    const latestBatch = (await getLatestTenderBatch()) ?? tenderBatches[0] ?? null;
    setTenderBatch(latestBatch);

    const latestContractBatch = contractBatches[0] ?? null;
    setContractBatch(latestContractBatch);

    if (latestContractBatch && latestContractBatch.status !== 'saved') {
      setTab('contracts');
    } else if (latestBatch && latestBatch.status !== 'saved') {
      setTab('tenders');
    }

    const activeId = activeDraftIdRef.current;
    if (activeId) {
      const stillExists =
        nextDrafts.find((draft) => draft.id === activeId) ??
        nextHistory.find((draft) => draft.id === activeId);
      setActiveDraft(stillExists ?? null);
      return;
    }

    if (nextDrafts[0] && !latestBatch && !latestContractBatch) {
      setActiveDraft(nextDrafts[0]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>) => {
      const eventChange = changes[EXTENSION_EVENT_KEY];
      if (eventChange?.newValue) {
        const event = eventChange.newValue as {
          type?: string;
          payload?: TenderCaptureBatch | ContractCaptureBatch;
        };
        if (event.type === 'TENDER_BATCH_CREATED' && event.payload && 'tenders' in event.payload) {
          setTenderBatch(event.payload as TenderCaptureBatch);
          setTab('tenders');
        }
        if (
          event.type === 'CONTRACT_BATCH_CREATED' &&
          event.payload &&
          'contracts' in event.payload
        ) {
          setContractBatch(event.payload as ContractCaptureBatch);
          setTab('contracts');
        }
      }
      if (eventChange) void refresh();
    };
    chrome.storage.session.onChanged.addListener(onStorage);
    return () => chrome.storage.session.onChanged.removeListener(onStorage);
  }, [refresh]);

  useEffect(() => {
    if (!activeDraft) {
      setDuplicates([]);
      return;
    }

    void sendExtensionMessage({
      type: 'RUN_DUPLICATE_CHECK',
      payload: activeDraft,
    }).then((result) => {
      setDuplicates((result?.matches as DuplicateMatch[] | undefined) ?? []);
    });
  }, [activeDraft?.id]);

  const updateField = useCallback((field: keyof CaptureDraft['extracted'], value: string) => {
    setActiveDraft((current) => {
      if (!current) return current;
      const updated = {
        ...current,
        extracted: { ...current.extracted, [field]: value },
        updatedAt: new Date().toISOString(),
      };
      void saveDraft(updated);
      return updated;
    });
  }, []);

  const updateSaveTarget = useCallback((saveTarget: CaptureDraft['saveTarget']) => {
    setActiveDraft((current) => {
      if (!current) return current;
      const updated = { ...current, saveTarget };
      void saveDraft(updated);
      return updated;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeDraft) return;
    setSaving(true);
    setMessage('');
    try {
      const result = await sendExtensionMessage({
        type: 'SAVE_DRAFT',
        payload: { ...activeDraft, status: 'review' },
      });
      if (result?.queued) {
        setMessage('Saved offline — will sync when connection is restored.');
      } else {
        setMessage(`Saved successfully (ID: ${result?.id ?? 'ok'}).`);
        await deleteDraft(activeDraft.id);
        setActiveDraft(null);
      }
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [activeDraft, refresh]);

  const selectDraft = useCallback((draft: CaptureDraft, nextTab: PanelTab = 'review') => {
    setActiveDraft(draft);
    setTab(nextTab);
  }, []);

  const clearActiveDraft = useCallback(() => {
    setActiveDraft(null);
  }, []);

  const clearStore = useCallback(
    async (kind: CaptureStoreKind, label: string, items: CaptureDraft[]) => {
      if (!confirmDeleteAll(items.length, label)) return;
      await clearCaptureStore(kind);
      if (kind === 'drafts' && activeDraftIdRef.current) {
        setActiveDraft(null);
      }
      await refresh();
    },
    [refresh],
  );

  const deleteStoreItem = useCallback(
    async (kind: CaptureStoreKind, draft: CaptureDraft) => {
      if (!confirmDeleteOne(getDraftTitle(draft))) return;
      await removeCaptureItem(kind, draft.id);
      if (activeDraftIdRef.current === draft.id) {
        setActiveDraft(null);
      }
      await refresh();
    },
    [refresh],
  );

  const syncQueue = useCallback(async () => {
    await sendExtensionMessage({ type: 'SYNC_OFFLINE_QUEUE' });
    await refresh();
  }, [refresh]);

  return {
    tab,
    setTab,
    drafts,
    history,
    queueCount,
    activeDraft,
    tenderBatch,
    setTenderBatch,
    contractBatch,
    setContractBatch,
    duplicates,
    saving,
    message,
    refresh,
    updateField,
    updateSaveTarget,
    handleSave,
    selectDraft,
    clearActiveDraft,
    clearStore,
    deleteStoreItem,
    syncQueue,
  };
}
