import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { FlexHRMConfig } from '../shared/types';
import { loadConfig, saveConfig, clearConfig } from '../shared/services/secure-storage';
import { connectWithCode, FlexHRMApiError, testConnection } from '../shared/services/flexhrm-api';
import { GEM_SELLER_BIDS_URL } from '../shared/utils/gem-url';
import { formatThrownError, type UserFacingError } from '../shared/utils/api-error-messages';
import { StatusAlert } from '../shared/components/StatusAlert';
import '../shared/styles/global.css';

function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden
    />
  );
}

function OptionsPage() {
  const [config, setConfig] = useState<FlexHRMConfig>({
    flexhrmUrl: 'http://localhost:3001',
    apiKey: '',
    accessToken: '',
    organizationId: 'default',
    username: '',
  });
  const [connectionCode, setConnectionCode] = useState('');
  const [statusAlert, setStatusAlert] = useState<UserFacingError | null>(null);
  const [statusTone, setStatusTone] = useState<'ok' | 'error'>('ok');
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [connectedAs, setConnectedAs] = useState('');

  useEffect(() => {
    loadConfig().then((saved) => {
      if (!saved) return;
      setConfig(saved);
      if (saved.username) {
        setConnectedAs(saved.username);
      }
    });
  }, []);

  const showStatus = (next: UserFacingError | string, tone: 'ok' | 'error' = 'ok') => {
    if (typeof next === 'string') {
      setStatusTone(tone);
      setStatusAlert(
        tone === 'ok'
          ? { title: 'Success', message: next }
          : { title: 'Something went wrong', message: next },
      );
      return;
    }
    setStatusTone(tone);
    setStatusAlert(next);
  };

  const setError = (err: unknown, context: 'connect' | 'test' = 'connect') => {
    if (err instanceof FlexHRMApiError) {
      showStatus(err.userFacing, 'error');
      return;
    }
    showStatus(formatThrownError(err, context), 'error');
  };

  const handleConnect = async () => {
    if (!connectionCode.trim()) {
      showStatus('Enter the connection code from FlexHRM profile.', 'error');
      return;
    }
    if (!config.flexhrmUrl.trim()) {
      showStatus('Enter your FlexHRM URL first.', 'error');
      return;
    }

    setConnecting(true);
    setStatusAlert(null);
    try {
      const connected = await connectWithCode(config.flexhrmUrl, connectionCode);
      await saveConfig(connected);
      setConfig(connected);
      setConnectedAs(connected.username);
      setConnectionCode('');
      showStatus({
        title: 'Connected',
        message: `Signed in as ${connected.username}.`,
        hint: 'Open GeM Seller Bids to capture tenders.',
      });
    } catch (err) {
      setError(err, 'connect');
    } finally {
      setConnecting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveConfig(config);
      setConnectedAs(config.username);
      showStatus({ title: 'Saved', message: 'Configuration saved securely.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setStatusAlert(null);
    try {
      await testConnection(config);
      showStatus({ title: 'Connection OK', message: 'FlexHRM API is reachable and your session is valid.' });
    } catch (err) {
      setError(err, 'test');
    } finally {
      setTesting(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearConfig();
      setConnectedAs('');
      showStatus({ title: 'Cleared', message: 'Saved credentials were removed from this extension.' });
    } finally {
      setClearing(false);
    }
  };

  const update = (key: keyof FlexHRMConfig, value: string) => {
    setConfig((c) => ({ ...c, [key]: value }));
  };

  return (
    <div className="mx-auto max-w-xl p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e293b] text-sm font-bold text-[#ff791a]">
          FH
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">FlexHRM Smart Capture</h1>
          <p className="text-sm text-slate-500">Connect and configure the GeM tender extension</p>
        </div>
      </div>

      {connectedAs && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Connected as <strong>{connectedAs}</strong>
        </div>
      )}

      <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
        <h2 className="text-sm font-bold text-slate-900">Connect with code</h2>
        <p className="mt-1 text-xs text-slate-600">
          In FlexHRM, open your profile → <strong>Browser Extension</strong> → copy the API URL and
          connection code.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">FlexHRM API URL</label>
            <input
              type="text"
              value={config.flexhrmUrl}
              onChange={(e) => update('flexhrmUrl', e.target.value)}
              placeholder="https://your-api.hostingersite.com"
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Paste your FlexHRM login URL or API URL — split hosting is resolved automatically.
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Connection Code</label>
            <input
              type="text"
              value={connectionCode}
              onChange={(e) => setConnectionCode(e.target.value.toUpperCase())}
              placeholder="FH-ABC123"
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-sm tracking-widest"
            />
          </div>
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#ff791a] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {connecting ? (
              <>
                <Spinner />
                Connecting…
              </>
            ) : (
              'Connect Extension'
            )}
          </button>
        </div>
      </section>

      <details className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">
          Advanced: manual token
        </summary>
        <div className="mt-4 space-y-3">
          {(
            [
              ['accessToken', 'Access Token', 'Bearer token from FlexHRM login'],
              ['apiKey', 'API Key (optional)', ''],
              ['organizationId', 'Organization ID', 'default'],
              ['username', 'Your Name', 'Recruiter name for audit logs'],
            ] as const
          ).map(([key, label, placeholder]) => (
            <div key={key}>
              <label className="text-xs font-semibold text-slate-500">{label}</label>
              <input
                type={key === 'accessToken' || key === 'apiKey' ? 'password' : 'text'}
                value={config[key]}
                onChange={(e) => update(key, e.target.value)}
                placeholder={placeholder}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      </details>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving && <Spinner />}
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm disabled:opacity-60"
        >
          {testing && <Spinner />}
          {testing ? 'Testing…' : 'Test Connection'}
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={clearing}
          className="flex items-center gap-2 rounded-md border border-red-200 px-4 py-2 text-sm text-red-600 disabled:opacity-60"
        >
          {clearing && <Spinner />}
          {clearing ? 'Clearing…' : 'Clear Credentials'}
        </button>
      </div>

      {statusAlert && (
        <div className="mt-4">
          <StatusAlert
            tone={statusTone === 'error' ? 'error' : 'ok'}
            title={statusAlert.title}
            message={statusAlert.message}
            hint={statusAlert.hint}
          />
        </div>
      )}

      <section className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <h2 className="font-semibold text-slate-800">GeM activation</h2>
        <p className="mt-2">
          This extension only runs on{' '}
          <a href={GEM_SELLER_BIDS_URL} className="font-medium text-blue-600 hover:underline">
            GeM Seller Bids
          </a>
          . Open that page after connecting to see checkboxes and capture tools.
        </p>
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<OptionsPage />);
