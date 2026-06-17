import type { FlexHRMConfig } from '../types';

const CONFIG_KEY = 'flexhrm_config_encrypted';
const SALT = 'flexhrm-smart-capture-v1';

async function deriveKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const extensionId = chrome.runtime.id;
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`${SALT}:${extensionId}`),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(SALT),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptConfig(config: FlexHRMConfig): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(config));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptConfig(encrypted: string): Promise<FlexHRMConfig | null> {
  try {
    const key = await deriveKey();
    const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const cipher = combined.slice(12);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return JSON.parse(new TextDecoder().decode(plain)) as FlexHRMConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(config: FlexHRMConfig): Promise<void> {
  const encrypted = await encryptConfig(config);
  await chrome.storage.local.set({ [CONFIG_KEY]: encrypted });
}

export async function loadConfig(): Promise<FlexHRMConfig | null> {
  const stored = await chrome.storage.local.get(CONFIG_KEY);
  const encrypted = stored[CONFIG_KEY] as string | undefined;
  if (!encrypted) return null;
  return decryptConfig(encrypted);
}

export async function clearConfig(): Promise<void> {
  await chrome.storage.local.remove(CONFIG_KEY);
}
