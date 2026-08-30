import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: '내 주변 네이버 맛집',
  description: '현재 위치 기준 네이버 지도 맛집 10곳 찾기',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
