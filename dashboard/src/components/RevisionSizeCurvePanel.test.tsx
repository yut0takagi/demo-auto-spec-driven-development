import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevisionSizeCurvePanel } from './RevisionSizeCurvePanel';
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

function sizeRuns(startIter: number, count: number, reviseCycles: number, changedLines: number): RunRecord[] {
  return Array.from({ length: count }, (_, i) =>
    makeRun({ iteration: startIter + i, verdict: 'merged', reviseCycles, changedLines }),
  );
}

describe('RevisionSizeCurvePanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<RevisionSizeCurvePanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="revision-size-curve-panel"]')).toBeNull();
  });

  it('failed run しか無ければ「データなし」を表示する（changedLinesが測定されなかったsentinel 0のため）', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'failed', reviseCycles: 5, changedLines: 0 })];
    const { container } = render(<RevisionSizeCurvePanel runs={runs} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="revision-size-curve-panel"]')).toBeNull();
  });

  it('区分のサンプル数が不足している場合は「データ不足」を表示し、傾きの数値は出さない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0, changedLines: 10 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 1, changedLines: 200 }),
    ];
    const { container } = render(<RevisionSizeCurvePanel runs={runs} />);
    expect(container.querySelector('[data-testid="revision-size-curve-shape"]')?.textContent).toBe('データ不足');
    expect(container.querySelector('[data-testid="revision-size-curve-deltas"]')).toBeNull();
    // small/mediumの行は描画されるがlargeは出現しないので描画されない
    expect(container.querySelector('[data-testid="revision-size-curve-row-small"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="revision-size-curve-row-large"]')).toBeNull();
  });

  it('加速カーブ(convex)のとき「加速（非線形に悪化）」と傾きの数値を表示する', () => {
    const runs = [
      ...sizeRuns(1, 3, 0, 10),
      ...sizeRuns(4, 3, 1, 200),
      ...sizeRuns(7, 3, 4, 400),
    ];
    const { container } = render(<RevisionSizeCurvePanel runs={runs} />);
    expect(container.querySelector('[data-testid="revision-size-curve-shape"]')?.textContent).toBe(
      '加速（非線形に悪化）',
    );
    const deltas = container.querySelector('[data-testid="revision-size-curve-deltas"]')?.textContent ?? '';
    expect(deltas).toContain('小→中 +1.00回');
    expect(deltas).toContain('中→大 +3.00回');
    expect(deltas).toContain('傾き差 +2.00回');

    const smallStats = container.querySelector('[data-testid="revision-size-curve-stats-small"]')?.textContent ?? '';
    expect(smallStats).toContain('平均revise 0.00回');
    expect(smallStats).toContain('3件');
    expect(smallStats).toContain('平均10行');
  });

  it('減速カーブ(concave)のとき「減速（伸びは頭打ち）」を表示する', () => {
    const runs = [
      ...sizeRuns(1, 3, 0, 10),
      ...sizeRuns(4, 3, 3, 200),
      ...sizeRuns(7, 3, 4, 400),
    ];
    const { container } = render(<RevisionSizeCurvePanel runs={runs} />);
    expect(container.querySelector('[data-testid="revision-size-curve-shape"]')?.textContent).toBe(
      '減速（伸びは頭打ち）',
    );
    const deltas = container.querySelector('[data-testid="revision-size-curve-deltas"]')?.textContent ?? '';
    expect(deltas).toContain('傾き差 -2.00回');
  });

  it('比例カーブ(linear)のとき「ほぼ比例」を表示する', () => {
    const runs = [
      ...sizeRuns(1, 3, 0, 10),
      ...sizeRuns(4, 3, 1, 200),
      ...sizeRuns(7, 3, 2, 400),
    ];
    const { container } = render(<RevisionSizeCurvePanel runs={runs} />);
    expect(container.querySelector('[data-testid="revision-size-curve-shape"]')?.textContent).toBe('ほぼ比例');
  });

  it('最も平均revise回数が大きい区分のバーが100%幅になる', () => {
    const runs = [
      ...sizeRuns(1, 3, 0, 10),
      ...sizeRuns(4, 3, 1, 200),
      ...sizeRuns(7, 3, 4, 400),
    ];
    const { container } = render(<RevisionSizeCurvePanel runs={runs} />);
    const largeBar = container.querySelector('[data-testid="revision-size-curve-bar-large"]') as HTMLElement;
    const smallBar = container.querySelector('[data-testid="revision-size-curve-bar-small"]') as HTMLElement;
    expect(parseFloat(largeBar.style.width)).toBeCloseTo(100, 2);
    expect(parseFloat(smallBar.style.width)).toBeCloseTo(0, 2);
  });
});
