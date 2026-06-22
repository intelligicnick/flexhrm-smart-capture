import type { ExtractedTender } from '../../shared/types';

const GEM_SELECTION_KEY = 'gem_tender_selection';

export interface GemSelectionState {
  bids: string[];
  tenders: Record<string, ExtractedTender>;
}

export async function loadGemSelectionState(): Promise<GemSelectionState | null> {
  try {
    const result = await chrome.storage.session.get(GEM_SELECTION_KEY);
    const state = result[GEM_SELECTION_KEY] as GemSelectionState | undefined;
    if (!state || !Array.isArray(state.bids)) return null;
    return {
      bids: state.bids.map((bid) => bid.toUpperCase()),
      tenders: state.tenders ?? {},
    };
  } catch {
    return null;
  }
}

function trimTenderForStorage(tender: ExtractedTender): ExtractedTender {
  return {
    ...tender,
    notes: tender.notes?.slice(0, 2000) ?? '',
    description: tender.description?.slice(0, 2000) ?? '',
  };
}

export async function saveGemSelectionState(
  bids: Iterable<string>,
  tenders: Map<string, ExtractedTender>,
): Promise<void> {
  try {
    const tenderRecord: Record<string, ExtractedTender> = {};
    for (const [bid, tender] of tenders.entries()) {
      tenderRecord[bid.toUpperCase()] = trimTenderForStorage(tender);
    }
    await chrome.storage.session.set({
      [GEM_SELECTION_KEY]: {
        bids: [...bids].map((bid) => bid.toUpperCase()),
        tenders: tenderRecord,
      } satisfies GemSelectionState,
    });
  } catch {
    // Session storage may be unavailable in tests.
  }
}
