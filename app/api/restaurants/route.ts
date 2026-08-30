import { NextRequest, NextResponse } from 'next/server';
import { chromium as playwrightChromium } from 'playwright-core';
import chromium from '@sparticuz/chromium';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Restaurant = { name: string; category?: string; rating?: string; reviews?: string; address?: string; distance?: string; href?: string; };
type Candidate = Restaurant & { visitorCount: number; blogCount: number; score: number; sourceIndex: number; };
function clean(s?: string | null) { return (s || '').replace(/\s+/g, ' ').trim(); }
function n(s?: string) { return s ? Number(s.replace(/,/g, '')) || 0 : 0; }

async function waitForPlaceLinks(page: any) {
  await page.waitForFunction(() => {
    const links = Array.from(document.querySelectorAll('a')) as HTMLAnchorElement[];
    return links.some((a) => /(?:restaurant|place)\/\d+|entry\/place\/\d+/i.test(a.href || ''));
  }, { timeout: 2200 }).catch(() => {});
}

function placeIdFromHref(href: string) {
  return href.match(/(?:restaurant|place)\/(\d+)/i)?.[1] || href.match(/entry\/place\/(\d+)/i)?.[1] || href;
}

function rankScore(sourceIndex: number, rating: number, visitor: number, blog: number) {
  let score = 100 - sourceIndex * 1.5;
  if (rating > 0) score += rating * 3;
  if (visitor > 0) score += Math.min(35, Math.log10(visitor + 1) * 12);

  // 블로그 리뷰가 실제 방문자 리뷰보다 비정상적으로 많은 경우 광고성 가능성 감점
  if (blog > 0 && visitor === 0) score -= Math.min(35, 10 + Math.log10(blog + 1) * 8);
  if (visitor > 0) {
    const ratio = blog / visitor;
    if (blog >= 30 && ratio >= 2) score -= 12;
    if (blog >= 50 && ratio >= 4) score -= 20;
    if (blog >= 100 && ratio >= 8) score -= 28;
  }
  return score;
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
    const candidates: Candidate[] = [];

    for (let i = 0; i < raw.length; i++) {
      const x = raw[i];
      const placeId = placeIdFromHref(x.href);
      if (seenPlaceIds.has(placeId)) continue;

      const t = clean(x.text);
      if (!t || t.length > 260) continue;
      const name = clean(t.split(/별점|방문자 리뷰|블로그 리뷰|영업|메뉴|거리|현재 영업|리뷰|가격/)[0]).slice(0, 60);
      if (!name || blockedNames.has(name) || seenNames.has(name)) continue;

      const ratingText = t.match(/(?:별점\s*)?([0-5]\.[0-9])/i)?.[1];
      const visitorText = t.match(/방문자 리뷰\s*([0-9,]+)/)?.[1];
      const blogText = t.match(/블로그 리뷰\s*([0-9,]+)/)?.[1];
      const distance = t.match(/([0-9.]+\s*(?:m|km))/i)?.[1];
      const ratingNum = ratingText ? Number(ratingText) : 0;
      const visitorCount = n(visitorText);
      const blogCount = n(blogText);

      seenPlaceIds.add(placeId);
      seenNames.add(name);
      candidates.push({
        name,
        rating: ratingText,
        reviews: visitorText ? `방문자 리뷰 ${visitorText}` : blogText ? `블로그 리뷰 ${blogText}` : undefined,
        distance,
        href: x.href,
        visitorCount,
        blogCount,
        sourceIndex: i,
        score: rankScore(i, ratingNum, visitorCount, blogCount),
      });
      if (candidates.length >= 30) break;
    }

    const items: Restaurant[] = candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ visitorCount, blogCount, score, sourceIndex, ...item }) => item);

    if (!items.length) return NextResponse.json({ error: '네이버 지도에서 식당 상세 링크를 찾지 못했습니다.' }, { status: 502 });
    return NextResponse.json({ latitude, longitude, items });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? `검색 실패: ${e.message}` : '검색 중 오류가 발생했습니다.' }, { status: 500 });
  } finally {
    await browser?.close().catch(() => {});
  }
}
