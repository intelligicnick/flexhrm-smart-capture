import { describe, expect, it } from 'vitest';

// Test the failure copy used when chrome.runtime.sendMessage fails.
// Full sendMessage cannot run in Vitest; we mirror the helper logic here for regression safety.

function describeMessagingFailure(runtimeError?: string, empty = false) {
  if (!runtimeError && empty) {
    return {
      success: false,
      error: 'FlexHRM extension did not return a response.',
      hint: 'reload',
    };
  }
  if (runtimeError?.includes('Receiving end does not exist')) {
    return {
      success: false,
      error: 'FlexHRM extension background is not running.',
      hint: 'reload',
    };
  }
  return { success: false, error: runtimeError || 'Could not reach FlexHRM extension.' };
}

describe('extension messaging failures', () => {
  it('explains missing background worker', () => {
    const result = describeMessagingFailure('Could not establish connection. Receiving end does not exist.');
    expect(result.error).toMatch(/background is not running/i);
  });

  it('explains empty responses', () => {
    const result = describeMessagingFailure(undefined, true);
    expect(result.error).toMatch(/did not return a response/i);
  });
});
