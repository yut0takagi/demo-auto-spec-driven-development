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

function curveRuns(small: number, medium: number, large: number): RunRecord[] {
  return [...sizeRuns(1, 3, small, 10), ...sizeRuns(4, 3, medium, 200), ...sizeRuns(7, 3, large, 400)];
}

describe('RevisionSizeCurvePanel', () => {
  it.each([
    ['run が0件', [] as RunRecord[]],
    ['failed run のみ（changedLines sentinel 0）', [makeRun({ iteration: 1, verdict: 'failed', reviseCycles: 5, changedLines: 0 })]],
  ])('%sなら「データなし」を表示し、パネル本体を描画しない', (_label, runs) => {
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

  it.each([
    ['convex', 0, 1, 4, '加速（非線形に悪化）'],
    ['concave', 0, 3, 4, '減速（伸びは頭打ち）'],
    ['linear', 0, 1, 2, 'ほぼ比例'],
  ] as const)('%sカーブのとき正しいラベル「%s」を表示する', (_shape, small, medium, large, label) => {
    const { container } = render(<RevisionSizeCurvePanel runs={curveRuns(small, medium, large)} />);
    expect(container.querySelector('[data-testid="revision-size-curve-shape"]')?.textContent).toBe(label);
  });

  it('convexカーブで傾きの数値・区分統計・バー幅（最大区分=100%, 最小区分=0%）を表示する', () => {
    const { container } = render(<RevisionSizeCurvePanel runs={curveRuns(0, 1, 4)} />);

    const deltas = container.querySelector('[data-testid="revision-size-curve-deltas"]')?.textContent ?? '';
    expect(deltas).toContain('小→中 +1.00回');
    expect(deltas).toContain('中→大 +3.00回');
    expect(deltas).toContain('傾き差 +2.00回');

    const smallStats = container.querySelector('[data-testid="revision-size-curve-stats-small"]')?.textContent ?? '';
    expect(smallStats).toContain('平均revise 0.00回');
    expect(smallStats).toContain('3件');
    expect(smallStats).toContain('平均10行');

    const largeBar = container.querySelector('[data-testid="revision-size-curve-bar-large"]') as HTMLElement;
    const smallBar = container.querySelector('[data-testid="revision-size-curve-bar-small"]') as HTMLElement;
    expect(parseFloat(largeBar.style.width)).toBeCloseTo(100, 2);
    expect(parseFloat(smallBar.style.width)).toBeCloseTo(0, 2);
  });
});
