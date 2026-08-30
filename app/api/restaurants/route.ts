import { NextRequest, NextResponse } from 'next/server';
import { chromium as playwrightChromium } from 'playwright-core';
import chromium from '@sparticuz/chromium';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Restaurant = { name: string; category?: string; rating?: string; reviews?: string; address?: string; distance?: string; href?: string; };
function clean(s?: string | null) { return (s || '').replace(/\s+/g, ' ').trim(); }

async function waitForPlaceLinks(page: any) {
  await page.waitForFunction(() => {
    const links = Array.from(document.querySelectorAll('a')) as HTMLAnchorElement[];
    return links.some((a) => /(?:restaurant|place)\/\d+|entry\/place\/\d+/i.test(a.href || ''));
  }, { timeout: 2200 }).catch(() => {});
}

function placeIdFromHref(href: string) {
  return href.match(/(?:restaurant|place)\/(\d+)/i)?.[1] || href.match(/entry\/place\/(\d+)/i)?.[1] || href;
}

export async function POST(req: NextRequest) {
  let browser;
  try {
    const body = await req.json();
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return NextResponse.json({ error: '올바른 위치 좌표가 아닙니다.' }, { status: 400 });
    }

    browser = await playwrightChromium.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
    const context = await browser.newContext({
      locale: 'ko-KR',
      geolocation: { latitude, longitude },
      permissions: ['geolocation'],
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
    });

    const page = await context.newPage();
    const searchUrl = `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent('맛집')}&sm=hty&style=v5&center=${longitude},${latitude}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await waitForPlaceLinks(page);

    const raw = await page.locator('a').evaluateAll((anchors) => anchors.map((a) => ({
      text: (a.textContent || '').replace(/\s+/g, ' ').trim(),
      href: (a as HTMLAnchorElement).href || '',
    })).filter((x) => x.text.length > 1 && /(?:restaurant|place)\/\d+|entry\/place\/\d+/i.test(x.href)));

    const blockedNames = new Set([
      '네이버지도','지도','버스','교통정보','로그인이 필요합니다.','이용약관 및 정책','신규장소 등록','맛집',
      '가격','메뉴','리뷰','사진','홈','길찾기','전화','저장','공유','주문','예약','정보'
    ]);

    const seenPlaceIds = new Set<string>();
    const seenNames = new Set<string>();
    const items: Restaurant[] = [];

    for (const x of raw) {
      const placeId = placeIdFromHref(x.href);
      if (seenPlaceIds.has(placeId)) continue;

      const t = clean(x.text);
      if (!t || t.length > 260) continue;
      const name = clean(t.split(/별점|방문자 리뷰|블로그 리뷰|영업|메뉴|거리|현재 영업|리뷰|가격/)[0]).slice(0, 60);
      if (!name || blockedNames.has(name) || seenNames.has(name)) continue;

      seenPlaceIds.add(placeId);
      seenNames.add(name);

      const rating = t.match(/(?:별점\s*)?([0-5]\.[0-9])/i)?.[1];
      const visitor = t.match(/방문자 리뷰\s*([0-9,]+)/)?.[1];
      const blog = t.match(/블로그 리뷰\s*([0-9,]+)/)?.[1];
      const distance = t.match(/([0-9.]+\s*(?:m|km))/i)?.[1];

      items.push({ name, rating, reviews: visitor ? `방문자 리뷰 ${visitor}` : blog ? `블로그 리뷰 ${blog}` : undefined, distance, href: x.href });
      if (items.length >= 10) break;
    }

    if (!items.length) return NextResponse.json({ error: '네이버 지도에서 식당 상세 링크를 찾지 못했습니다.' }, { status: 502 });
    return NextResponse.json({ latitude, longitude, items });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? `검색 실패: ${e.message}` : '검색 중 오류가 발생했습니다.' }, { status: 500 });
  } finally {
    await browser?.close().catch(() => {});
  }
}
