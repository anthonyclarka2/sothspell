import type { Context, Next } from 'hono';

/**
 * The API is a local application with no authentication, so every request must
 * prove it came from the machine's own browser (or a non-browser client) and
 * not from a page the user happens to have open.
 *
 * Three checks close the cross-site write and DNS-rebinding paths:
 *
 * - `Host` is validated on every request when present. DNS rebinding makes a
 *   malicious page same-origin with 127.0.0.1, but the browser still sends the
 *   attacker's hostname in `Host`, which is not loopback, an IP literal, or a
 *   configured public host.
 * - `Origin` is validated on mutating requests when present. Browsers send it
 *   for cross-site requests and for same-origin POST/PUT/DELETE.
 * - `Content-Type` must be JSON when a mutating request has a body, and
 *   `Sec-Fetch-Site: cross-site` is refused. Simple form and `text/plain`
 *   posts never reach a handler.
 *
 * The checks are deliberately additive: a request with no `Host`/`Origin`
 * (in-process tests, some CLI clients) is allowed through, because it cannot
 * carry a browser cookie and cannot be tricked by a web page.
 */

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const IPV6_PATTERN = /^[0-9a-f:]+$/i;

export interface ApiSecurityOptions {
  /** Public base URL; its host and origin are trusted. */
  publicUrl?: string | null;
  /** Additional origins to trust, for example a custom self-hosted hostname. */
  allowedOrigins?: readonly string[];
}

function hostnameOf(value: string): string | null {
  try {
    return new URL(`http://${value}`).hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname);
}

function isIpLiteral(hostname: string): boolean {
  return (
    IPV4_PATTERN.test(hostname) || (hostname.includes(':') && IPV6_PATTERN.test(hostname))
  );
}

export function createApiSecurityMiddleware(options: ApiSecurityOptions = {}) {
  const extraHostnames = new Set<string>();
  const extraOrigins = new Set<string>();

  const addConfigured = (value: string | null | undefined): void => {
    if (!value) {
      return;
    }
    try {
      const url = new URL(value);
      extraHostnames.add(url.hostname.toLowerCase());
      extraOrigins.add(url.origin);
    } catch {
      // An invalid configuration value simply trusts nothing extra.
    }
  };

  addConfigured(options.publicUrl);
  for (const origin of options.allowedOrigins ?? []) {
    addConfigured(origin);
  }

  const hostAllowed = (host: string): boolean => {
    const hostname = hostnameOf(host);
    if (hostname === null) {
      return false;
    }
    return (
      isLoopbackHostname(hostname) ||
      isIpLiteral(hostname) ||
      extraHostnames.has(hostname)
    );
  };

  const originAllowed = (origin: string): boolean => {
    if (origin === 'null') {
      return false;
    }
    try {
      const url = new URL(origin);
      const hostname = url.hostname.toLowerCase();
      return (
        isLoopbackHostname(hostname) ||
        extraHostnames.has(hostname) ||
        extraOrigins.has(url.origin)
      );
    } catch {
      return false;
    }
  };

  return async (context: Context, next: Next): Promise<Response | undefined> => {
    const host = context.req.header('host');
    if (host !== undefined && !hostAllowed(host)) {
      return context.json({ error: 'request host is not allowed' }, 403);
    }

    if (MUTATING_METHODS.has(context.req.method)) {
      const origin = context.req.header('origin');
      if (origin !== undefined && !originAllowed(origin)) {
        return context.json({ error: 'request origin is not allowed' }, 403);
      }
      if (context.req.header('sec-fetch-site') === 'cross-site') {
        return context.json({ error: 'cross-site requests are not allowed' }, 403);
      }

      const contentType = context.req.header('content-type');
      const hasBody =
        (context.req.header('content-length') ?? '0') !== '0' ||
        context.req.header('transfer-encoding') !== undefined;
      if (contentType !== undefined) {
        if (!contentType.toLowerCase().startsWith('application/json')) {
          return context.json({ error: 'content-type must be application/json' }, 415);
        }
      } else if (hasBody) {
        return context.json({ error: 'content-type must be application/json' }, 415);
      }
    }

    await next();
    return undefined;
  };
}
