import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviseCyclesChart } from './ReviseCyclesChart';
import type { RunRecord } from '@/lib/types';

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: '20260720T000000Z-1',
    iteration: 1,
    issue: { number: 1, title: 't', labels: [] },
    branch: 'loop/1-x',
    startedAt: '2026-07-20T00:00:00Z',
    finishedAt: '2026-07-20T00:05:00Z',
    durationSec: 300,
    reviseCycles: 0,
    verdict: 'merged',
    gateReasons: [],
    prNumber: 11,
    adversary: { approved: true, summary: '' },
    verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 },
    changedLines: 10,
    cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.01, totalUsd: 0.12 },
    models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
    nextIssues: [],
    ...overrides,
  };
}

describe('ReviseCyclesChart', () => {
  it('データが空なら「データなし」を表示し、svg を描画しない', () => {
    const { container } = render(<ReviseCyclesChart runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('中央値をヘッダに表示する', () => {
    const runs = [
      makeRun({ iteration: 1, reviseCycles: 0 }),
      makeRun({ iteration: 2, reviseCycles: 4 }),
    ];
    render(<ReviseCyclesChart runs={runs} />);
    // [0, 4] の中央値は 2
    expect(screen.getByText('中央値 2.0回')).toBeInTheDocument();
  });

  it('外れ値(>3回)が無ければ「外れ値なし」のメッセージを出し、バーは全て通常色になる', () => {
    const runs = [
      makeRun({ iteration: 1, reviseCycles: 1 }),
      makeRun({ iteration: 2, reviseCycles: 3 }),
    ];
    const { container } = render(<ReviseCyclesChart runs={runs} />);
    expect(screen.getByText(/外れ値（>3回）なし/)).toBeInTheDocument();
    expect(container.querySelector('.fill-rose-400')).toBeNull();
    expect(container.querySelectorAll('.fill-sky-400')).toHaveLength(2);
  });

  it('外れ値(>3回)を rose 色のバーで強調し、iteration 番号と回数をテキストで明示する', () => {
    const runs = [
      makeRun({ iteration: 1, reviseCycles: 1 }),
      makeRun({ iteration: 2, reviseCycles: 5 }),
    ];
    const { container } = render(<ReviseCyclesChart runs={runs} />);
    expect(screen.getByText(/iteration 2 \(5回\)/)).toBeInTheDocument();
    // 外れ値バーだけ rose、通常バーは sky と色が分かれていること
    expect(container.querySelectorAll('.fill-rose-400')).toHaveLength(1);
    expect(container.querySelectorAll('.fill-sky-400')).toHaveLength(1);
    const outlierBar = container.querySelector('[data-testid="revise-bar-2"]');
    expect(outlierBar).toHaveClass('fill-rose-400');
    const normalBar = container.querySelector('[data-testid="revise-bar-1"]');
    expect(normalBar).toHaveClass('fill-sky-400');
  });

  it('閾値(3)ちょうどは外れ値として扱わない境界値', () => {
    const runs = [makeRun({ iteration: 1, reviseCycles: 3 })];
    render(<ReviseCyclesChart runs={runs} />);
    expect(screen.getByText(/外れ値（>3回）なし/)).toBeInTheDocument();
  });

  it('failed run は revise 回数が極端でも母集団・外れ値から除外する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 1 }),
      makeRun({ iteration: 2, verdict: 'failed', reviseCycles: 99 }),
    ];
    const { container } = render(<ReviseCyclesChart runs={runs} />);
    expect(screen.getByText(/外れ値（>3回）なし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="revise-bar-2"]')).toBeNull();
  });

  it('failed run を除外した母集団で中央値を計算する（UI表示レベルでの検証）', () => {
    // failed の reviseCycles=99 が母集団に混ざると中央値が大きく引きずられるはずだが、
    // reachedVerify で除外されるので merged の [2, 4] だけで中央値 3.0 になる。
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 2 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 4 }),
      makeRun({ iteration: 3, verdict: 'failed', reviseCycles: 99 }),
    ];
    const { container } = render(<ReviseCyclesChart runs={runs} />);
    expect(screen.getByText('中央値 3.0回')).toBeInTheDocument();
    // failed run 自体のバーも描画されない
    expect(container.querySelector('[data-testid="revise-bar-3"]')).toBeNull();
    expect(container.querySelectorAll('rect[data-testid^="revise-bar-"]')).toHaveLength(2);
  });

  it('すべての run が failed の場合、resultTrend が空になり「データなし」を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed', reviseCycles: 5 }),
      makeRun({ iteration: 2, verdict: 'failed', reviseCycles: 2 }),
    ];
    const { container } = render(<ReviseCyclesChart runs={runs} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('svg rect と中央値/閾値ラインの座標がグラフ内の相対的な位置関係として正しく計算される', () => {
    // ピクセルの magic number をハードコードすると width/height/pad 等の内部定数が
    // 変わるだけでテストが壊れる（数値精度にも脆弱）。ここでは形状定数に依存しない
    // 「関係性」だけを検証する。
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 3 }),
    ];
    const { container } = render(<ReviseCyclesChart runs={runs} />);

    const bar1 = container.querySelector('[data-testid="revise-bar-1"]')!; // value 0
    const bar2 = container.querySelector('[data-testid="revise-bar-2"]')!; // value 3 (= maxValue)
    const y1 = Number(bar1.getAttribute('y'));
    const y2 = Number(bar2.getAttribute('y'));
    const h1 = Number(bar1.getAttribute('height'));
    const h2 = Number(bar2.getAttribute('height'));

    // value=0 のバーは高さ0。value=maxValue のバーはそれより高く、上にある
    expect(h1).toBeCloseTo(0, 5);
    expect(y1).toBeGreaterThan(y2);
    expect(h2).toBeGreaterThan(h1);
    expect(y1 + h1).toBeCloseTo(y2 + h2, 5); // 両バーの下端(ベースライン)は揃っている

    // 中央値 [0, 3] → 1.5 は 0 と 3 のちょうど中間なので、中央値ラインも2本のバー上端の中間に位置する
    const medianLine = container.querySelector('[data-testid="median-line"]')!;
    expect(medianLine.getAttribute('y1')).toBe(medianLine.getAttribute('y2'));
    expect(Number(medianLine.getAttribute('y1'))).toBeCloseTo((y1 + y2) / 2, 5);

    // 閾値ラインは REVISE_CYCLES_OUTLIER_THRESHOLD(=maxValue) の高さなので value=3 のバー上端と一致する
    const thresholdLine = container.querySelector('[data-testid="threshold-line"]')!;
    expect(Number(thresholdLine.getAttribute('y1'))).toBeCloseTo(y2, 5);
  });
});
