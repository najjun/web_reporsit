'use client';

import { useState } from 'react';

type Restaurant = { name: string; category?: string; rating?: string; reviews?: string; address?: string; distance?: string; href?: string; };

export default function Home() {
  const [status, setStatus] = useState('버튼을 누르면 현재 위치 주변을 검색합니다.');
  const [items, setItems] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);

  async function findRestaurants() {
    if (!navigator.geolocation) { setStatus('이 브라우저는 위치 기능을 지원하지 않습니다.'); return; }
    setLoading(true); setItems([]); setStatus('현재 위치를 확인하는 중…');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude, accuracy } = pos.coords;
        setStatus(`위치 확인 완료 (오차 약 ${Math.round(accuracy)}m). 네이버 지도 검색 중…`);
        const res = await fetch('/api/restaurants', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ latitude, longitude }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '검색에 실패했습니다.');
        setItems(data.items || []); setStatus(`${data.items?.length ?? 0}곳을 찾았습니다.`);
      } catch (e) { setStatus(e instanceof Error ? e.message : '검색 중 오류가 발생했습니다.'); }
      finally { setLoading(false); }
    }, (err) => { setLoading(false); setStatus(err.code === 1 ? '위치 권한이 거부되었습니다. Safari 설정에서 위치 권한을 허용해주세요.' : '현재 위치를 가져오지 못했습니다.'); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }

  return <main className="wrap"><section className="hero"><div className="badge">NAVER MAP · PLAYWRIGHT</div><h1>내 주변 맛집 10곳</h1><p>아이폰의 현재 위치를 사용해 서버가 네이버 지도를 직접 검색합니다.</p><button onClick={findRestaurants} disabled={loading}>{loading ? '검색 중…' : '현재 위치로 맛집 찾기'}</button><div className="status">{status}</div></section><section className="list">{items.map((r, i) => <a className="card" href={r.href || '#'} target="_blank" rel="noreferrer" key={`${r.name}-${i}`}><div className="rank">{i + 1}</div><div className="content"><div className="top"><strong>{r.name}</strong>{r.distance && <span>{r.distance}</span>}</div><div className="meta">{[r.category, r.rating && `★ ${r.rating}`, r.reviews].filter(Boolean).join(' · ')}</div>{r.address && <div className="addr">{r.address}</div>}</div></a>)}</section><footer>검색 결과는 네이버 지도 화면 구조 변경이나 자동화 차단에 따라 달라질 수 있습니다.</footer></main>;
}
