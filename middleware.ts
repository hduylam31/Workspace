import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE = 'ak_auth';
const AUTH_TOKEN  = 'ak_authed_v1';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Bỏ qua: login page, auth API, static assets
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // Kiểm tra cookie xác thực
  const cookie = request.cookies.get(AUTH_COOKIE);
  if (cookie?.value !== AUTH_TOKEN) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.svg$|.*\\.png$|.*\\.ico$).*)'],
};
