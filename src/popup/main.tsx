import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { sendExtensionMessage } from '../shared/utils/messaging';
import { GEM_SELLER_BIDS_URL, isActiveTabSellerBids } from '../shared/utils/gem-url';
import '../shared/styles/global.css';

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
  );
}

function Popup() {
  const [status, setStatus] = useState('');
  const [statusTone, setStatusTone] = useState<'ok' | 'error'>('ok');
  const [onSellerBids, setOnSellerBids] = useState(false);
  const [openingPanel, setOpeningPanel] = useState(false);
  const [syncingQueue, setSyncingQueue] = useState(false);

  useEffect(() => {
    void isActiveTabSellerBids().then(setOnSellerBids);
  }, []);

  const openPanel = async () => {
    setOpeningPanel(true);
    setStatus('');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        setStatusTone('error');
        setStatus('No active tab found.');
        return;
      }
      if (!tab.url || !tab.url.includes('/seller-bids')) {
        setStatusTone('error');
        setStatus('Open GeM Seller Bids first, then use the extension.');
        return;
      }
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    } finally {
      setOpeningPanel(false);
    }
  };

  const openSellerBids = async () => {
    await chrome.tabs.create({ url: GEM_SELLER_BIDS_URL });
    window.close();
  };

  const syncQueue = async () => {
    setSyncingQueue(true);
    setStatus('');
    try {
      const result = await sendExtensionMessage({ type: 'SYNC_OFFLINE_QUEUE' });
      setStatusTone('ok');
      setStatus(`Synced ${result?.synced ?? 0} queued record(s).`);
    } catch {
      setStatusTone('error');
      setStatus('Sync failed.');
    } finally {
      setSyncingQueue(false);
    }
  };

  return (
    <div className="w-72 p-4">
      <div className="flex items-center gap-2.5">
        <img
          src={chrome.runtime.getURL('src/assets/icon-48.png')}
          alt="FlexHRM"
          className="h-9 w-9 rounded-lg"
        />
        <div>
          <h1 className="text-sm font-bold text-slate-900">FlexHRM Smart Capture</h1>
          <p className="text-[11px] text-slate-500">GeM Seller Bids tender capture</p>
        </div>
      </div>

      {!onSellerBids ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Extension is inactive on this page. It only works on{' '}
          <strong>bidplus.gem.gov.in/seller-bids</strong>.
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          Active on GeM Seller Bids — select tenders and use Pull &amp; Read PDFs.
        </div>
      )}

      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={openPanel}
          disabled={openingPanel}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#ff791a] py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {openingPanel ? (
            <>
              <Spinner />
              Opening…
            </>
          ) : (
            'Open Side Panel'
          )}
        </button>
        {!onSellerBids && (
          <button
            type="button"
            onClick={openSellerBids}
            className="w-full rounded-md border border-slate-200 py-2 text-sm text-slate-700"
          >
            Open GeM Seller Bids
          </button>
        )}
        <button
          type="button"
          onClick={syncQueue}
          disabled={syncingQueue}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 py-2 text-sm text-slate-700 disabled:opacity-60"
        >
          {syncingQueue ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
              Syncing…
            </>
          ) : (
            'Sync Offline Queue'
          )}
        </button>
        <a
          href={chrome.runtime.getURL('src/options/index.html')}
          target="_blank"
          rel="noreferrer"
          className="block text-center text-xs text-blue-600 hover:underline"
        >
          Settings &amp; Connection
        </a>
      </div>
      {status && (
        <p className={`mt-3 text-xs ${statusTone === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
          {status}
        </p>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Popup />);
