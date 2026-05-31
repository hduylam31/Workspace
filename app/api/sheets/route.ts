/**
 * /api/sheets — Proxy tới Apps Script Web App
 *
 * Browser không gọi thẳng script.google.com được (CORS + redirect).
 * Next.js API route này làm trung gian: nhận request từ client → forward tới Apps Script.
 *
 * Cần cấu hình Apps Script URL trong Settings của app.
 * Apps Script URL được lưu trong localStorage → truyền qua header x-script-url.
 */

import { NextRequest, NextResponse } from 'next/server';

const SCRIPT_URL_HEADER = 'x-script-url';

function isValidScriptUrl(url: string): boolean {
  return url.startsWith('https://script.google.com/macros/s/');
}

// ─── POST: forward body sang Apps Script (doPost) ───────────────────────────
export async function POST(req: NextRequest) {
  const scriptUrl = req.headers.get(SCRIPT_URL_HEADER);

  if (!scriptUrl || !isValidScriptUrl(scriptUrl)) {
    return NextResponse.json(
      { success: false, error: 'Thiếu hoặc sai x-script-url header' },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const res = await fetch(scriptUrl, {
      method:   'POST',
      headers:  { 'Content-Type': 'text/plain' }, // Apps Script yêu cầu text/plain
      body:     JSON.stringify(body),
      redirect: 'follow',
    });

    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return NextResponse.json(json, { status: res.ok ? 200 : 502 });
    } catch {
      return NextResponse.json(
        { success: false, error: `Apps Script error (HTTP ${res.status}): ${text.slice(0, 300)}` },
        { status: 502 },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: `Proxy error: ${msg}` }, { status: 500 });
  }
}

// ─── GET: forward query params sang Apps Script (doGet) ─────────────────────
export async function GET(req: NextRequest) {
  const scriptUrl = req.headers.get(SCRIPT_URL_HEADER);

  if (!scriptUrl || !isValidScriptUrl(scriptUrl)) {
    return NextResponse.json(
      { success: false, error: 'Thiếu hoặc sai x-script-url header' },
      { status: 400 },
    );
  }

  const params  = req.nextUrl.searchParams.toString();
  const fullUrl = params ? `${scriptUrl}?${params}` : scriptUrl;

  try {
    const res  = await fetch(fullUrl, { redirect: 'follow' });
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text));
    } catch {
      return NextResponse.json(
        { success: false, error: `Apps Script error: ${text.slice(0, 300)}` },
        { status: 502 },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: `Proxy error: ${msg}` }, { status: 500 });
  }
}
