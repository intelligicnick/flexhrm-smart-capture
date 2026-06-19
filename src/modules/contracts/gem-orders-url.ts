export const GEM_FULFILMENT_HOST = 'fulfilment.gem.gov.in';

export const GEM_ORDERS_URL =
  'https://fulfilment.gem.gov.in/fulfilment/home#WORKSPACE_ID=ORDERS_WS';

export const GEM_CONTRACT_PDF_BASE = 'https://fulfilment.gem.gov.in/contract/fds';

export function buildGemContractPdfUrl(contractId: string): string {
  const id = contractId.trim();
  if (!id) return '';
  return `${GEM_CONTRACT_PDF_BASE}?contractId=${encodeURIComponent(id)}`;
}

export function isGemOrdersPage(url = window.location.href): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== GEM_FULFILMENT_HOST) return false;
    if (parsed.hash.includes('ORDERS_WS')) return true;
    if (/orders/i.test(parsed.pathname) || /orders/i.test(parsed.hash)) return true;
    return /orders/i.test(document.body?.innerText?.slice(0, 4000) ?? '');
  } catch {
    return false;
  }
}

export function isGemFulfilmentPage(url = window.location.href): boolean {
  try {
    return new URL(url).hostname === GEM_FULFILMENT_HOST;
  } catch {
    return false;
  }
}
