import type { ContractStatus, ContractType, ExtractedContract } from '../../shared/types';
import { buildGemContractPdfUrl } from './gem-orders-url';

const CONTRACT_NO_RE = /GEMC-\d+/gi;
const BID_NO_RE = /GEM\/\d{4}\/B\/\d+/gi;

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function cellText(el: Element | null | undefined): string {
  if (!el) return '';
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function extractLabelValue(text: string, labels: string[]): string {
  for (const label of labels) {
    const patterns = [
      new RegExp(`${label}\\s*[:\\-]\\s*([^\\n]+)`, 'i'),
      new RegExp(`${label}\\s+([^\\n]+)`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]?.trim()) return match[1].trim();
    }
  }
  return '';
}

function extractDateAfterLabel(text: string, labels: string[]): string {
  for (const label of labels) {
    const pattern = new RegExp(
      `${label}\\s*[:\\-]?\\s*(\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}(?:\\s+\\d{1,2}:\\d{2}(?::\\d{2})?)?)`,
      'i',
    );
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return '';
}

function inferContractType(category: string): ContractType {
  const lower = category.toLowerCase();
  if (lower.includes('travel') || lower.includes('ticket') || lower.includes('passage')) {
    return 'travel';
  }
  return 'manpower';
}

function inferStatus(statusText: string): ContractStatus {
  const lower = statusText.toLowerCase();
  if (lower.includes('terminat') || lower.includes('cancel')) return 'terminated';
  if (lower.includes('expir') || lower.includes('closed') || lower.includes('completed')) {
    return 'expired';
  }
  if (lower.includes('extend')) return 'extended';
  if (lower.includes('upcoming') || lower.includes('pending acceptance')) return 'upcoming';
  return 'active';
}

function extractContractIdFromElement(el: Element): string {
  const href = (el as HTMLAnchorElement).href ?? el.getAttribute('href') ?? '';
  const fromHref =
    href.match(/contractId=([^&"'\\s]+)/i)?.[1] ||
    href.match(/contract\/fds\/([^/?#'"\\s]+)/i)?.[1] ||
    '';
  if (fromHref) return decodeURIComponent(fromHref);

  const attrs = [
    el.getAttribute('onclick') ?? '',
    el.getAttribute('ng-click') ?? '',
    el.getAttribute('data-contract-id') ?? '',
    el.getAttribute('data-id') ?? '',
    el.getAttribute('data-contractid') ?? '',
  ].join(' ');

  const fromAttr =
    attrs.match(/contractId['":\s=]+([A-Za-z0-9+/=_-]{8,})/i)?.[1] ||
    attrs.match(/contract\/fds\/?['":\s=]+([A-Za-z0-9+/=_-]{8,})/i)?.[1] ||
    '';
  if (fromAttr) return fromAttr;

  return '';
}

function findContractPdfInRoot(root: ParentNode): { contractId: string; gemContractPdfUrl: string } {
  const selectors = [
    'a[href*="contract/fds"]',
    'a[href*="contractId="]',
    '[onclick*="contract/fds"]',
    '[onclick*="contractId"]',
    '[ng-click*="contract/fds"]',
    '[data-contract-id]',
    '[data-contractid]',
  ];

  for (const selector of selectors) {
    for (const el of root.querySelectorAll(selector)) {
      const contractId = extractContractIdFromElement(el);
      if (contractId) {
        return { contractId, gemContractPdfUrl: buildGemContractPdfUrl(contractId) };
      }
    }
  }

  const html = (root as HTMLElement).innerHTML ?? '';
  const htmlMatch =
    html.match(/contractId=([A-Za-z0-9+/=_-]{8,})/i)?.[1] ||
    html.match(/contract\/fds\?contractId=([A-Za-z0-9+/=_-]{8,})/i)?.[1] ||
    '';
  if (htmlMatch) {
    return { contractId: htmlMatch, gemContractPdfUrl: buildGemContractPdfUrl(htmlMatch) };
  }

  return { contractId: '', gemContractPdfUrl: '' };
}

function findContractNo(text: string, root: ParentNode): string {
  const labelled =
    extractLabelValue(text, ['Contract No', 'Contract Number', 'Contract No.', 'CONTRACT NO']) ||
    '';
  if (labelled) {
    const match = labelled.match(/GEMC-\d+/i);
    if (match) return match[0].toUpperCase();
  }

  const fromText = text.match(CONTRACT_NO_RE)?.[0];
  if (fromText) return fromText.toUpperCase();

  for (const anchor of root.querySelectorAll('a, span, div, td')) {
    const value = cellText(anchor);
    const match = value.match(/GEMC-\d+/i);
    if (match) return match[0].toUpperCase();
  }

  return '';
}

function headerIndexMap(table: HTMLTableElement): Map<string, number> {
  const map = new Map<string, number>();
  const headerRow = table.querySelector('thead tr') ?? table.querySelector('tr');
  if (!headerRow) return map;

  headerRow.querySelectorAll('th, td').forEach((cell, index) => {
    const key = normalizeHeader(cellText(cell));
    if (key) map.set(key, index);
  });
  return map;
}

function pickColumn(cells: Element[], map: Map<string, number>, ...aliases: string[]): string {
  for (const alias of aliases) {
    const index = map.get(normalizeHeader(alias));
    if (index !== undefined && cells[index]) return cellText(cells[index]);
  }
  return '';
}

function parseOrderRow(
  row: HTMLElement,
  sourceUrl: string,
  headerMap?: Map<string, number>,
): ExtractedContract | null {
  const text = row.innerText.replace(/\s+/g, ' ').trim();
  const contractNo = findContractNo(text, row);
  if (!contractNo) return null;

  const { contractId, gemContractPdfUrl } = findContractPdfInRoot(row);
  const cells = [...row.querySelectorAll('td, [role="gridcell"], .ag-cell')];

  const map = headerMap ?? new Map<string, number>();
  const category =
    pickColumn(cells, map, 'product', 'service', 'item', 'category', 'description') ||
    extractLabelValue(text, ['Product', 'Service', 'Item']);
  const officerName =
    pickColumn(cells, map, 'buyer', 'buyer name', 'consignee', 'officer', 'consignee officer') ||
    extractLabelValue(text, ['Buyer', 'Consignee', 'Consignee Officer', 'Buyer Name']);
  const officeName =
    pickColumn(cells, map, 'organisation', 'organization', 'department', 'ministry', 'buyer organisation') ||
    extractLabelValue(text, ['Organisation', 'Organization', 'Department', 'Ministry']);
  const companyName =
    pickColumn(cells, map, 'seller', 'seller name', 'vendor', 'company') ||
    extractLabelValue(text, ['Seller', 'Seller Name', 'Vendor']);
  const tenderBidNoRaw =
    pickColumn(cells, map, 'bid number', 'bid no', 'bid id', 'tender') ||
    extractLabelValue(text, ['Bid Number', 'Bid No', 'Bid ID']);
  const tenderBidNo =
    tenderBidNoRaw.match(BID_NO_RE)?.[0]?.toUpperCase() ??
    text.match(BID_NO_RE)?.[0]?.toUpperCase() ??
    '';
  const contractValue =
    pickColumn(cells, map, 'total', 'order value', 'contract value', 'amount', 'value') ||
    extractLabelValue(text, ['Total', 'Order Value', 'Contract Value', 'Amount']);
  const statusText =
    pickColumn(cells, map, 'status', 'order status', 'contract status') ||
    extractLabelValue(text, ['Status', 'Order Status', 'Contract Status']);
  const fromDate =
    pickColumn(cells, map, 'contract date', 'order date', 'from date', 'start date') ||
    extractDateAfterLabel(text, ['Contract Date', 'Order Date', 'From Date', 'Start Date']);
  const toDate =
    pickColumn(cells, map, 'end date', 'to date', 'valid upto', 'valid up to', 'contract end') ||
    extractDateAfterLabel(text, ['End Date', 'To Date', 'Valid Upto', 'Valid Up To', 'Contract End']);
  const correspondingOffice =
    pickColumn(cells, map, 'address', 'buyer address', 'consignee address') ||
    extractLabelValue(text, ['Address', 'Buyer Address']);

  const notes = [
    statusText && `Order status: ${statusText}`,
    pickColumn(cells, map, 'order no', 'order number') &&
      `Order No: ${pickColumn(cells, map, 'order no', 'order number')}`,
    pickColumn(cells, map, 'buying mode') &&
      `Buying mode: ${pickColumn(cells, map, 'buying mode')}`,
    contractId && `GeM contractId: ${contractId}`,
    `Source: ${sourceUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    contractNo,
    officerName,
    officeName,
    correspondingOffice,
    fromDate,
    toDate,
    companyName,
    category,
    contractType: inferContractType(category),
    hasExtension: false,
    extensionEndDate: '',
    bgApplicable: false,
    bgNumber: '',
    bgAmount: '',
    bgIssuingBank: '',
    bgExpiryDate: '',
    bgDetails: '',
    ddoName: '',
    ddoIssuingDetails: '',
    tenderBidNo,
    contractValue,
    status: inferStatus(statusText),
    notes,
    entryDate: new Date().toISOString().slice(0, 10),
    gemContractId: contractId,
    gemContractPdfUrl,
    gemOrderStatus: statusText,
    sourceUrl,
  };
}

function findOrderRows(root: ParentNode): HTMLElement[] {
  const rows: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  for (const table of root.querySelectorAll('table')) {
    const headerMap = headerIndexMap(table as HTMLTableElement);
    for (const row of table.querySelectorAll('tbody tr, tr')) {
      const el = row as HTMLElement;
      if (seen.has(el)) continue;
      if (!/GEMC-\d+/i.test(el.innerText)) continue;
      seen.add(el);
      rows.push(el);
    }
    if (rows.length > 0) return rows;
  }

  const gridRows = root.querySelectorAll('[role="row"], .ag-row, .MuiDataGrid-row');
  for (const row of gridRows) {
    const el = row as HTMLElement;
    if (!/GEMC-\d+/i.test(el.innerText)) continue;
    if (seen.has(el)) continue;
    seen.add(el);
    rows.push(el);
  }
  if (rows.length > 0) return rows;

  const cardSelectors = [
    '[class*="order"]',
    '[class*="contract"]',
    '[class*="card"]',
    'li',
    'article',
    'section > div',
  ];
  for (const selector of cardSelectors) {
    for (const node of root.querySelectorAll(selector)) {
      const el = node as HTMLElement;
      if (el.children.length > 6) continue;
      if (!/GEMC-\d+/i.test(el.innerText)) continue;
      if (seen.has(el)) continue;
      seen.add(el);
      rows.push(el);
    }
    if (rows.length > 0) break;
  }

  return rows;
}

export function extractGemOrdersFromPage(root: ParentNode = document): ExtractedContract[] {
  const sourceUrl = window.location.href;
  const rows = findOrderRows(root);
  const contracts: ExtractedContract[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const table = row.closest('table') as HTMLTableElement | null;
    const headerMap = table ? headerIndexMap(table) : undefined;
    const contract = parseOrderRow(row, sourceUrl, headerMap);
    if (!contract || seen.has(contract.contractNo)) continue;
    seen.add(contract.contractNo);
    contracts.push(contract);
  }

  if (contracts.length === 0) {
    const pageText = (root as Document).body?.innerText ?? '';
    const contractNos = [...new Set((pageText.match(CONTRACT_NO_RE) ?? []).map((v) => v.toUpperCase()))];
    for (const contractNo of contractNos) {
      const idx = pageText.indexOf(contractNo);
      const chunk = pageText.slice(Math.max(0, idx - 80), Math.min(pageText.length, idx + 2200));
      const fakeRow = document.createElement('div');
      fakeRow.innerText = chunk;
      const contract = parseOrderRow(fakeRow, sourceUrl);
      if (contract && !seen.has(contract.contractNo)) {
        seen.add(contract.contractNo);
        contracts.push(contract);
      }
    }
  }

  return contracts;
}

export function countGemOrdersOnPage(root: ParentNode = document): number {
  return extractGemOrdersFromPage(root).length;
}

export function contractToFlexHRMPayload(contract: ExtractedContract) {
  return {
    contractNo: contract.gemContractPdfUrl || contract.contractNo,
    officerName: contract.officerName,
    officeName: contract.officeName,
    correspondingOffice: contract.correspondingOffice,
    fromDate: contract.fromDate,
    toDate: contract.toDate,
    companyName: contract.companyName,
    category: contract.category,
    contractType: contract.contractType,
    hasExtension: contract.hasExtension,
    extensionEndDate: contract.extensionEndDate,
    bgApplicable: contract.bgApplicable,
    bgNumber: contract.bgNumber,
    bgAmount: contract.bgAmount,
    bgIssuingBank: contract.bgIssuingBank,
    bgExpiryDate: contract.bgExpiryDate,
    bgDetails: contract.bgDetails,
    ddoName: contract.ddoName,
    ddoIssuingDetails: contract.ddoIssuingDetails,
    tenderBidNo: contract.tenderBidNo,
    contractValue: contract.contractValue,
    status: contract.status,
    notes: [
      contract.notes,
      contract.contractNo && contract.gemContractPdfUrl
        ? `GeM contract number: ${contract.contractNo}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    entryDate: contract.entryDate,
    gemContractPdfUrl: contract.gemContractPdfUrl,
    gemContractId: contract.gemContractId,
  };
}
