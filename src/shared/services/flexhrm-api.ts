import type {
  CaptureDraft,
  DuplicateMatch,
  ExtractedCandidateData,
  ExtractedContract,
  ExtractedTender,
  FlexHRMConfig,
  QueuedRecord,
  SaveTargetType,
} from '../types';
import { tenderToFlexHRMPayload } from '../../modules/tenders/gem-extractor';
import { contractToFlexHRMPayload } from '../../modules/contracts/gem-orders-extractor';
import { resolveFlexHrmApiUrl } from '../utils/resolve-api-url';
import {
  formatHttpApiError,
  formatThrownError,
  formatUserFacingErrorText,
  type UserFacingError,
} from '../utils/api-error-messages';
import { loadConfig } from './secure-storage';
import { enqueue } from './storage';

export class FlexHRMApiError extends Error {
  public userFacing: UserFacingError;

  constructor(userFacing: UserFacingError, public status?: number) {
    super(formatUserFacingErrorText(userFacing));
    this.name = 'FlexHRMApiError';
    this.userFacing = userFacing;
  }
}

function throwApiError(body: string, status?: number, context: 'connect' | 'test' | 'save' | 'request' = 'request'): never {
  throw new FlexHRMApiError(formatHttpApiError(body, status, context), status);
}

function wrapFetchError(err: unknown, context: 'connect' | 'test' | 'save' | 'request'): never {
  throw new FlexHRMApiError(formatThrownError(err, context));
}

function apiBase(config: FlexHRMConfig, resolvedOrigin: string): string {
  return `${resolvedOrigin}/api`;
}

async function resolveConfigOrigin(config: FlexHRMConfig): Promise<string> {
  return resolveFlexHrmApiUrl(config.flexhrmUrl);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text().catch(() => '');
  const trimmed = text.trim();
  if (isHtmlBody(trimmed)) {
    throwApiError(trimmed);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throwApiError(text || 'Invalid JSON response from FlexHRM API.');
  }
}

function isHtmlBody(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('<!') || trimmed.toLowerCase().startsWith('<html');
}

function authHeaders(config: FlexHRMConfig): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.accessToken) {
    headers.Authorization = `Bearer ${config.accessToken}`;
  }
  if (config.apiKey) {
    headers['X-API-Key'] = config.apiKey;
  }
  return headers;
}

async function request<T>(
  config: FlexHRMConfig,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const origin = await resolveConfigOrigin(config);
  if (!origin.startsWith('https://') && !origin.includes('localhost')) {
    throw new FlexHRMApiError({
      title: 'HTTPS required',
      message: 'FlexHRM URL must use HTTPS in production.',
      hint: 'For local development, use http://localhost:3000 or http://localhost:3001.',
    });
  }

  const url = `${apiBase(config, origin)}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...authHeaders(config),
        ...(options.headers ?? {}),
      },
    });
  } catch (err) {
    wrapFetchError(err, 'request');
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throwApiError(text, response.status, 'request');
  }

  return readJsonResponse<T>(response);
}

export async function getConfig(): Promise<FlexHRMConfig | null> {
  return loadConfig();
}

export async function connectWithCode(
  flexhrmUrl: string,
  code: string,
): Promise<FlexHRMConfig> {
  const trimmedCode = code.trim().toUpperCase();
  if (!trimmedCode) {
    throw new FlexHRMApiError({
      title: 'Code required',
      message: 'Enter the connection code from FlexHRM profile → Browser Extension.',
    });
  }
  if (!/^FH-[A-F0-9]{24}$/.test(trimmedCode)) {
    throw new FlexHRMApiError({
      title: 'Invalid code format',
      message: 'Connection codes look like FH-ABC123DEF456789012345678 (24 characters after FH-).',
      hint: 'Copy the full code from FlexHRM — do not type it manually if possible.',
    });
  }

  const apiOrigin = await resolveFlexHrmApiUrl(flexhrmUrl);
  let response: Response;
  try {
    response = await fetch(`${apiOrigin}/api/smart-capture/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: trimmedCode, flexhrmUrl: apiOrigin }),
    });
  } catch (err) {
    wrapFetchError(err, 'connect');
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throwApiError(text, response.status, 'connect');
  }

  const data = await readJsonResponse<{
    flexhrmUrl: string;
    accessToken: string;
    organizationId: string;
    username: string;
  }>(response);

  return {
    flexhrmUrl: data.flexhrmUrl || apiOrigin,
    accessToken: data.accessToken,
    organizationId: data.organizationId || 'default',
    username: data.username || '',
    apiKey: '',
  };
}

export async function testConnection(config: FlexHRMConfig): Promise<boolean> {
  await request(config, '/smart-capture/health');
  return true;
}

export async function extractData(
  config: FlexHRMConfig,
  content: string,
  sourceType = 'text',
): Promise<ExtractedCandidateData> {
  const result = await request<{ data: ExtractedCandidateData }>(config, '/smart-capture/extract', {
    method: 'POST',
    body: JSON.stringify({ content, sourceType }),
  });
  return result.data;
}

export async function checkDuplicates(
  config: FlexHRMConfig,
  params: { email?: string; mobile?: string; fullName?: string },
): Promise<{ hasDuplicates: boolean; matches: DuplicateMatch[] }> {
  return request(config, '/smart-capture/duplicate-check', {
    method: 'POST',
    body: JSON.stringify({
      ...params,
      organizationId: config.organizationId,
    }),
  });
}

export async function saveCapture(
  config: FlexHRMConfig,
  draft: CaptureDraft,
): Promise<{ id: string; type: SaveTargetType }> {
  const payload = {
    organizationId: config.organizationId,
    ...draft.extracted,
    sourceUrl: draft.metadata.sourceUrl,
    sourceTitle: draft.metadata.sourceTitle,
    sourceSite: draft.metadata.sourceSite,
    rawContent: draft.rawContent,
    metadata: draft.metadata,
  };

  const pathMap: Record<SaveTargetType, string> = {
    candidate: '/smart-capture/candidates',
    lead: '/smart-capture/leads',
    contact: '/smart-capture/contacts',
    employee: '/employees',
    tender: '/tenders',
  };

  const path = pathMap[draft.saveTarget];
  const result = await request<{ id: string }>(config, path, {
    method: 'POST',
    body: JSON.stringify(
      draft.saveTarget === 'lead'
        ? {
            organizationId: config.organizationId,
            name: draft.extracted.fullName,
            email: draft.extracted.email,
            mobile: draft.extracted.mobile,
            company: draft.extracted.currentCompany,
            designation: draft.extracted.designation,
            sourceUrl: draft.metadata.sourceUrl,
            extractedData: draft.extracted,
            metadata: draft.metadata,
          }
        : draft.saveTarget === 'contact'
          ? {
              organizationId: config.organizationId,
              name: draft.extracted.fullName,
              email: draft.extracted.email,
              mobile: draft.extracted.mobile,
              company: draft.extracted.currentCompany,
              role: draft.extracted.designation,
              address: draft.extracted.address,
              sourceUrl: draft.metadata.sourceUrl,
              extractedData: draft.extracted,
              metadata: draft.metadata,
            }
          : payload,
    ),
  });

  if (draft.imageBase64) {
    await uploadDocument(config, {
      recordType: draft.saveTarget,
      recordId: result.id,
      fileName: `capture-${Date.now()}.png`,
      mimeType: 'image/png',
      contentBase64: draft.imageBase64,
      category: 'screenshot',
    }).catch(() => undefined);
  }

  return { id: result.id, type: draft.saveTarget };
}

export async function uploadDocument(
  config: FlexHRMConfig,
  params: {
    recordType: string;
    recordId: string;
    fileName: string;
    mimeType: string;
    contentBase64: string;
    category?: string;
    notes?: string;
  },
): Promise<unknown> {
  return request(config, '/smart-capture/documents', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function listTenders(
  config: FlexHRMConfig,
): Promise<Array<{ id: string; bidNo: string }>> {
  return request(config, '/tenders');
}

export async function checkTenderDuplicates(
  config: FlexHRMConfig,
  bidNos: string[],
): Promise<{ existing: string[] }> {
  const all = await listTenders(config);
  const existingSet = new Set(all.map((t) => t.bidNo.toUpperCase()));
  const existing = bidNos.filter((b) => existingSet.has(b.toUpperCase()));
  return { existing };
}

export async function importTenders(
  config: FlexHRMConfig,
  tenders: ExtractedTender[],
): Promise<{ created: number; skipped: number; errors: string[] }> {
  const items = tenders.map(tenderToFlexHRMPayload);
  return request(config, '/tenders/import', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export async function syncTenderStatuses(
  config: FlexHRMConfig,
  tenders: ExtractedTender[],
): Promise<{ updated: number; notFound: number; errors: string[] }> {
  const items = tenders.map((t) => ({
    bidNo: t.bidNo,
    status: t.status,
    outcome: t.outcome || t.gemParticipation,
    gemCurrentStage: t.gemCurrentStage,
    preBidAt: t.preBidAt,
    preBidVenue: t.preBidVenue,
    noPreBid: t.noPreBid,
    address: t.address,
    rate: t.rate,
    additionalRequirements: t.additionalRequirements,
    description: t.description,
    category: t.category,
    ministry: t.ministry,
    organisation: t.organisation || t.department,
    consigneeOfficer: t.consigneeOfficer || t.officerName,
    department: t.organisation || t.department,
    endDate: t.endDate,
    startDate: t.startDate || t.gemStartDate,
    filedDate: t.filedDate,
    gemDocUrl: t.gemDocUrl,
  }));
  return request(config, '/tenders/sync', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export async function saveTender(
  config: FlexHRMConfig,
  tender: ExtractedTender,
): Promise<{ id: string }> {
  return request(config, '/tenders', {
    method: 'POST',
    body: JSON.stringify(tenderToFlexHRMPayload(tender)),
  });
}

export async function listContracts(
  config: FlexHRMConfig,
): Promise<Array<{ id: string; contractNo: string; gemContractPdfUrl?: string }>> {
  return request(config, '/contracts');
}

export async function checkContractDuplicates(
  config: FlexHRMConfig,
  contractKeys: string[],
): Promise<{ existing: string[] }> {
  const all = await listContracts(config);
  const existingSet = new Set(
    all.flatMap((c) => [c.contractNo, c.gemContractPdfUrl].filter(Boolean).map((v) => v!.toUpperCase())),
  );
  const existing = contractKeys.filter((key) => existingSet.has(key.toUpperCase()));
  return { existing };
}

export async function importContracts(
  config: FlexHRMConfig,
  contracts: ExtractedContract[],
): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
  const items = contracts.map(contractToFlexHRMPayload);
  return request(config, '/contracts/import', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export async function saveWithOfflineFallback(
  config: FlexHRMConfig,
  draft: CaptureDraft,
): Promise<{ id: string; queued: boolean }> {
  try {
    const result = await saveCapture(config, draft);
    return { id: result.id, queued: false };
  } catch (err) {
    if (!navigator.onLine || (err instanceof FlexHRMApiError && err.status === undefined)) {
      const queueItem: QueuedRecord = {
        id: draft.id,
        endpoint: `/smart-capture/${draft.saveTarget}s`,
        method: 'POST',
        payload: { draft, config: { organizationId: config.organizationId } },
        retries: 0,
        createdAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Network error',
      };
      await enqueue(queueItem);
      return { id: draft.id, queued: true };
    }
    throw err;
  }
}

export async function processOfflineQueue(config: FlexHRMConfig): Promise<number> {
  const { getQueue, dequeue, updateQueueRecord } = await import('./storage');
  const queue = await getQueue();
  let processed = 0;

  for (const item of queue) {
    try {
      const draft = item.payload.draft as CaptureDraft;
      await saveCapture(config, draft);
      await dequeue(item.id);
      processed += 1;
    } catch (err) {
      await updateQueueRecord({
        ...item,
        retries: item.retries + 1,
        lastAttemptAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Retry failed',
      });
    }
  }

  return processed;
}
