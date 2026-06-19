export interface GemPdfDetails {
  preBidAt: string;
  preBidAddress: string;
  startDate: string;
  endDate: string;
  rate: string;
  additionalRequirements: string;
  description: string;
  ministry: string;
  organisation: string;
  consigneeOfficer: string;
  address: string;
  noPreBid: boolean;
}

const GEM_LABEL_BREAK_RE =
  /\s+(?=(?:Ministry\/State Name|Ministry \/ State Name|Department Name|Organisation Name|Organization Name|\/Organisation Name|Office Name|Item Category|Consignee Reporting\/Officer|Consignee Reporting Officer|Consignees\/Reporting|Additional Requirements?|Address:|Estimated Bid|Bid Number|Bid End|Pre[- ]?Bid|Quantity|S\.?\s*No\.?|\/Beneficiary))/gi;

/** Rebuild GeM PDF structure when text is flattened or labels are split across lines. */
export function normalizeGemPdfText(text: string): string {
  let normalized = text.replace(/\r/g, '\n');

  normalized = normalized.replace(
    /Consignee\s*\n\s*Reporting\s*\/?\s*Officer/gi,
    'Consignee Reporting/Officer',
  );
  normalized = normalized.replace(/Additional\s*\n\s*Requirement/gi, 'Additional Requirement');
  normalized = normalized.replace(/Ministry\s*\/?\s*State\s*\n\s*Name/gi, 'Ministry/State Name');
  normalized = normalized.replace(/Organisation\s*\n\s*Name/gi, 'Organisation Name');
  normalized = normalized.replace(/Reporting\s*\n\s*\/?\s*Officer/gi, 'Reporting/Officer');
  normalized = normalized.replace(/\s+\/Organisation Name/gi, ' Organisation Name');

  const nonEmptyLines = normalized.split('\n').filter((line) => line.trim()).length;
  if (nonEmptyLines <= 4) {
    const flat = normalized.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    normalized = flat.replace(GEM_LABEL_BREAK_RE, '\n');
  }

  return normalized;
}

export function isJunkTenderFieldValue(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (/^:+$/.test(v)) return true;
  if (/^\/address/i.test(v)) return true;
  if (/^address\s*:/i.test(v)) return true;
  if (v.length <= 2) return true;
  if (/^reporting\s*\/?\s*officer/i.test(v)) return true;
  return false;
}

const DATE_TIME_RE =
  /(\d{1,2}[-/]\d{1,2}[-/]\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM|am|pm)?)?)?)/;

/** Normalize GeM PDF date/time to DD-MM-YYYY HH:mm:ss (24-hour). Date-only input returns DD-MM-YYYY. */
export function normalizeGemPdfDateTime(raw: string): string {
  const trimmed = stripPdfNoise(raw).trim();
  if (!trimmed) return '';

  const match = trimmed.match(
    /(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/,
  );
  if (!match) return trimmed;

  const day = String(Number(match[1])).padStart(2, '0');
  const month = String(Number(match[2])).padStart(2, '0');
  const year = match[3];

  if (!match[4]) return `${day}-${month}-${year}`;

  let hour = Number(match[4]);
  const minute = String(Number(match[5])).padStart(2, '0');
  const second = match[6] ? String(Number(match[6])).padStart(2, '0') : '00';
  const ampm = match[7]?.toUpperCase();

  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;

  return `${day}-${month}-${year} ${String(hour).padStart(2, '0')}:${minute}:${second}`;
}

/** Date-only form of normalizeGemPdfDateTime — DD-MM-YYYY. */
export function normalizeGemPdfDate(raw: string): string {
  return normalizeGemPdfDateTime(raw).split(/\s+/)[0] ?? '';
}

const OPTIONAL_LABEL_SEP = '(?:[:\\-–])?';

const NEXT_LABEL_RE =
  /(?:Pre[- ]?Bid|Additional\s+Requirement|Estimated|Item Description|Bid Number|Quantity|Department|Tender Type|EMD|Minimum|Consignee|Bid End|Bid Opening|Tenure|Ministry\/State|Organisation Name|Organization Name)/i;

const FIELD_BOUNDARY_RE =
  /(?:Ministry\/State|Organisation Name|Organization Name|Consignee Reporting|Consignee Officer|Additional Requirement|Estimated Bid|Item Description|Bid Number|Bid End|Pre[- ]?Bid|Department Name)/i;

function cleanFieldValue(value: string): string {
  const trimmed = stripPdfNoise(value);
  const cut = trimmed.split(FIELD_BOUNDARY_RE)[0]?.trim() ?? trimmed;
  return polishFieldValue(cut);
}

function polishFieldValue(value: string): string {
  return value
    .replace(/\s{2,}/g, ' ')
    .replace(/[%\/\s]+$/g, '')
    .replace(/^[%\/\s]+/g, '')
    .trim();
}

function buildAsciiFlat(text: string): string {
  return stripPdfNoise(text).replace(/\n+/g, ' ').trim();
}

function escapeRegexLabel(label: string): string {
  return label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '\\/?');
}

function buildStopLabelPattern(stopLabels: string[]): string {
  return stopLabels.map((l) => escapeRegexLabel(l)).join('|');
}

function isPlausibleFieldValue(value: string, minLen = 4): boolean {
  const v = value.trim();
  if (v.length < minLen) return false;
  if (/^(yes|no|required|not applicable|na|n\/a|view)$/i.test(v)) return false;
  if (/^GEM\/\d{4}\/B\/\d+/i.test(v)) return false;
  return true;
}

function extractAddress(raw: string, flat: string, asciiFlat = buildAsciiFlat(raw)): string {
  const tableRow = extractConsigneeFromTable(asciiFlat);
  if (tableRow.address) return tableRow.address;

  const patterns = [
    /(?:^|[\n,])\s*address\s*:\s*([^,\n]+(?:,\s*[^,\n]+){0,10}?)(?=\s*,\s*(?:additional requirement|estimated|consignee|bid number|item category|tenure|s\.?\s*no)|\s*$)/i,
    /address\s*:\s*([^,\n]+(?:,\s*[^,\n]+){0,10}?)(?=\s+additional\s+requirement|\s+estimated|\s+consignee|\s*$)/i,
  ];

  for (const source of [asciiFlat, raw, flat].filter(Boolean)) {
    for (const pattern of patterns) {
      const match = source.match(pattern);
      const value = cleanFieldValue(match?.[1] ?? '');
      if (isPlausibleFieldValue(value)) return value;
    }
  }

  const labeled =
    extractStrictLabel(raw, ['Consignee Address', 'Consignee Location', 'Delivery Location']) ||
    extractStrictLabel(flat, ['Consignee Address', 'Consignee Location', 'Delivery Location']) ||
    extractStrictLabel(asciiFlat, ['Consignee Address', 'Consignee Location', 'Delivery Location']);
  if (labeled) return labeled;

  return extractFromBeneficiary(asciiFlat).address;
}

export { extractAddress };

function extractStrictLabel(text: string, labels: string[]): string {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`${escaped}\\s*[:\\-–]\\s*([^\\n]{3,300})`, 'i'),
      new RegExp(
        `${escaped}\\s*${OPTIONAL_LABEL_SEP}\\s*\\n\\s*([^\\n]{2,300}?)(?=\\n\\s*${NEXT_LABEL_RE.source}|$)`,
        'i',
      ),
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const raw = match?.[1]?.trim();
      if (!raw) continue;
      const value = cleanFieldValue(raw);
      if (isPlausibleFieldValue(value)) return value;
    }
  }
  return '';
}

function stripPdfNoise(value: string): string {
  return value
    .replace(/[\u0900-\u097F]/g, '')
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAfterLabel(text: string, labels: string[]): string {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`${escaped}\\s*${OPTIONAL_LABEL_SEP}\\s*([^\\n]{3,400})`, 'i'),
      new RegExp(`${escaped}\\s+(${DATE_TIME_RE.source})`, 'i'),
      new RegExp(
        `${escaped}\\s+([^\\n]+?)\\s+(?:Pre Bid|Estimated|Item|Bid Number|Consignee|$)`,
        'i',
      ),
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const value = match?.[1]?.trim();
      if (value && value.length > 2) return stripPdfNoise(value);
    }
  }
  return '';
}

function extractAfterLabelMultiline(text: string, labels: string[]): string {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(
        `${escaped}\\s*${OPTIONAL_LABEL_SEP}\\s*\\n\\s*([^\\n]{2,400}?)(?=\\n\\s*${NEXT_LABEL_RE.source}|$)`,
        'i',
      ),
      new RegExp(`${escaped}\\s*${OPTIONAL_LABEL_SEP}\\s*\\n\\s*([^\\n]{2,400})`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const value = match?.[1]?.trim();
      if (
        value &&
        value.length > 2 &&
        !/^(yes|no|required|not applicable|na|n\/a)$/i.test(value)
      ) {
        return stripPdfNoise(value);
      }
    }
  }
  return '';
}

function extractBlockAfterLabel(text: string, labels: string[]): string {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `${escaped}\\s*${OPTIONAL_LABEL_SEP}\\s*([\\s\\S]{15,1500}?)(?=\\n\\s*(?:Pre Bid|Estimated|Item Description|Bid Number|Quantity|Department|Tender Type|EMD|Minimum|$))`,
      'i',
    );
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return stripPdfNoise(match[1]);
  }
  return '';
}

function extractBidDateTime(raw: string, flat: string, labels: string[]): string {
  for (const source of [raw, flat]) {
    const fromLabel = extractAfterLabel(source, labels);
    if (fromLabel && DATE_TIME_RE.test(fromLabel)) {
      return fromLabel.match(DATE_TIME_RE)?.[0] ?? fromLabel;
    }
    const fromMultiline = extractAfterLabelMultiline(source, labels);
    if (fromMultiline && DATE_TIME_RE.test(fromMultiline)) {
      return fromMultiline.match(DATE_TIME_RE)?.[0] ?? fromMultiline;
    }
  }

  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '\\/?');
    const pattern = new RegExp(
      `${escaped}\\s*[:\\-–]?\\s*(\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}(?:\\s+\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s*(?:AM|PM|am|pm)?)?)?)`,
      'i',
    );
    for (const source of [flat, raw]) {
      const match = source.match(pattern);
      if (match?.[1]?.trim()) return stripPdfNoise(match[1]);
    }
  }

  return '';
}

function extractPreBidDateTime(raw: string, flat: string): string {
  const labelLists = [
    [
      'Pre-Bid Date and Time',
      'Pre Bid Date and Time',
      'Pre Bid Meeting Date & Time',
      'Pre Bid Meeting Date and Time',
      'Pre-Bid Meeting Date & Time',
      'Pre-bid Meeting Date and Time',
      'Date & Time for Pre-bid Meeting',
      'Date and Time for Pre Bid Meeting',
      'Pre Bid Meeting Date',
      'Pre Bid Meeting',
    ],
  ];

  for (const labels of labelLists) {
    for (const source of [raw, flat]) {
      const fromLabel = extractAfterLabel(source, labels);
      if (fromLabel && DATE_TIME_RE.test(fromLabel)) {
        return fromLabel.match(DATE_TIME_RE)?.[0] ?? fromLabel;
      }
      const fromMultiline = extractAfterLabelMultiline(source, labels);
      if (fromMultiline && DATE_TIME_RE.test(fromMultiline)) {
        return fromMultiline.match(DATE_TIME_RE)?.[0] ?? fromMultiline;
      }
    }
  }

  const patterns = [
    /pre\s*[- ]?\s*bid\s+date\s+and\s+time\s*[:\-–]?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)/i,
    /pre\s*[- ]?\s*bid\s+date\s+and\s+time\s+(\d{1,2}[-/]\d{1,2}[-/]\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)/i,
    /pre\s*[- ]?\s*bid\s+meeting\s+date\s*(?:&|and)?\s*time\s*[:\-–]?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)/i,
    /pre\s*[- ]?\s*bid\s+meeting\s+date\s*(?:&|and)?\s*time\s+(\d{1,2}[-/]\d{1,2}[-/]\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)/i,
    /pre\s*[- ]?\s*bid\s+meeting\s*[:\-–]?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)/i,
    /pre\s*[- ]?\s*bid\s+conference\s*[:\-–]?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)/i,
    /date\s*(?:&|and)\s*time\s+of\s+pre\s*[- ]?\s*bid\s*[:\-–]?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)/i,
  ];

  for (const pattern of patterns) {
    const match = flat.match(pattern) || raw.match(pattern);
    if (match?.[1]?.trim()) return stripPdfNoise(match[1]);
  }

  return '';
}

function extractFromPreBidTableRow(flat: string): { at: string; venue: string } {
  const match = flat.match(
    /pre\s*[- ]?\s*bid\s+date\s+and\s+time\s+pre\s*[- ]?\s*bid\s+venue\s+(\d{1,2}[-/]\d{1,2}[-/]\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)(?=\s+additional\s+requirement|estimated\s+bid\s+value|tenure\s*\/|basic\s+pay|$)/i,
  );
  if (!match?.[1]) return { at: '', venue: '' };
  return {
    at: stripPdfNoise(match[1]),
    venue: stripPdfNoise(match[2].replace(/\s+/g, ' ')),
  };
}

function extractFromPreBidDetailsSection(
  raw: string,
  flat: string,
): { at: string; venue: string } {
  for (const source of [raw, flat]) {
    const section = source.match(/pre\s*[- ]?\s*bid\s+detail[s]?[\s\S]{0,2000}/i);
    if (!section) continue;
    const chunk = section[0];
    const at = chunk.match(DATE_TIME_RE)?.[0] ?? '';
    if (!at) continue;
    const afterAt = chunk.slice(chunk.indexOf(at) + at.length);
    let venue = afterAt
      .replace(/pre\s*[- ]?\s*bid\s+venue/gi, ' ')
      .replace(/^\s*[-:–/]\s*/, '')
      .trim();
    venue = venue.split(/additional\s+requirement|estimated\s+bid|tenure\s*\//i)[0] ?? '';
    venue = stripPdfNoise(venue.replace(/\s+/g, ' '));
    return { at, venue: venue.length > 4 ? venue : '' };
  }
  return { at: '', venue: '' };
}

function extractPreBidVenue(raw: string, flat: string, preBidAt = ''): string {
  const labels = [
    'Pre-Bid Venue',
    'Pre Bid Venue',
    'Pre Bid Meeting Venue',
    'Pre-Bid Meeting Venue',
    'Pre Bid Meeting Address',
    'Pre Bid Conference Venue',
    'Venue for Pre Bid Meeting',
    'Venue for Pre-bid Meeting',
    'Meeting Venue',
  ];

  const blockMatch =
    raw.match(
      /pre\s*[- ]?\s*bid\s+venue\s*\n([\s\S]{10,700}?)(?=\n\s*(?:additional\s+requirement|estimated|item description|bid number|consignee|emd|minimum|tenure|basic pay|$))/i,
    ) ||
    raw.match(
      /pre\s*[- ]?\s*bid\s+venue\s+([^\n]+(?:\n(?![A-Z][a-z]+:)[^\n]+){0,6})/i,
    );
  if (blockMatch?.[1]) {
    const venue = blockMatch[1]
      .split('\n')
      .map((line) => stripPdfNoise(line))
      .filter((line) => line && !DATE_TIME_RE.test(line))
      .join(', ');
    if (venue.length > 4) return venue;
  }

  for (const source of [raw, flat]) {
    const fromMultiline = extractAfterLabelMultiline(source, labels);
    if (fromMultiline && !DATE_TIME_RE.test(fromMultiline)) return fromMultiline;

    const fromLabel = extractAfterLabel(source, labels);
    if (fromLabel && !DATE_TIME_RE.test(fromLabel)) return fromLabel;
  }

  const flatMatch = flat.match(
    /pre\s*[- ]?\s*bid\s+venue\s+(.{5,350}?)(?=\s+(?:additional\s+requirement|estimated|item description|bid number|consignee|pre\s*[- ]?\s*bid\s+date|tender type|emd|minimum|tenure|basic pay|$))/i,
  );
  if (flatMatch?.[1]?.trim()) return stripPdfNoise(flatMatch[1]);

  if (preBidAt) {
    const afterDate = flat.match(
      new RegExp(
        `${preBidAt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(.+?)(?=\\s+additional\\s+requirement|estimated\\s+bid|tenure\\s*\\/|basic\\s+pay|$)`,
        'i',
      ),
    );
    if (afterDate?.[1]?.trim()) {
      const venue = stripPdfNoise(afterDate[1].replace(/\s+/g, ' '));
      if (venue.length > 4 && !DATE_TIME_RE.test(venue)) return venue;
    }
  }

  return '';
}

function cleanPersonName(value: string): string {
  const name = cleanFieldValue(value)
    .replace(/^[\s:–\-]+/, '')
    .replace(/^\d+\s+/, '')
    .trim();
  if (!name || /^:+$/.test(name)) return '';
  if (!/[A-Za-z]/.test(name)) return '';
  if (/^\/address/i.test(name)) return '';
  if (/^address\s*:/i.test(name)) return '';
  if (/tenure|basic pay|provident fund|working days|months?\s*:/i.test(name)) return '';
  if (/^(consignee|reporting|officer)$/i.test(name)) return '';
  return name;
}

function extractNumberedConsigneeName(text: string): string {
  const match = text.match(
    /(?:^|[\n,])\s*\d+\s+([A-Z][A-Za-z]+(?:\s+[A-Za-z]+){1,4})\s*(?:\n|,|$)/m,
  );
  return cleanPersonName(match?.[1] ?? '');
}

function extractConsigneeFromTable(asciiFlat: string): { officer: string; address: string } {
  const rowRe =
    /(?:Additional Requirements?\s+\d+\s*\/\s*\d+\s+)?(\d+)\s+([A-Z][A-Za-z]+(?:\s+[A-Za-z.'-]+){0,4})\s+(\d{6}),(.+?)(?=\s+\d+\s+Tenure\/)/i;
  const match = asciiFlat.match(rowRe);
  if (!match) return { officer: '', address: '' };

  const officer = cleanPersonName(match[2]);
  const address = polishFieldValue(`${match[3]},${match[4]}`);
  return { officer, address };
}

function extractFromBeneficiary(asciiFlat: string): { officer: string; address: string } {
  const match = asciiFlat.match(
    /\/Beneficiary\s*:\s*(.+?)(?=\s+Bid splitting|\s+MII Compliance|\s+MSE Purchase|$)/i,
  );
  if (!match?.[1]) return { officer: '', address: '' };

  const block = polishFieldValue(match[1]);
  const nameMatch = block.match(/\(([A-Za-z][A-Za-z\s.'-]+)\)\s*$/);
  const officer = cleanPersonName(nameMatch?.[1] ?? '');
  const address = polishFieldValue(block.replace(/\s*\([^)]+\)\s*$/, ''));
  return { officer, address };
}

function extractManpowerTermsBlocks(asciiFlat: string): string {
  const re =
    /Tenure\/\s*Duration of Employment \(in months\)\s*:\s*\d+.+?Number of working days in a month\s*:\s*\d+/gi;
  const blocks = [...asciiFlat.matchAll(re)]
    .map((m) => polishFieldValue(m[0]))
    .filter((block) => /basic pay/i.test(block));
  return [...new Set(blocks)].join('\n\n');
}

function extractBuyerAdditionalNotes(asciiFlat: string): string {
  const match = asciiFlat.match(
    /Additional Requirements for[^]+?(?=\/Addon\(s\)|Addon\(s\)|Consignees\/Reporting|\/S\.N|$)/i,
  );
  return match ? polishFieldValue(match[0]) : '';
}

function extractGemLabeledField(
  raw: string,
  flat: string,
  labels: string[],
  stopLabels: string[],
  asciiFlat = '',
): string {
  const stop = buildStopLabelPattern(stopLabels);
  const stopLookahead = stop
    ? `(?=\\s+\\/?(?:${stop})|$)`
    : '$';

  for (const label of labels) {
    const escaped = escapeRegexLabel(label);
    const patterns = [
      new RegExp(`${escaped}\\s*[:\\-–]\\s*([^\\n]{2,250})`, 'i'),
      new RegExp(`${escaped}\\s*\\n\\s*([^\\n]{2,250})`, 'i'),
      new RegExp(`${escaped}\\s+(.+?)${stopLookahead}`, 'i'),
    ];

    for (const source of [asciiFlat, raw, flat].filter(Boolean)) {
      for (const pattern of patterns) {
        const match = source.match(pattern);
        const rawValue = match?.[1]?.trim();
        if (!rawValue) continue;
        const value = cleanFieldValue(rawValue);
        if (isPlausibleFieldValue(value)) return value;
      }
    }
  }
  return '';
}

export function extractMinistry(raw: string, flat: string, asciiFlat = buildAsciiFlat(raw)): string {
  return extractGemLabeledField(
    raw,
    flat,
    ['Ministry/State Name', 'Ministry / State Name', 'Ministry Name', 'Ministry/State'],
    ['Department Name', 'Organisation Name', 'Organization Name', 'Office Name', 'Item Category', 'Consignee'],
    asciiFlat,
  );
}

export function extractOrganisation(
  raw: string,
  flat: string,
  asciiFlat = buildAsciiFlat(raw),
): string {
  const organisation = extractGemLabeledField(
    raw,
    flat,
    ['Organisation Name', 'Organization Name'],
    ['Office Name', 'Item Category', 'Consignee', 'Contact details', 'Additional Requirement', 'Bid End'],
    asciiFlat,
  );
  if (organisation) return organisation;

  return extractGemLabeledField(
    raw,
    flat,
    ['Department Name'],
    ['Organisation Name', 'Organization Name', 'Office Name', 'Item Category', 'Consignee', 'Contact details'],
    asciiFlat,
  );
}

export function extractConsigneeOfficer(
  raw: string,
  flat: string,
  asciiFlat = buildAsciiFlat(raw),
): string {
  const tableRow = extractConsigneeFromTable(asciiFlat);
  if (tableRow.officer) return tableRow.officer;

  const patterns = [
    /consignee\s+reporting\s*\/?\s*officer\s*:\s*([A-Za-z][A-Za-z\s.'-]{1,80}?)(?=\s*,\s*address\s*:|\s+address\s*:|\s*,|\s*$)/i,
    /consignee\s+reporting\s*\/?\s*officer\s*[:\-–]?\s*([A-Za-z][A-Za-z\s.'-]{1,80}?)(?=\s+address\s*[:\-–]|\n|$)/i,
    /consignee\s+reporting\s*\/?\s*officer\s*\n\s*([A-Za-z][A-Za-z\s.'-]{1,80})/i,
  ];

  for (const source of [asciiFlat, raw, flat]) {
    for (const pattern of patterns) {
      const match = source.match(pattern);
      const name = cleanPersonName(match?.[1] ?? '');
      if (name) return name;
    }

    const numbered = extractNumberedConsigneeName(source);
    if (numbered) return numbered;
  }

  const fromLabel = extractGemLabeledField(
    raw,
    flat,
    ['Consignee Reporting/Officer', 'Consignee Reporting Officer', 'Consignee Officer'],
    ['Address', 'Additional Requirement', 'Tenure', 'Basic Pay', 'Estimated'],
    asciiFlat,
  );
  const cleaned = cleanPersonName(fromLabel);
  if (cleaned) return cleaned;

  return extractFromBeneficiary(asciiFlat).officer;
}

function stripConsigneeLinesFromBlock(block: string): string {
  return block
    .split('\n')
    .map((line) => stripPdfNoise(line))
    .filter((line) => {
      if (!line) return false;
      if (/consignee\s+reporting|reporting\s*\/?\s*officer/i.test(line)) return false;
      if (/^address\s*[:\-–]/i.test(line)) return false;
      if (/^\d+\s+[A-Z][A-Za-z]+(?:\s+[A-Za-z]+){1,4}$/.test(line)) return false;
      return true;
    })
    .join('\n');
}

function extractAdditionalRequirements(raw: string, flat: string): {
  additionalRequirements: string;
  consigneeOfficer: string;
  address: string;
} {
  const blockMatch =
    raw.match(
      new RegExp(
        `additional\\s+requirement\\s*${OPTIONAL_LABEL_SEP}\\s*\\n?([\\s\\S]{20,4000}?)(?=\\n\\s*(?:estimated|item description|bid number|specification|emd|minimum|department|tender type|$))`,
        'i',
      ),
    ) ||
    flat.match(
      new RegExp(
        `additional\\s+requirement\\s*${OPTIONAL_LABEL_SEP}\\s*(.+?)(?=\\s+(?:estimated\\s+bid\\s+value|item description|bid number|specification|emd|minimum|department|tender type|$))`,
        'i',
      ),
    );

  if (!blockMatch?.[1]) {
    return { additionalRequirements: '', consigneeOfficer: '', address: '' };
  }

  const block = blockMatch[1];
  let consigneeOfficer = '';

  const officerMatch = block.match(
    /consignee\s+reporting\s*\/?\s*officer\s*[:\-–]?\s*([^,\n]+)/i,
  );
  if (officerMatch?.[1]) {
    consigneeOfficer = cleanPersonName(officerMatch[1]);
  }
  if (!consigneeOfficer) {
    consigneeOfficer = extractNumberedConsigneeName(block);
  }

  let address = '';
  const addressMatch = block.match(/(?:^|[\n,])\s*address\s*[:\-–]?\s*([^,\n]+)/i);
  if (addressMatch?.[1]) {
    address = cleanFieldValue(addressMatch[1]);
  }

  const cleaned = stripConsigneeLinesFromBlock(block);
  const lines = cleaned
    .split('\n')
    .map((line) => stripPdfNoise(line))
    .filter((line) => line.length > 2 && /[:\d]/.test(line));

  const body = lines.length > 0 ? lines.join('\n') : stripPdfNoise(cleaned);
  const hasManpowerTerms = /tenure|basic pay|provident fund|esi|working days/i.test(body);

  return {
    additionalRequirements: hasManpowerTerms ? body : '',
    consigneeOfficer,
    address,
  };
}

export function parseGemOrganisationFromText(text: string): {
  ministry: string;
  organisation: string;
  consigneeOfficer: string;
  address: string;
  additionalRequirements: string;
} {
  const raw = normalizeGemPdfText(text);
  const flat = raw.replace(/\s+/g, ' ').trim();
  const asciiFlat = buildAsciiFlat(raw);
  const addReqBlock = extractAdditionalRequirements(raw, flat);

  let consigneeOfficer = extractConsigneeOfficer(raw, flat, asciiFlat);
  if (!consigneeOfficer) {
    consigneeOfficer = addReqBlock.consigneeOfficer;
  }

  let address = extractAddress(raw, flat, asciiFlat);
  if (!address) {
    address = addReqBlock.address;
  }

  let additionalRequirements = addReqBlock.additionalRequirements;
  if (!additionalRequirements) {
    additionalRequirements = extractManpowerTermsBlocks(asciiFlat);
  }

  return {
    ministry: extractMinistry(raw, flat, asciiFlat),
    organisation: extractOrganisation(raw, flat, asciiFlat),
    consigneeOfficer,
    address,
    additionalRequirements,
  };
}

export function formatRateDisplay(bidValue: string, additionalRequirements: string): string {
  const value = stripPdfNoise(bidValue);
  const extras = additionalRequirements.trim();
  if (value && extras) return `${value}\n${extras}`;
  return value || extras;
}

function formatIndianRupee(numStr: string): string {
  const digits = numStr.replace(/,/g, '');
  if (!/^\d+$/.test(digits)) return numStr;
  return `Rs. ${Number(digits).toLocaleString('en-IN')}`;
}

function extractRate(raw: string, flat: string): string {
  const inrInclusive =
    flat.match(/in\s+INR\s*\([^)]*inclusive[^)]*\)\s*([\d,.]+)/i) ||
    raw.match(/in\s+INR\s*\([^)]*inclusive[^)]*\)\s*\n\s*([\d,.]+)/i);
  if (inrInclusive?.[1]) return formatIndianRupee(inrInclusive[1].replace(/\.\d+$/, ''));

  const estimatedBlock =
    raw.match(
      /Estimated\s+Bid\s+Value\s*\n\s*in\s+INR[^\n]*\n\s*([\d,.]+)/i,
    ) ||
    flat.match(
      /Estimated\s+Bid\s+Value[^0-9]{0,120}([\d,.]{4,})/i,
    );
  if (estimatedBlock?.[1]) {
    const digits = estimatedBlock[1].replace(/,/g, '').replace(/\.\d+$/, '');
    return formatIndianRupee(digits);
  }

  const labeled =
    extractAfterLabel(raw, [
      'Estimated Bid Value',
      'Estimated Contract Value',
      'Total Contract Value',
      'Bid Value',
      'Contract Value',
      'Approximate value',
    ]) ||
    extractAfterLabel(flat, [
      'Estimated Bid Value',
      'Estimated Contract Value',
      'Total Contract Value',
      'Bid Value',
      'Contract Value',
    ]);
  if (labeled) {
    const amount = labeled.match(/([\d,.]{4,})/);
    if (amount?.[1]) return formatIndianRupee(amount[1].replace(/,/g, '').replace(/\.\d+$/, ''));
    const rupee = labeled.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (rupee?.[1]) return `Rs. ${rupee[1]}`;
    return stripPdfNoise(labeled);
  }

  const rupee = flat.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (rupee?.[1]) return `Rs. ${rupee[1]}`;

  return '';
}

function detectNoPreBid(
  raw: string,
  flat: string,
  preBidAt: string,
  preBidAddress: string,
): boolean {
  if (preBidAt || preBidAddress) return false;
  if (/pre\s*[- ]?\s*bid\s+detail/i.test(flat) && DATE_TIME_RE.test(flat)) return false;
  if (/pre\s*[- ]?\s*bid\s+meeting\s*(?:required|applicable)?\s*[:\-–]?\s*no/i.test(flat)) {
    return true;
  }
  if (/no\s+pre\s*[- ]?\s*bid/i.test(flat)) return true;
  if (/pre\s*[- ]?\s*bid\s+meeting\s*[:\-–]?\s*not\s+applicable/i.test(flat)) return true;
  if (/pre\s*[- ]?\s*bid\s+meeting\s*(?:required|applicable)?\s*[:\-–]?\s*yes/i.test(flat)) {
    return false;
  }
  return !preBidAt;
}

export function formatPreBidDisplay(preBidAt: string, preBidAddress: string): string {
  const at = normalizeGemPdfDateTime(preBidAt);
  const venue = stripPdfNoise(preBidAddress);
  if (at && venue) return `${at} @ ${venue}`;
  return at || venue;
}

export function parseGemBidPdfText(text: string): GemPdfDetails {
  const raw = normalizeGemPdfText(text.replace(/\r/g, '\n'));
  const flat = raw.replace(/\s+/g, ' ').trim();
  const asciiFlat = buildAsciiFlat(raw);

  let preBidAt = extractPreBidDateTime(raw, flat);
  const tableRow = extractFromPreBidTableRow(flat);
  const detailsSection = extractFromPreBidDetailsSection(raw, flat);
  preBidAt = preBidAt || tableRow.at || detailsSection.at;

  let preBidAddress =
    tableRow.venue ||
    extractPreBidVenue(raw, flat, preBidAt) ||
    detailsSection.venue;

  const addReqBlock = extractAdditionalRequirements(raw, flat);

  const ministry = extractMinistry(raw, flat, asciiFlat);
  const organisation = extractOrganisation(raw, flat, asciiFlat);

  let consigneeOfficer = extractConsigneeOfficer(raw, flat, asciiFlat);
  if (!consigneeOfficer && addReqBlock.consigneeOfficer) {
    consigneeOfficer = addReqBlock.consigneeOfficer;
  }

  let address = extractAddress(raw, flat, asciiFlat);
  if (!address && addReqBlock.address) {
    address = addReqBlock.address;
  }

  let additionalRequirements = addReqBlock.additionalRequirements;
  if (!additionalRequirements) {
    additionalRequirements = extractManpowerTermsBlocks(asciiFlat);
  }

  const rate = '';
  const description = extractBuyerAdditionalNotes(asciiFlat);
  const noPreBid = detectNoPreBid(raw, flat, preBidAt, preBidAddress);

  const startDateRaw = extractBidDateTime(raw, flat, [
    'Bid Start Date/Time',
    'Bid Start Date',
    'Start Date',
  ]);
  const endDateRaw = extractBidDateTime(raw, flat, [
    'Bid End Date/Time',
    'Bid End Date',
    'End Date',
  ]);

  return {
    preBidAt: normalizeGemPdfDateTime(preBidAt.trim()),
    preBidAddress: preBidAddress.trim(),
    startDate: normalizeGemPdfDate(startDateRaw),
    endDate: normalizeGemPdfDateTime(endDateRaw),
    rate,
    additionalRequirements,
    description,
    ministry,
    organisation,
    consigneeOfficer,
    address,
    noPreBid,
  };
}

export function isGemBidDocumentPage(url = window.location.href): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    return hostname.includes('bidplus.gem') && /showbidDocument/i.test(pathname);
  } catch {
    return false;
  }
}

export function extractGemDocId(url = window.location.href): string {
  const match = url.match(/showbidDocument\/(\d+)/i);
  return match?.[1] ?? '';
}
