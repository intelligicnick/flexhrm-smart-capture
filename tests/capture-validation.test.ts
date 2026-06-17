import { describe, expect, it } from 'vitest';
import { validateCapture } from '../src/modules/capture/validation';

describe('validateCapture', () => {
  it('rejects empty captures', () => {
    expect(validateCapture('', 'selection').accepted).toBe(false);
  });

  it('rejects navigation chrome', () => {
    expect(validateCapture('Login', 'selection').accepted).toBe(false);
    expect(validateCapture('English', 'text').accepted).toBe(false);
    expect(
      validateCapture('Showing 1 - 10 records of 45524 records', 'selection').accepted,
    ).toBe(false);
  });

  it('rejects calendar tables', () => {
    const table = '"Su","Mo","Tu","We","Th","Fr","Sa"';
    expect(validateCapture(table, 'table').accepted).toBe(false);
  });

  it('accepts tender bid text', () => {
    const bid = 'BID NO: GEM/2026/B/7631625 Department of Education';
    expect(validateCapture(bid, 'selection').accepted).toBe(true);
  });

  it('accepts contact-rich selections', () => {
    const profile = 'Rahul Sharma\nrahul@example.com\n9876543210';
    expect(validateCapture(profile, 'selection').accepted).toBe(true);
  });

  it('rejects very short generic selections', () => {
    expect(validateCapture('menu', 'selection').accepted).toBe(false);
  });
});
