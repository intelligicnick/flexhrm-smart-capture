type ExtensionMessage = { type: string; payload?: unknown };

export const EXTENSION_EVENT_KEY = 'flexhrm:extension-event';

function isIgnorableRuntimeError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection') ||
    message.includes('message port closed')
  );
}

/** Send a message to the extension service worker; never throws. */
export function sendExtensionMessage<T extends Record<string, unknown> = Record<string, unknown>>(
  message: ExtensionMessage,
): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    if (!chrome?.runtime?.id) {
      resolve(undefined);
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (response) => {
        void chrome.runtime.lastError;
        resolve((response as T) ?? undefined);
      });
    } catch {
      resolve(undefined);
    }
  }).catch(() => undefined);
}

/**
 * Notify open UI (side panel) that data changed.
 * Uses session storage so the service worker never broadcasts to content scripts
 * (which would cause "Receiving end does not exist" on every tab).
 */
export async function broadcastExtensionEvent(message: ExtensionMessage): Promise<void> {
  try {
    await chrome.storage.session.set({
      [EXTENSION_EVENT_KEY]: {
        type: message.type,
        payload: message.payload,
        at: Date.now(),
      },
    });
  } catch {
    // Ignore — side panel will refresh on next open.
  }
}

/**
 * Open the side panel while the user-gesture chain is still active.
 * Must be called synchronously from a click/key handler (not after await/.then).
 */
export function requestOpenSidePanel(): void {
  if (!chrome?.runtime?.id) return;
  try {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // Extension context invalidated after reload.
  }
}

/** Route debug logs through the service worker (avoids HTTPS mixed-content blocks). */
export function postDebugLog(payload: Record<string, unknown>): void {
  if (!chrome?.runtime?.id) return;
  try {
    chrome.runtime.sendMessage(
      { type: 'DEBUG_LOG', payload: { sessionId: '3941a9', runId: 'post-fix', ...payload } },
      () => {
        void chrome.runtime.lastError;
      },
    );
  } catch {
    // Extension context invalidated.
  }
}

export { isIgnorableRuntimeError };
