import { createHmac, timingSafeEqual } from 'crypto';

export interface PlatformSessionPayload {
  sub: string;
  targetUserId: number;
  type: 'platform-session';
  iat: number;
  exp: number;
}

const SESSION_TYPE = 'platform-session';
const ALGO = 'sha256';

function getSecret(): string {
  const secret = process.env.PLATFORM_SESSION_SECRET;
  if (!secret) {
    console.warn('PLATFORM_SESSION_SECRET not set — using default (insecure for production)');
    return 'default-dev-secret-change-in-production';
  }
  return secret;
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): Buffer {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function sign(input: string): string {
  return base64UrlEncode(createHmac(ALGO, getSecret()).update(input).digest());
}

function encodeSegment(data: Record<string, unknown>): string {
  return base64UrlEncode(Buffer.from(JSON.stringify(data)));
}

function decodeSegment<T>(str: string): T | null {
  try {
    const json = base64UrlDecode(str).toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function signPlatformSession(payload: Omit<PlatformSessionPayload, 'iat'>): string {
  const iat = Math.floor(Date.now() / 1000);
  const full: PlatformSessionPayload = { ...payload, iat };
  const header = encodeSegment({ alg: 'HS256', typ: 'JWT' });
  const body = encodeSegment(full as unknown as Record<string, unknown>);
  const sig = sign(`${header}.${body}`);
  return `${header}.${body}.${sig}`;
}

export function verifyPlatformSession(token: string): PlatformSessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerStr, bodyStr, sigStr] = parts;

    const expectedSig = sign(`${headerStr}.${bodyStr}`);
    const actualSig = sigStr;

    const headerBuf = base64UrlDecode(expectedSig);
    const actualBuf = base64UrlDecode(actualSig);
    if (headerBuf.length !== actualBuf.length || !timingSafeEqual(headerBuf, actualBuf)) {
      return null;
    }

    const payload = decodeSegment<PlatformSessionPayload>(bodyStr);
    if (!payload) return null;
    if (payload.type !== SESSION_TYPE) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

export function getSessionExpiry(sessionExpirySeconds: number): number {
  return Math.floor(Date.now() / 1000) + sessionExpirySeconds;
}

export function getPlatformSessionSecret(): string {
  return getSecret();
}
