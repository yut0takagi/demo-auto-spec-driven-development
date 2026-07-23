import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuilderComparisonCard } from './BuilderComparisonCard';
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

describe('BuilderComparisonCard', () => {
  it('run が0件なら「データなし」を表示し、比較テーブルを描画しない', () => {
    const { container } = render(<BuilderComparisonCard runs={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="builder-comparison"]')).toBeNull();
  });

  it('測定済み run が1件だけなら「データなし」を表示する（比較対象が無い境界値）', () => {
    const runs = [makeRun({ iteration: 1 })];
    const { container } = render(<BuilderComparisonCard runs={runs} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="builder-comparison"]')).toBeNull();
  });

  it('改善した指標は緑系スタイルで「改善」ラベルを表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        reviseCycles: 2,
        changedLines: 429,
        verify: { unitPassed: true, e2ePassed: true, coveragePct: 70 },
        cost: { builderUsd: 6.9, adversaryUsd: 0, ideationUsd: 0, totalUsd: 6.9 },
      }),
      makeRun({
        iteration: 2,
        reviseCycles: 1,
        changedLines: 59,
        verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 },
        cost: { builderUsd: 3.4, adversaryUsd: 0, ideationUsd: 0, totalUsd: 3.4 },
      }),
    ];
    const { container } = render(<BuilderComparisonCard runs={runs} />);

    const panel = container.querySelector('[data-testid="builder-comparison"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('iteration 1 → 2');

    const reviseVerdict = container.querySelector('[data-testid="builder-metric-verdict-reviseCycles"]');
    expect(reviseVerdict?.textContent).toContain('改善');
    expect(reviseVerdict?.textContent).toContain('-1回');
    expect(reviseVerdict?.className).toContain('text-emerald-400');

    const changedLinesRow = container.querySelector('[data-testid="builder-metric-changedLines"]');
    expect(changedLinesRow?.textContent).toContain('429行 → 59行');

    const coverageVerdict = container.querySelector('[data-testid="builder-metric-verdict-coveragePct"]');
    expect(coverageVerdict?.textContent).toContain('+10.0pt');
    expect(coverageVerdict?.textContent).toContain('改善');

    // 4項目すべて改善したことをサマリー文で確認
    expect(panel?.textContent).toContain('4項目中 4項目が改善');
  });

  it('悪化した指標は赤系スタイルで「悪化」ラベルを、変化が無い指標は「変化なし」を表示する', () => {
    const runs = [
      makeRun({
        iteration: 5,
        reviseCycles: 0,
        changedLines: 50,
        verify: { unitPassed: true, e2ePassed: true, coveragePct: 90 },
        cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 },
      }),
      makeRun({
        iteration: 6,
        reviseCycles: 3,
        changedLines: 50,
        verify: { unitPassed: true, e2ePassed: true, coveragePct: 60 },
        cost: { builderUsd: 2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 2 },
      }),
    ];
    const { container } = render(<BuilderComparisonCard runs={runs} />);

    const reviseVerdict = container.querySelector('[data-testid="builder-metric-verdict-reviseCycles"]');
    expect(reviseVerdict?.textContent).toContain('悪化');
    expect(reviseVerdict?.textContent).toContain('+3回');
    expect(reviseVerdict?.className).toContain('text-rose-400');

    const changedLinesVerdict = container.querySelector('[data-testid="builder-metric-verdict-changedLines"]');
    expect(changedLinesVerdict?.textContent).toContain('変化なし');
    expect(changedLinesVerdict?.className).toContain('text-white/50');
  });

  it('failed run（sentinel 0）は比較の母集団から除外し、測定済みの直近2件だけを比較する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 5, changedLines: 200 }),
      makeRun({
        iteration: 2,
        verdict: 'failed',
        reviseCycles: 9,
        changedLines: 0,
        verify: { unitPassed: false, e2ePassed: false, coveragePct: 0 },
      }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 1, changedLines: 20 }),
    ];
    const { container } = render(<BuilderComparisonCard runs={runs} />);
    const panel = container.querySelector('[data-testid="builder-comparison"]');
    // failed(iteration 2) を挟んでも比較対象は 1 → 3（2ではない）
    expect(panel?.textContent).toContain('iteration 1 → 3');

    const changedLinesValue = container.querySelector('[data-testid="builder-metric-value-changedLines"]');
    // failed(iteration 2) の sentinel changedLines=0 が previous/current のどちらにも
    // 混入していないことを、部分一致ではなく完全一致で確認する（"200行" のような
    // 末尾0を含む値だと "0行 →" の部分一致では誤検知するため）。
    expect(changedLinesValue?.textContent).toBe('200行 → 20行');
  });
});
