import { useEffect, useState } from 'react';
import { useCapturePanel } from './hooks/useCapturePanel';
import { DraftList } from './components/DraftList';
import { ReviewPanel } from './components/ReviewPanel';
import { TenderReviewPanel } from './TenderReviewPanel';
import { ContractReviewPanel } from './ContractReviewPanel';
import { loadConfig } from '../shared/services/secure-storage';
import { GEM_SELLER_BIDS_URL } from '../shared/utils/gem-url';
import { GEM_ORDERS_URL } from '../modules/contracts/gem-orders-url';
import { StatusAlert } from '../shared/components/StatusAlert';
import '../shared/styles/global.css';

export function App() {
  const [connectedAs, setConnectedAs] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const {
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
  } = useCapturePanel();

  useEffect(() => {
    void loadConfig().then((config) => {
      const configured = !!(config?.flexhrmUrl && config?.accessToken);
      setIsConfigured(configured);
      if (config?.username) setConnectedAs(config.username);
    });
  }, []);

  const viewingHistory =
    tab === 'history' && !!activeDraft && history.some((item) => item.id === activeDraft.id);

  const tabs = [
    { id: 'tenders' as const, label: 'GeM Tenders', badge: tenderBatch?.tenders.length },
    { id: 'contracts' as const, label: 'GeM Contracts', badge: contractBatch?.contracts.length },
    { id: 'review' as const, label: 'Review' },
    { id: 'drafts' as const, label: 'Drafts', badge: drafts.length },
    { id: 'history' as const, label: 'History', badge: history.length },
    { id: 'queue' as const, label: 'Queue', badge: queueCount },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src={chrome.runtime.getURL('src/assets/icon-48.png')}
              alt="FlexHRM"
              className="h-9 w-9 rounded-lg"
            />
            <div>
              <h1 className="text-base font-bold text-slate-900">FlexHRM Smart Capture</h1>
              <p className="text-xs text-slate-500">
                {connectedAs ? `Connected as ${connectedAs}` : 'Not connected — open Settings'}
              </p>
            </div>
          </div>
          <a
            href={chrome.runtime.getURL('src/options/index.html')}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Settings
          </a>
        </div>
        <nav className="mt-3 flex flex-wrap gap-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                tab === item.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {item.label}
              {item.badge ? ` (${item.badge})` : ''}
            </button>
          ))}
        </nav>
      </header>

      <main className="p-4">
        {!isConfigured && (
          <StatusAlert
            tone="warning"
            title="Not connected to FlexHRM"
            message="Tenders cannot be saved until you connect the extension."
            hint="Open Settings, paste your API URL and a fresh connection code from FlexHRM Profile → Browser Extension."
          />
        )}

        {tab === 'tenders' && tenderBatch && tenderBatch.status !== 'saved' && (
          <TenderReviewPanel
            batch={tenderBatch}
            onBatchChange={setTenderBatch}
            onSaved={refresh}
          />
        )}

        {tab === 'tenders' && (!tenderBatch || tenderBatch.status === 'saved') && (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No GeM tenders captured yet. Open{' '}
            <a href={GEM_SELLER_BIDS_URL} target="_blank" rel="noreferrer" className="text-blue-600 underline">
              GeM Seller Bids
            </a>{' '}
            and use <strong>Pull &amp; Read PDFs</strong>.
          </div>
        )}

        {tab === 'contracts' && contractBatch && contractBatch.status !== 'saved' && (
          <ContractReviewPanel
            batch={contractBatch}
            onBatchChange={setContractBatch}
            onSaved={refresh}
          />
        )}

        {tab === 'contracts' && (!contractBatch || contractBatch.status === 'saved') && (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No GeM orders captured yet. Open{' '}
            <a href={GEM_ORDERS_URL} target="_blank" rel="noreferrer" className="text-blue-600 underline">
              GeM Orders
            </a>{' '}
            and use <strong>Pull All Orders</strong>.
          </div>
        )}

        {tab === 'review' && activeDraft && !viewingHistory && (
          <ReviewPanel
            draft={activeDraft}
            duplicates={duplicates}
            saving={saving}
            message={message}
            onFieldChange={updateField}
            onSaveTargetChange={updateSaveTarget}
            onSave={handleSave}
          />
        )}

        {tab === 'review' && !activeDraft && (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No capture selected. Highlight text on a page or use the floating FH button.
          </div>
        )}

        {tab === 'drafts' && (
          <DraftList
            drafts={drafts}
            emptyMessage="No drafts yet."
            clearLabel="Clear all drafts"
            onClear={() => clearStore('drafts', 'draft(s)', drafts)}
            onDelete={(draft) => deleteStoreItem('drafts', draft)}
            onSelect={(draft) => selectDraft(draft, 'review')}
          />
        )}

        {tab === 'history' && !viewingHistory && (
          <DraftList
            drafts={history}
            emptyMessage="No saved captures yet."
            clearLabel="Clear all history"
            readOnly
            onClear={() => clearStore('history', 'history item(s)', history)}
            onDelete={(draft) => deleteStoreItem('history', draft)}
            onSelect={(draft) => selectDraft(draft, 'history')}
          />
        )}

        {tab === 'history' && viewingHistory && activeDraft && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                clearActiveDraft();
                setTab('history');
              }}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              ← Back to history
            </button>
            <ReviewPanel
              draft={activeDraft}
              duplicates={[]}
              saving={false}
              message=""
              readOnly
              onFieldChange={() => undefined}
              onSaveTargetChange={() => undefined}
              onSave={() => undefined}
            />
          </div>
        )}

        {tab === 'queue' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {queueCount} record(s) waiting to sync.
            </p>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={syncingQueue}
              onClick={async () => {
                setSyncingQueue(true);
                try {
                  await syncQueue();
                } finally {
                  setSyncingQueue(false);
                }
              }}
            >
              {syncingQueue && (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              {syncingQueue ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
