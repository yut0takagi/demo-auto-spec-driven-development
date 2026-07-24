import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IdeationFailurePanel } from './IdeationFailurePanel';
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
    cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: 0.11 },
    models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
    nextIssues: [],
    ...overrides,
  };
}

describe('IdeationFailurePanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<IdeationFailurePanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-failure-panel"]')).toBeNull();
  });

  it('ideationが1件も実行されていなければ（全run ideationUsd=0）「データなし」のまま（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: 0.11 } }),
      makeRun({ iteration: 2, cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: 0.11 } }),
    ];
    const { container } = render(<IdeationFailurePanel runs={runs} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-failure-panel"]')).toBeNull();
  });

  it('実行件数・失敗件数・失敗率を正確な値で表示する（部分一致に頼らない）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.05, totalUsd: 0.16 },
        nextIssues: [10],
      }),
      makeRun({
        iteration: 2,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.08, totalUsd: 0.19 },
        nextIssues: [],
      }),
      makeRun({
        iteration: 3,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: 0.11 },
        nextIssues: [],
      }),
      makeRun({
        iteration: 4,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.02, totalUsd: 0.13 },
        nextIssues: [],
      }),
    ];
    const { container } = render(<IdeationFailurePanel runs={runs} />);

    // ideation実行3件(iteration 1,2,4)中2件(2,4)が失敗 → 66.7%
    expect(container.querySelector('[data-testid="ideation-failure-attempted"]')?.textContent).toBe(
      '実行 3件中 2件が提案0件',
    );
    expect(container.querySelector('[data-testid="ideation-failure-value"]')?.textContent).toBe('66.7%');
    expect(container.querySelector('[data-testid="ideation-failure-iterations"]')?.textContent).toContain(
      '対象iteration: 2, 4',
    );

    const bar = container.querySelector('[data-testid="ideation-failure-bar"]') as HTMLElement;
    expect(parseFloat(bar.style.width)).toBeCloseTo(66.67, 1);
  });

  it('実行した反復が全て成功していれば失敗率0%で対象iteration注記は出ない（境界値）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.05, totalUsd: 0.16 },
        nextIssues: [2],
      }),
    ];
    const { container } = render(<IdeationFailurePanel runs={runs} />);
    expect(container.querySelector('[data-testid="ideation-failure-value"]')?.textContent).toBe('0.0%');
    expect(container.querySelector('[data-testid="ideation-failure-iterations"]')).toBeNull();

    // 失敗率0%の点は height:0% になり、E2E の toBeVisible() がゼロサイズ要素を
    // 「非表示」と判定して落ちる（実際に起きた回帰）。高さ0でも見える最小サイズを
    // 保証していること。
    const bar = container.querySelector('[data-testid="ideation-failure-trend-bar-1"]') as HTMLElement;
    expect(bar.style.height).toBe('0%');
    expect(bar.style.minHeight).toBe('2px');
  });

  it('推移バーがideationFailureRateTrendの点数・iterationと一致する（ideationUsd=0の反復は含まない）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.05, totalUsd: 0.16 },
        nextIssues: [2],
      }),
      makeRun({
        iteration: 2,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: 0.11 },
        nextIssues: [],
      }),
      makeRun({
        iteration: 3,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.08, totalUsd: 0.19 },
        nextIssues: [],
      }),
    ];
    const { container } = render(<IdeationFailurePanel runs={runs} />);
    const bars = container.querySelectorAll('[data-testid^="ideation-failure-trend-bar-"]');
    expect(bars).toHaveLength(2);
    expect(container.querySelector('[data-testid="ideation-failure-trend-bar-2"]')).toBeNull();
    expect(container.querySelector('[data-testid="ideation-failure-trend-bar-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ideation-failure-trend-bar-3"]')).not.toBeNull();
  });
});
