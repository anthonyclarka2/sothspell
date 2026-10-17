/**
 * Origin policy for state-changing routes. Browsers send `Origin` on POST and
 * DELETE; a missing header means a non-browser client (the CLI, curl) which
 * cannot be tricked into carrying a cookie, so it is allowed through. An
 * unexpected origin is rejected even though SameSite=Lax is the first line of
 * defense.
 */
export function isOriginAllowed(
  origin: string | null | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (!origin) {
    return true;
  }
  return allowedOrigins.includes(origin);
}

/** Secure cookies are required whenever the public URL is served over https. */
export function isSecurePublicUrl(publicUrl: string): boolean {
  return publicUrl.startsWith('https://');
}

export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
