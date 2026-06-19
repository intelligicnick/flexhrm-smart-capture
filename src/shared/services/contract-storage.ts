import type { ContractCaptureBatch } from '../types';

const CONTRACT_BATCHES_KEY = 'contract_capture_batches';

function assertExtensionContext(): void {
  try {
    if (!chrome?.runtime?.id) {
      throw new Error('Extension context invalidated');
    }
  } catch {
    throw new Error('Extension context invalidated');
  }
}

export async function getContractBatches(): Promise<ContractCaptureBatch[]> {
  assertExtensionContext();
  const result = await chrome.storage.local.get(CONTRACT_BATCHES_KEY);
  return (result[CONTRACT_BATCHES_KEY] as ContractCaptureBatch[]) ?? [];
}

export async function saveContractBatch(batch: ContractCaptureBatch): Promise<void> {
  assertExtensionContext();
  const batches = await getContractBatches();
  const idx = batches.findIndex((b) => b.id === batch.id);
  if (idx >= 0) batches[idx] = batch;
  else batches.unshift(batch);
  await chrome.storage.local.set({ [CONTRACT_BATCHES_KEY]: batches.slice(0, 50) });
}

export async function deleteContractBatch(id: string): Promise<void> {
  const batches = (await getContractBatches()).filter((b) => b.id !== id);
  await chrome.storage.local.set({ [CONTRACT_BATCHES_KEY]: batches });
}

export async function getLatestContractBatch(): Promise<ContractCaptureBatch | null> {
  const batches = await getContractBatches();
  return batches[0] ?? null;
}
