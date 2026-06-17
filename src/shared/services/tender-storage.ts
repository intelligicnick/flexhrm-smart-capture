import type { TenderCaptureBatch } from '../types';

const TENDER_BATCHES_KEY = 'tender_capture_batches';

export async function getTenderBatches(): Promise<TenderCaptureBatch[]> {
  const result = await chrome.storage.local.get(TENDER_BATCHES_KEY);
  return (result[TENDER_BATCHES_KEY] as TenderCaptureBatch[]) ?? [];
}

export async function saveTenderBatch(batch: TenderCaptureBatch): Promise<void> {
  const batches = await getTenderBatches();
  const idx = batches.findIndex((b) => b.id === batch.id);
  if (idx >= 0) batches[idx] = batch;
  else batches.unshift(batch);
  await chrome.storage.local.set({ [TENDER_BATCHES_KEY]: batches.slice(0, 50) });
}

export async function deleteTenderBatch(id: string): Promise<void> {
  const batches = (await getTenderBatches()).filter((b) => b.id !== id);
  await chrome.storage.local.set({ [TENDER_BATCHES_KEY]: batches });
}

export async function getLatestTenderBatch(): Promise<TenderCaptureBatch | null> {
  const batches = await getTenderBatches();
  return batches[0] ?? null;
}
