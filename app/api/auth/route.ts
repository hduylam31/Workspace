import { NextResponse } from 'next/server';

const PASSWORD   = 'Ankhang123Aa@';
const AUTH_COOKIE = 'ak_auth';
const AUTH_TOKEN  = 'ak_authed_v1';
const MAX_AGE     = 60 * 60 * 24 * 30; // 30 ngày

// POST /api/auth — đăng nhập
export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    if (password !== PASSWORD) {
      return NextResponse.json(
        { error: 'Mật khẩu không đúng' },
        { status: 401 }
      );
    }

    const res = NextResponse.json({ success: true });
    res.cookies.set(AUTH_COOKIE, AUTH_TOKEN, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   MAX_AGE,
      path:     '/',
    });
    return res;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

// DELETE /api/auth — đăng xuất
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(AUTH_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
