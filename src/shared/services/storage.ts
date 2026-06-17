import type { CaptureDraft, QueuedRecord } from '../types';
import {
  clearCaptureStore,
  listCaptureStore,
  removeCaptureItem,
  upsertCaptureItem,
} from './capture-store';

const QUEUE_KEY = 'offline_queue';

export async function getDrafts(): Promise<CaptureDraft[]> {
  return listCaptureStore('drafts');
}

export async function saveDraft(draft: CaptureDraft): Promise<void> {
  await upsertCaptureItem('drafts', draft);
}

export async function deleteDraft(id: string): Promise<void> {
  await removeCaptureItem('drafts', id);
}

export async function clearDrafts(): Promise<void> {
  await clearCaptureStore('drafts');
}

export async function getHistory(): Promise<CaptureDraft[]> {
  return listCaptureStore('history');
}

export async function addToHistory(entry: CaptureDraft): Promise<void> {
  await upsertCaptureItem('history', { ...entry, status: 'saved' });
}

export async function deleteHistoryItem(id: string): Promise<void> {
  await removeCaptureItem('history', id);
}

export async function clearHistory(): Promise<void> {
  await clearCaptureStore('history');
}

export async function getQueue(): Promise<QueuedRecord[]> {
  const result = await chrome.storage.local.get(QUEUE_KEY);
  return (result[QUEUE_KEY] as QueuedRecord[]) ?? [];
}

export async function enqueue(record: QueuedRecord): Promise<void> {
  const queue = await getQueue();
  queue.push(record);
  await chrome.storage.local.set({ [QUEUE_KEY]: queue });
}

export async function dequeue(id: string): Promise<void> {
  const queue = (await getQueue()).filter((r) => r.id !== id);
  await chrome.storage.local.set({ [QUEUE_KEY]: queue });
}

export async function updateQueueRecord(record: QueuedRecord): Promise<void> {
  const queue = await getQueue();
  const idx = queue.findIndex((r) => r.id === record.id);
  if (idx >= 0) queue[idx] = record;
  await chrome.storage.local.set({ [QUEUE_KEY]: queue });
}
