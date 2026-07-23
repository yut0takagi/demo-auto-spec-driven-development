import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviseVerdictMatrixPanel } from './ReviseVerdictMatrixPanel';
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

describe('ReviseVerdictMatrixPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<ReviseVerdictMatrixPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="revise-verdict-matrix-panel"]')).toBeNull();
  });

  it('reviseCyclesが実際に出現した区分だけを 0→1→2→3+ の順で表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 5 }),
    ];
    const { container } = render(<ReviseVerdictMatrixPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="revise-verdict-matrix-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'revise-verdict-matrix-row-0',
      'revise-verdict-matrix-row-3+',
    ]);
    expect(container.querySelector('[data-testid="revise-verdict-matrix-panel"]')?.textContent).toContain('2区分');
  });

  it('区分内のverdict別件数どおりに帯セグメントの幅が按分される（部分一致に頼らず実際の割合を検証）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 2 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 2 }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 2 }),
      makeRun({ iteration: 4, verdict: 'abandoned', reviseCycles: 2 }),
    ];
    const { container } = render(<ReviseVerdictMatrixPanel runs={runs} />);
    const mergedSeg = container.querySelector(
      '[data-testid="revise-verdict-matrix-seg-2-merged"]',
    ) as HTMLElement;
    const abandonedSeg = container.querySelector(
      '[data-testid="revise-verdict-matrix-seg-2-abandoned"]',
    ) as HTMLElement;
    // 4件中 merged=3件(75%), abandoned=1件(25%)
    expect(parseFloat(mergedSeg.style.width)).toBeCloseTo(75, 2);
    expect(parseFloat(abandonedSeg.style.width)).toBeCloseTo(25, 2);

    // 出現しないverdict(failed等)のセグメントは描画されない
    expect(container.querySelector('[data-testid="revise-verdict-matrix-seg-2-failed"]')).toBeNull();
  });

  it('reviseCyclesByVerdictPanel と同様 failed run を除外せず区分に含める', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'failed', reviseCycles: 0 })];
    const { container } = render(<ReviseVerdictMatrixPanel runs={runs} />);
    const failedSeg = container.querySelector('[data-testid="revise-verdict-matrix-seg-0-failed"]') as HTMLElement;
    expect(failedSeg).not.toBeNull();
    expect(parseFloat(failedSeg.style.width)).toBeCloseTo(100, 2);

    const mergedPct = container.querySelector('[data-testid="revise-verdict-matrix-merged-pct-0"]');
    expect(mergedPct?.textContent).toBe('merged 0% (1件)');
  });

  it('merged到達率(%)を区分ごとの実件数から正確に算出する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 1 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 1 }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 1 }),
      makeRun({ iteration: 4, verdict: 'abandoned', reviseCycles: 1 }),
    ];
    const { container } = render(<ReviseVerdictMatrixPanel runs={runs} />);
    const mergedPct = container.querySelector('[data-testid="revise-verdict-matrix-merged-pct-1"]');
    // 4件中 merged=3件 => 75%
    expect(mergedPct?.textContent).toBe('merged 75% (4件)');
  });

  it('対象iterationを区分ごとに昇順で表示する', () => {
    const runs = [
      makeRun({ iteration: 5, verdict: 'merged', reviseCycles: 3 }),
      makeRun({ iteration: 2, verdict: 'abandoned', reviseCycles: 3 }),
    ];
    const { container } = render(<ReviseVerdictMatrixPanel runs={runs} />);
    const row = container.querySelector('[data-testid="revise-verdict-matrix-row-3+"]');
    expect(row?.textContent).toContain('対象iteration: 2, 5');
  });
});
