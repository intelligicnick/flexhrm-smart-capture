import type { CaptureDraft } from '../types';

const DRAFTS_KEY = 'capture_drafts';
const HISTORY_KEY = 'capture_history';

export type CaptureStoreKind = 'drafts' | 'history';

const STORE_CONFIG: Record<CaptureStoreKind, { key: string; limit: number }> = {
  drafts: { key: DRAFTS_KEY, limit: 100 },
  history: { key: HISTORY_KEY, limit: 200 },
};

async function readStore(kind: CaptureStoreKind): Promise<CaptureDraft[]> {
  const { key } = STORE_CONFIG[kind];
  const result = await chrome.storage.local.get(key);
  return (result[key] as CaptureDraft[]) ?? [];
}

async function writeStore(kind: CaptureStoreKind, items: CaptureDraft[]): Promise<void> {
  const { key, limit } = STORE_CONFIG[kind];
  await chrome.storage.local.set({ [key]: items.slice(0, limit) });
}

export async function listCaptureStore(kind: CaptureStoreKind): Promise<CaptureDraft[]> {
  return readStore(kind);
}

export async function upsertCaptureItem(
  kind: CaptureStoreKind,
  item: CaptureDraft,
): Promise<void> {
  const items = await readStore(kind);
  const index = items.findIndex((entry) => entry.id === item.id);
  if (index >= 0) items[index] = item;
  else items.unshift(item);
  await writeStore(kind, items);
}

export async function removeCaptureItem(kind: CaptureStoreKind, id: string): Promise<void> {
  const items = (await readStore(kind)).filter((entry) => entry.id !== id);
  await writeStore(kind, items);
}

export async function clearCaptureStore(kind: CaptureStoreKind): Promise<void> {
  await writeStore(kind, []);
}
