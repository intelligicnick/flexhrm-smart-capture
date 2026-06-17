import type {
  CaptureDraft,
  DuplicateMatch,
  ExtractedCandidateData,
  ExtractedTender,
  FlexHRMConfig,
  QueuedRecord,
  SaveTargetType,
} from '../types';
import { tenderToFlexHRMPayload } from '../../modules/tenders/gem-extractor';
import { resolveFlexHrmApiUrl } from '../utils/resolve-api-url';
import { loadConfig } from './secure-storage';
import { enqueue } from './storage';

export class FlexHRMApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'FlexHRMApiError';
  }
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
  if (trimmed.startsWith('<!') || trimmed.toLowerCase().startsWith('<html')) {
    throw new FlexHRMApiError(
      'Got an HTML page instead of JSON. In extension Settings, use your FlexHRM API URL — not the login page URL. Copy the API URL from FlexHRM profile → Browser Extension.',
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new FlexHRMApiError(text || 'Invalid JSON response from FlexHRM API.');
  }
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
    throw new FlexHRMApiError('FlexHRM URL must use HTTPS in production.');
  }

  const url = `${apiBase(config, origin)}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(config),
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new FlexHRMApiError(text || `Request failed (${response.status})`, response.status);
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
  const apiOrigin = await resolveFlexHrmApiUrl(flexhrmUrl);
  const response = await fetch(`${apiOrigin}/api/smart-capture/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim().toUpperCase(), flexhrmUrl: apiOrigin }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const trimmed = text.trim();
    if (trimmed.startsWith('<!') || trimmed.toLowerCase().startsWith('<html')) {
      throw new FlexHRMApiError(
        'Got an HTML page instead of JSON. Use your FlexHRM API URL — not the login page URL.',
      );
    }
    throw new FlexHRMApiError(text || `Connection failed (${response.status})`, response.status);
  }

  const data = (await readJsonResponse<{
    flexhrmUrl: string;
    accessToken: string;
    organizationId: string;
    username: string;
  }>(response));

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
