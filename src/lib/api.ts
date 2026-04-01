/**
 * Centralized API helper for the Dynamic QR frontend.
 */
import { auth } from '../firebase';

/**
 * Get a fresh Firebase ID token. Firebase caches tokens internally
 * and only refreshes when close to expiry, so this is cheap to call
 * on every request.
 */
async function getToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken(); // auto-refreshes if expired
}

/**
 * Authenticated fetch wrapper.
 * Throws an ApiError with status + message on non-2xx responses.
 */
export async function apiFetch<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      // response body wasn't JSON
    }
    throw new ApiError(message, res.status);
  }

  return res.json();
}

/** Typed error class so callers can check status codes */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Format a number with locale-aware commas: 48291 → "48,291" */
export function formatNumber(n: number | undefined | null): string {
  if (n == null) return '0';
  return n.toLocaleString();
}

/** Clamp a percentage to [0, 100] to avoid floating-point overflow */
export function clampPct(n: number | string | undefined | null): string {
  if (n == null) return '0';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  return Math.min(100, Math.max(0, num)).toFixed(1);
}
