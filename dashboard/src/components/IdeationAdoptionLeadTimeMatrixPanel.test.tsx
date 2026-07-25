import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IdeationAdoptionLeadTimeMatrixPanel } from './IdeationAdoptionLeadTimeMatrixPanel';
import type { RunRecord } from '@/lib/types';

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: '20260720T000000Z-1',
    iteration: 1,
    issue: { number: 1, title: 't', labels: [] },
    branch: 'loop/1-x',
    startedAt: '2026-07-20T00:00:00Z',
    finishedAt: '2026-07-20T00:00:00Z',
    durationSec: 300,
    reviseCycles: 0,
    verdict: 'merged',
    gateReasons: [],
    prNumber: 11,
    adversary: { approved: true, summary: '' },
    verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 },
    changedLines: 10,
    cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.1, totalUsd: 0.21 },
    models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
    nextIssues: [],
    ...overrides,
  };
}

// 提案(iteration)と、そのnextIssuesのうちmergedへ到達した1件(leadTimeSec後)を返す
function proposerAndMergedChild(iteration: number, proposerNo: number, childNos: number[], mergedNo: number, leadTimeSec: number): RunRecord[] {
  return [
    makeRun({ iteration, issue: { number: proposerNo, title: 'p', labels: [] }, nextIssues: childNos, finishedAt: '2026-07-20T00:00:00Z' }),
    makeRun({
      iteration: iteration + 100,
      issue: { number: mergedNo, title: 'c', labels: [] },
      verdict: 'merged',
      finishedAt: new Date(new Date('2026-07-20T00:00:00Z').getTime() + leadTimeSec * 1000).toISOString(),
    }),
  ];
}

describe('IdeationAdoptionLeadTimeMatrixPanel', () => {
  it('runsが0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<IdeationAdoptionLeadTimeMatrixPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-adoption-lead-time-matrix-panel"]')).toBeNull();
  });

  it('全batchでmerged到達が0件のときも「データなし」を表示し、除外件数をフッターに表示する', () => {
    const runs = [makeRun({ iteration: 1, issue: { number: 1, title: 'a', labels: [] }, nextIssues: [100] })];
    const { container } = render(<IdeationAdoptionLeadTimeMatrixPanel runs={runs} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-adoption-lead-time-excluded"]')?.textContent).toContain('1batch');
  });

  it('行/列の固定順・セルの数値・空セル・除外件数フッターをまとめて検証する', () => {
    // 1件提案・1件merged(採用率100%=high、120秒=1バッチのみなのでfast)と、
    // merged到達0件で除外されるbatchを1件混在させる。
    const runs = [
      ...proposerAndMergedChild(1, 9001, [10], 10, 120),
      makeRun({ iteration: 200, issue: { number: 9002, title: 'zero', labels: [] }, nextIssues: [300] }),
    ];
    const { container } = render(<IdeationAdoptionLeadTimeMatrixPanel runs={runs} />);

    const rows = Array.from(container.querySelectorAll('[data-testid^="ideation-adoption-lead-time-row-"]'));
    const rowPrefix = 'ideation-adoption-lead-time-row-';
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([`${rowPrefix}low`, `${rowPrefix}medium`, `${rowPrefix}high`]);
    expect(screen.getByText('採用率 高')).toBeInTheDocument();
    expect(screen.getByText('マージ迅速')).toBeInTheDocument();

    const filledCell = container.querySelector('[data-testid="ideation-adoption-lead-time-cell-high-fast"]');
    expect(filledCell?.textContent).toContain('1件');
    expect(filledCell?.textContent).toContain('採用率100%');
    expect(filledCell?.textContent).toContain('2.0分');

    const emptyCell = container.querySelector('[data-testid="ideation-adoption-lead-time-cell-low-slow"]');
    expect(emptyCell?.textContent).toBe('-');

    expect(container.querySelector('[data-testid="ideation-adoption-lead-time-excluded"]')?.textContent).toContain('1batch');
  });
});
