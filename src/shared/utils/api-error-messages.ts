export interface UserFacingError {
  title: string;
  message: string;
  hint?: string;
}

type ErrorContext = 'connect' | 'test' | 'save' | 'request';

const GENERIC_HTTP_LABELS = new Set([
  'Bad Request',
  'Unauthorized',
  'Forbidden',
  'Not Found',
  'Method Not Allowed',
  'Internal Server Error',
]);

function isHtmlBody(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('<!') || trimmed.toLowerCase().startsWith('<html');
}

function parseNestMessage(body: string): string {
  const trimmed = body.trim();
  if (!trimmed.startsWith('{')) return '';

  try {
    const data = JSON.parse(trimmed) as {
      message?: string | string[];
      error?: string;
    };
    const message =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : '';
    const error = typeof data.error === 'string' ? data.error : '';
    if (message && (!error || GENERIC_HTTP_LABELS.has(error))) return message;
    return error || message;
  } catch {
    return '';
  }
}

function networkError(context: ErrorContext): UserFacingError {
  if (context === 'connect') {
    return {
      title: 'Cannot reach FlexHRM',
      message: 'The extension could not contact your FlexHRM server.',
      hint: 'Check that FlexHRM is running, the API URL is correct (try http://localhost:3000 or http://localhost:3001), and click Connect again with a fresh code.',
    };
  }
  return {
    title: 'Network error',
    message: 'Could not reach FlexHRM. Check your internet connection and API URL in Settings.',
  };
}

function statusFallback(status: number, context: ErrorContext): UserFacingError {
  if (status === 401) {
    return {
      title: 'Session expired',
      message: 'Your FlexHRM login is no longer valid.',
      hint:
        context === 'test'
          ? 'Open FlexHRM, sign in again, then use Profile → Browser Extension to reconnect.'
          : 'Sign in to FlexHRM and generate a new connection code.',
    };
  }
  if (status === 403) {
    return {
      title: 'Access denied',
      message: 'Your account does not have permission for this action.',
      hint: 'Ask an admin to grant access, or reconnect with an account that can use Smart Capture.',
    };
  }
  if (status === 404) {
    return {
      title: 'API not found',
      message: 'FlexHRM API endpoint was not found at this URL.',
      hint: 'Use the API URL from FlexHRM profile → Browser Extension. For local dev, try http://localhost:3000 or http://localhost:3001.',
    };
  }
  if (status >= 500) {
    return {
      title: 'Server error',
      message: 'FlexHRM returned a server error. Try again in a moment.',
      hint: 'If this keeps happening, check that the NestJS backend is running.',
    };
  }
  return {
    title: 'Request failed',
    message: `FlexHRM returned an error (${status}).`,
  };
}

export function formatHttpApiError(
  body: string,
  status?: number,
  context: ErrorContext = 'request',
): UserFacingError {
  if (isHtmlBody(body)) {
    return {
      title: 'Wrong URL',
      message: 'FlexHRM returned a web page instead of the API.',
      hint: 'Paste the API URL from FlexHRM profile → Browser Extension — not the login page URL.',
    };
  }

  const parsed = parseNestMessage(body);
  if (parsed) {
    return {
      title: context === 'connect' ? 'Connection failed' : 'Something went wrong',
      message: parsed,
    };
  }

  if (body.trim()) {
    return {
      title: context === 'connect' ? 'Connection failed' : 'Request failed',
      message: body.trim(),
    };
  }

  if (status) return statusFallback(status, context);

  return {
    title: 'Request failed',
    message: 'An unexpected error occurred while contacting FlexHRM.',
  };
}

export function formatThrownError(err: unknown, context: ErrorContext = 'request'): UserFacingError {
  if (err instanceof TypeError || (err instanceof Error && /failed to fetch|network/i.test(err.message))) {
    return networkError(context);
  }

  if (err instanceof Error) {
    const parsed = parseNestMessage(err.message);
    if (parsed) {
      return {
        title: context === 'connect' ? 'Connection failed' : 'Something went wrong',
        message: parsed,
      };
    }

    if (isHtmlBody(err.message)) {
      return formatHttpApiError(err.message, undefined, context);
    }

    const status = (err as { status?: number }).status;
    if (status) {
      return formatHttpApiError(err.message, status, context);
    }

    return {
      title: context === 'connect' ? 'Connection failed' : 'Something went wrong',
      message: err.message || 'An unexpected error occurred.',
    };
  }

  return {
    title: 'Something went wrong',
    message: 'An unexpected error occurred.',
  };
}

export function formatUserFacingErrorText(error: UserFacingError): string {
  return error.hint ? `${error.message} ${error.hint}` : error.message;
}
