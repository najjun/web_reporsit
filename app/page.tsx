'use client';

import { useRef, useState } from 'react';

type Restaurant = { name: string; category?: string; rating?: string; reviews?: string; address?: string; distance?: string; href?: string; };

export default function Home() {
  const [status, setStatus] = useState('버튼을 누르면 현재 위치 주변을 검색합니다.');
  const [items, setItems] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);
  const runningRef = useRef(false);

  async function findRestaurants() {
    if (runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    setItems([]);
    setStatus('버튼 입력 확인됨. 현재 위치를 요청하는 중…');

    if (!('geolocation' in navigator)) {
      setStatus('이 브라우저는 위치 기능을 지원하지 않습니다. Safari에서 다시 열어주세요.');
      setLoading(false);
      runningRef.current = false;
      return;
    }

    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude, accuracy } = pos.coords;
        setStatus(`위치 확인 완료 (오차 약 ${Math.round(accuracy)}m). 네이버 지도 검색 중…`);
        const res = await fetch('/api/restaurants', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ latitude, longitude }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '검색에 실패했습니다.');
        setItems(data.items || []);
        setStatus(`${data.items?.length ?? 0}곳을 찾았습니다.`);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : '검색 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
        runningRef.current = false;
      }
    }, (err) => {
      setLoading(false);
      runningRef.current = false;
      if (err.code === 1) setStatus('위치 권한이 거부되었습니다. 설정 > Safari > 위치에서 허용해주세요.');
      else if (err.code === 2) setStatus('현재 위치를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.');
      else setStatus('위치 확인 시간이 초과되었습니다. 다시 눌러주세요.');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 });
  }

  return <main className="wrap">
    <section className="hero">
      <div className="badge">NAVER MAP · PLAYWRIGHT</div>
      <h1>내 주변 맛집 10곳</h1>
      <p>아이폰의 현재 위치를 사용해 서버가 네이버 지도를 직접 검색합니다.</p>
      <button
        type="button"
        onPointerDown={() => { if (!loading) setStatus('터치 입력 감지됨…'); }}
        onClick={findRestaurants}
        disabled={loading}
        style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
      >{loading ? '검색 중…' : '현재 위치로 맛집 찾기'}</button>
      <div className="status" aria-live="polite">{status}</div>
    </section>
    <section className="list">{items.map((r, i) => <a className="card" href={r.href || '#'} target="_blank" rel="noreferrer" key={`${r.name}-${i}`}><div className="rank">{i + 1}</div><div className="content"><div className="top"><strong>{r.name}</strong>{r.distance && <span>{r.distance}</span>}</div><div className="meta">{[r.category, r.rating && `★ ${r.rating}`, r.reviews].filter(Boolean).join(' · ')}</div>{r.address && <div className="addr">{r.address}</div>}</div></a>)}</section>
    <footer>검색 결과는 네이버 지도 화면 구조 변경이나 자동화 차단에 따라 달라질 수 있습니다.</footer>
  </main>;
}
