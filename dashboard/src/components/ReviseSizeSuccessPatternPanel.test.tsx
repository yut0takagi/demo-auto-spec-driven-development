import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviseSizeSuccessPatternPanel } from './ReviseSizeSuccessPatternPanel';
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

describe('ReviseSizeSuccessPatternPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<ReviseSizeSuccessPatternPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="revise-size-success-pattern-panel"]')).toBeNull();
  });

  it('データが出現しないセルは "-" を表示する', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0, changedLines: 10 })];
    const { container } = render(<ReviseSizeSuccessPatternPanel runs={runs} />);
    const emptyCell = container.querySelector('[data-testid="revise-size-success-cell-0-large"]');
    expect(emptyCell?.textContent).toBe('-');
  });

  it('サンプル不足のセルは「データ不足」と表示し、mergeRateの高低で色分けしない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0, changedLines: 10 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0, changedLines: 10 }),
    ];
    const { container } = render(<ReviseSizeSuccessPatternPanel runs={runs} />);
    const cell = container.querySelector('[data-testid="revise-size-success-cell-0-small"]');
    expect(cell?.textContent).toContain('データ不足');
    expect(cell?.textContent).toContain('100% (2件)');
  });

  it('十分なサンプルでmergeRateが高いセルは「成功パターン」と表示し、成功パターン数を集計する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0, changedLines: 10 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0, changedLines: 10 }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 0, changedLines: 10 }),
    ];
    const { container } = render(<ReviseSizeSuccessPatternPanel runs={runs} />);
    const cell = container.querySelector('[data-testid="revise-size-success-cell-0-small"]');
    expect(cell?.textContent).toContain('100% (3件)');
    expect(cell?.textContent).toContain('成功パターン');
    expect(container.querySelector('[data-testid="revise-size-success-high-count"]')?.textContent).toBe(
      '成功パターン 1区分',
    );
  });

  it('十分なサンプルでmergeRateが低いセルは「失敗パターン」と表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', reviseCycles: 3, changedLines: 500 }),
      makeRun({ iteration: 2, verdict: 'abandoned', reviseCycles: 3, changedLines: 500 }),
      makeRun({ iteration: 3, verdict: 'abandoned', reviseCycles: 3, changedLines: 500 }),
    ];
    const { container } = render(<ReviseSizeSuccessPatternPanel runs={runs} />);
    const cell = container.querySelector('[data-testid="revise-size-success-cell-3+-large"]');
    expect(cell?.textContent).toContain('0% (3件)');
    expect(cell?.textContent).toContain('失敗パターン');
  });

  it('revise回数の行は0/1/2/3+の固定順で描画する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 3, changedLines: 10 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0, changedLines: 10 }),
    ];
    const { container } = render(<ReviseSizeSuccessPatternPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="revise-size-success-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'revise-size-success-row-0',
      'revise-size-success-row-1',
      'revise-size-success-row-2',
      'revise-size-success-row-3+',
    ]);
  });
});
