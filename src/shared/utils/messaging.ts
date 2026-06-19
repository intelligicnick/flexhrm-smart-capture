type ExtensionMessage = { type: string; payload?: unknown };

export const EXTENSION_EVENT_KEY = 'flexhrm:extension-event';

export const EXTENSION_RELOAD_HINT =
  'Refresh this GeM page, then try Pull & Read PDFs again. If it persists, open chrome://extensions and reload FlexHRM Smart Capture.';

const RELOAD_HINT =
  'Open chrome://extensions, click Reload on FlexHRM Smart Capture, then refresh this GeM page.';

export function isExtensionContextValid(): boolean {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

function isIgnorableRuntimeError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection') ||
    message.includes('message port closed')
  );
}

function describeMessagingFailure(
  runtimeError?: string,
  empty = false,
): { success: false; error: string; hint?: string } {
  if (!chrome?.runtime?.id || runtimeError?.includes('Extension context invalidated')) {
    return {
      success: false,
      error: 'FlexHRM extension was updated or reloaded.',
      hint: EXTENSION_RELOAD_HINT,
    };
  }
  if (
    runtimeError?.includes('Receiving end does not exist') ||
    runtimeError?.includes('Could not establish connection')
  ) {
    return {
      success: false,
      error: 'FlexHRM extension background is not running.',
      hint: RELOAD_HINT,
    };
  }
  if (runtimeError?.includes('message port closed')) {
    return {
      success: false,
      error: 'FlexHRM extension took too long to respond.',
      hint: 'Try fewer tenders at once, reload the extension, then refresh this page.',
    };
  }
  if (empty) {
    return {
      success: false,
      error: 'FlexHRM extension did not return a response.',
      hint: RELOAD_HINT,
    };
  }
  return {
    success: false,
    error: runtimeError || 'Could not reach FlexHRM extension.',
    hint: RELOAD_HINT,
  };
}

/** Wake the MV3 service worker before heavier work (best-effort). */
export function pingExtensionBackground(): void {
  if (!chrome?.runtime?.id) return;
  try {
    chrome.runtime.sendMessage({ type: 'PING' }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // Extension context invalidated.
  }
}

/** Send a message to the extension service worker; never throws. */
export function sendExtensionMessage<T extends Record<string, unknown> = Record<string, unknown>>(
  message: ExtensionMessage,
): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    if (!chrome?.runtime?.id) {
      resolve(describeMessagingFailure('Extension context invalidated') as unknown as T);
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError?.message;
        if (runtimeError) {
          resolve(describeMessagingFailure(runtimeError) as unknown as T);
          return;
        }
        if (response === undefined || response === null) {
          resolve(describeMessagingFailure(undefined, true) as unknown as T);
          return;
        }
        resolve(response as T);
      });
    } catch {
      resolve(describeMessagingFailure('Extension context invalidated') as unknown as T);
    }
  }).catch(() => describeMessagingFailure(undefined, true) as unknown as T);
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
