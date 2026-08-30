import { NextRequest, NextResponse } from 'next/server';
import { chromium as playwrightChromium } from 'playwright-core';
import chromium from '@sparticuz/chromium';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Restaurant = { name: string; category?: string; rating?: string; reviews?: string; address?: string; distance?: string; href?: string; };
function clean(s?: string | null) { return (s || '').replace(/\s+/g, ' ').trim(); }

export async function POST(req: NextRequest) {
  let browser;
  try {
    const body = await req.json();
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return NextResponse.json({ error: '올바른 위치 좌표가 아닙니다.' }, { status: 400 });

    browser = await playwrightChromium.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
    const context = await browser.newContext({ locale: 'ko-KR', geolocation: { latitude, longitude }, permissions: ['geolocation'], viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' });
    const page = await context.newPage();
    const searchUrl = `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent('맛집')}&sm=hty&style=v5&center=${longitude},${latitude}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(3500);
    if (!page.url().includes('map.naver')) { await page.goto(`https://map.naver.com/p/search/${encodeURIComponent('맛집')}?c=${longitude},${latitude},15,0,0,0,dh`, { waitUntil: 'domcontentloaded', timeout: 25000 }); await page.waitForTimeout(3500); }
    const raw = await page.locator('a').evaluateAll((anchors) => anchors.map((a) => ({ text: (a.textContent || '').replace(/\s+/g, ' ').trim(), href: (a as HTMLAnchorElement).href || '' })).filter(x => x.text.length > 1 && (/place|restaurant|entry|map\.naver/.test(x.href))));
    const seen = new Set<string>(); const items: Restaurant[] = [];
    for (const x of raw) {
      const t = clean(x.text); if (!t || t.length > 220) continue;
      const name = clean(t.split(/별점|방문자 리뷰|블로그 리뷰|거리|영업/)[0]).slice(0, 60); if (!name || name === '맛집' || seen.has(name)) continue;
      seen.add(name);
      const rating = t.match(/별점\s*([0-9.]+)/)?.[1]; const visitor = t.match(/방문자 리뷰\s*([0-9,]+)/)?.[1]; const blog = t.match(/블로그 리뷰\s*([0-9,]+)/)?.[1]; const distance = t.match(/([0-9.]+\s*(?:m|km))/i)?.[1];
      items.push({ name, rating, reviews: visitor ? `방문자 리뷰 ${visitor}` : blog ? `블로그 리뷰 ${blog}` : undefined, distance, href: x.href }); if (items.length >= 10) break;
    }
    if (!items.length) return NextResponse.json({ error: '네이버 지도에서 결과를 읽지 못했습니다. 네이버의 화면 구조 또는 자동화 차단이 변경되었을 수 있습니다.' }, { status: 502 });
    return NextResponse.json({ latitude, longitude, items });
  } catch (e) { console.error(e); return NextResponse.json({ error: e instanceof Error ? `검색 실패: ${e.message}` : '검색 중 오류가 발생했습니다.' }, { status: 500 }); }
  finally { await browser?.close().catch(() => {}); }
}
