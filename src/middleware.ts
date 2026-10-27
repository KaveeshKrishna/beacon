import { NextResponse, type NextRequest } from "next/server";

function nonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function contentSecurityPolicy(value: string, development: boolean): string {
  const script = development
    ? `'self' 'nonce-${value}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${value}' 'strict-dynamic'`;
  const connect = development
    ? `'self' https://tiles.openfreemap.org https://*.openfreemap.org ws: wss:`
    : `'self' https://tiles.openfreemap.org https://*.openfreemap.org`;

  return [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://tiles.openfreemap.org https://*.openfreemap.org",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    development ? "" : "upgrade-insecure-requests",
  ]
    .filter(Boolean)
    .join("; ");
}

export function middleware(request: NextRequest) {
  const value = nonce();
  const development = process.env.NODE_ENV !== "production";
  const csp = contentSecurityPolicy(value, development);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", value);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|brand/|icon.svg|apple-icon|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest).*)",
  ],
};
