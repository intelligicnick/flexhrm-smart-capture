import type { TenderCaptureBatch } from '../types';

const TENDER_BATCHES_KEY = 'tender_capture_batches';
const CURRENT_TENDER_BATCH_KEY = 'tender_capture_current';

function trimBatchForStorage(batch: TenderCaptureBatch): TenderCaptureBatch {
  return {
    ...batch,
    tenders: batch.tenders.map((t) => ({
      ...t,
      notes: t.notes?.slice(0, 4000) ?? '',
      description: t.description?.slice(0, 4000) ?? '',
    })),
  };
}

function assertExtensionContext(): void {
  try {
    if (!chrome?.runtime?.id) {
      throw new Error('Extension context invalidated');
    }
  } catch {
    throw new Error('Extension context invalidated');
  }
}

export async function getTenderBatches(): Promise<TenderCaptureBatch[]> {
  assertExtensionContext();
  const result = await chrome.storage.local.get(TENDER_BATCHES_KEY);
  return (result[TENDER_BATCHES_KEY] as TenderCaptureBatch[]) ?? [];
}

export async function saveTenderBatch(batch: TenderCaptureBatch): Promise<void> {
  assertExtensionContext();
  const trimmed = trimBatchForStorage(batch);
  const batches = await getTenderBatches();
  const idx = batches.findIndex((b) => b.id === trimmed.id);
  if (idx >= 0) batches[idx] = trimmed;
  else batches.unshift(trimmed);
  await chrome.storage.local.set({
    [CURRENT_TENDER_BATCH_KEY]: trimmed,
    [TENDER_BATCHES_KEY]: batches.slice(0, 50),
  });
}

export async function deleteTenderBatch(id: string): Promise<void> {
  const batches = (await getTenderBatches()).filter((b) => b.id !== id);
  await chrome.storage.local.set({ [TENDER_BATCHES_KEY]: batches });
}

export async function getLatestTenderBatch(): Promise<TenderCaptureBatch | null> {
  assertExtensionContext();
  const result = await chrome.storage.local.get(CURRENT_TENDER_BATCH_KEY);
  const current = result[CURRENT_TENDER_BATCH_KEY] as TenderCaptureBatch | undefined;
  if (current) return current;
  const batches = await getTenderBatches();
  return batches[0] ?? null;
}
