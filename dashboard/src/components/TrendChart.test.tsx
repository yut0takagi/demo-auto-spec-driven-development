import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrendChart } from './TrendChart';
import type { TrendPoint } from '@/lib/aggregate';

describe('TrendChart', () => {
  it('複数の点があれば折れ線を描画し、最新値を単位付きで表示する', () => {
    const points: TrendPoint[] = [
      { iteration: 1, value: 10 },
      { iteration: 2, value: 40 },
      { iteration: 3, value: 25 },
    ];
    const { container } = render(<TrendChart title="カバレッジ" points={points} unit="%" />);
    expect(screen.getByText('カバレッジ')).toBeInTheDocument();
    expect(screen.getByText(/25\.0/)).toBeInTheDocument();
    const path = container.querySelector('path');
    expect(path).not.toBeNull();
    // 3点あるので M(始点) + L が2つ、線として意味のある形になっているはず
    expect(path?.getAttribute('d')).toMatch(/^M.+L.+L/);
  });

  it('データが空なら「データなし」と表示し、svg を描画しない', () => {
    const { container } = render(<TrendChart title="カバレッジ" points={[]} unit="%" />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });

  // points.length - 1 === 0 で stepX の除算がゼロ除算になりうる箇所。
  // ガード済みでも「線が1点だけで実質見えない」問題が残っていたため、
  // 単一点のときは目印となる circle を描画するよう修正した（デビエーション）。
  it('データ点が1つだけでもクラッシュせず、値と目印を表示する', () => {
    const points: TrendPoint[] = [{ iteration: 5, value: 55 }];
    let container!: HTMLElement;
    expect(() => {
      ({ container } = render(<TrendChart title="コスト" points={points} unit="$" />));
    }).not.toThrow();
    expect(screen.getByText(/55\.0/)).toBeInTheDocument();
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // NaN が座標に紛れ込んでいないことを保証する
    expect(svg?.innerHTML).not.toMatch(/NaN/);
    expect(container.querySelector('circle')).not.toBeNull();
  });
});
