export const GEM_SELLER_BIDS_URL = 'https://bidplus.gem.gov.in/seller-bids';

export function isGemSellerBidsPage(url = window.location.href): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'bidplus.gem.gov.in' &&
      parsed.pathname.startsWith('/seller-bids')
    );
  } catch {
    return false;
  }
}

export async function isActiveTabSellerBids(): Promise<boolean> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url ? isGemSellerBidsPage(tab.url) : false;
}
