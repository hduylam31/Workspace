/**
 * Proxy route: Browser → /api/script → Apps Script Web App
 *
 * Lý do cần proxy: Browser bị CORS block khi gọi thẳng script.google.com
 * (Google redirect sang googleusercontent.com, browser chặn cross-origin redirect khi POST).
 * Server-side fetch không bị CORS → dùng Next.js API route làm trung gian.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // URL Apps Script được truyền qua header để tránh hardcode
  const scriptUrl = req.headers.get('x-script-url');

  if (!scriptUrl || !scriptUrl.startsWith('https://script.google.com')) {
    return NextResponse.json(
      { success: false, data: null, error: 'Missing or invalid x-script-url header' },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // Apps Script yêu cầu text/plain
      body: JSON.stringify(body),
      redirect: 'follow',
    });

    const text = await res.text();

    // Thử parse JSON
    try {
      const json = JSON.parse(text);
      return NextResponse.json(json, { status: res.ok ? 200 : 502 });
    } catch {
      // Apps Script trả về HTML (lỗi script) → bọc thành error
      return NextResponse.json(
        { success: false, data: null, error: `Apps Script error (HTTP ${res.status}): ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, data: null, error: `Proxy fetch failed: ${msg}` },
      { status: 500 }
    );
  }
}

// GET proxy — dùng cho ping / getReports qua Apps Script (tuỳ chọn)
export async function GET(req: NextRequest) {
  const scriptUrl = req.headers.get('x-script-url');
  const params = req.nextUrl.searchParams.toString();

  if (!scriptUrl || !scriptUrl.startsWith('https://script.google.com')) {
    return NextResponse.json(
      { success: false, data: null, error: 'Missing or invalid x-script-url header' },
      { status: 400 }
    );
  }

  try {
    const url = params ? `${scriptUrl}?${params}` : scriptUrl;
    const res = await fetch(url, { redirect: 'follow' });
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text));
    } catch {
      return NextResponse.json(
        { success: false, data: null, error: `Apps Script error: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, data: null, error: `Proxy fetch failed: ${msg}` },
      { status: 500 }
    );
  }
}
