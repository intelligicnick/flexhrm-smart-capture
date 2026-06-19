import { describe, expect, it } from 'vitest';
import { formatHttpApiError, formatThrownError } from '../src/shared/utils/api-error-messages';

describe('formatHttpApiError', () => {
  it('extracts NestJS message from JSON body', () => {
    const result = formatHttpApiError(
      JSON.stringify({
        message: 'This connection code was already used.',
        error: 'Bad Request',
        statusCode: 400,
      }),
      400,
      'connect',
    );
    expect(result.message).toBe('This connection code was already used.');
    expect(result.title).toBe('Connection failed');
  });

  it('explains HTML responses as wrong URL', () => {
    const result = formatHttpApiError('<html><body>Login</body></html>', 200, 'connect');
    expect(result.title).toBe('Wrong URL');
    expect(result.hint).toMatch(/API URL/);
  });

  it('maps 404 to API not found guidance', () => {
    const result = formatHttpApiError('', 404, 'connect');
    expect(result.title).toBe('API not found');
    expect(result.hint).toMatch(/localhost/);
  });
});

describe('formatThrownError', () => {
  it('maps failed fetch to network guidance', () => {
    const result = formatThrownError(new TypeError('Failed to fetch'), 'connect');
    expect(result.title).toBe('Cannot reach FlexHRM');
    expect(result.hint).toMatch(/fresh code/i);
  });
});
