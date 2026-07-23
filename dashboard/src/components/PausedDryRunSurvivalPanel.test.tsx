import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PausedDryRunSurvivalPanel } from './PausedDryRunSurvivalPanel';
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

describe('PausedDryRunSurvivalPanel', () => {
  it('runが0件、またはpaused/dry-runが1件も無ければ「データなし」を表示し、パネル本体を描画しない', () => {
    const first = render(<PausedDryRunSurvivalPanel runs={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    first.unmount();

    const runs = [makeRun({ iteration: 1, verdict: 'merged' }), makeRun({ iteration: 2, verdict: 'failed' })];
    const { container } = render(<PausedDryRunSurvivalPanel runs={runs} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="paused-dryrun-survival-panel"]')).toBeNull();
  });

  it('停止理由別の内訳（件数・平均/最長生存反復数・PR開設件数・合計コスト）を正確な値で表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'paused',
        prNumber: 10,
        cost: { builderUsd: 0.1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.1 },
      }),
      makeRun({
        iteration: 3,
        verdict: 'paused',
        prNumber: null,
        cost: { builderUsd: 0.2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.2 },
      }),
      makeRun({ iteration: 6, verdict: 'merged' }),
    ];
    const { container } = render(<PausedDryRunSurvivalPanel runs={runs} />);

    expect(container.querySelector('[data-testid="paused-dryrun-count"]')?.textContent).toBe('2件');
    const pausedRow = container.querySelector('[data-testid="paused-dryrun-reason-paused"]');
    // iteration 6が最新: iteration1のsurvivalは5、iteration3は3 → 平均4.0・最長5
    expect(pausedRow?.textContent).toContain('2件');
    expect(pausedRow?.textContent).toContain('平均生存4.0反復');
    expect(pausedRow?.textContent).toContain('最長生存5反復');
    expect(pausedRow?.textContent).toContain('PR開設1件');
    expect(pausedRow?.textContent).toContain('$0.30');
    // dry-run は0件なので行自体が存在しない
    expect(container.querySelector('[data-testid="paused-dryrun-reason-dry-run"]')).toBeNull();
  });

  it('最も長く放置されている反復をlongestSurvivingとして表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'paused',
        issue: { number: 5, title: '長く放置されたissue', labels: [] },
      }),
      makeRun({ iteration: 4, verdict: 'dry-run', issue: { number: 8, title: '最近のdry-run', labels: [] } }),
      makeRun({ iteration: 10, verdict: 'merged' }),
    ];
    const { container } = render(<PausedDryRunSurvivalPanel runs={runs} />);
    const longest = container.querySelector('[data-testid="paused-dryrun-longest"]');
    expect(longest?.textContent).toContain('issue #5');
    expect(longest?.textContent).toContain('長く放置されたissue');
    expect(longest?.textContent).toContain('9反復経過');
  });

  it('paused/dry-run反復ごとの行を新しい反復から順に表示し、issue番号・タイトル・PR番号・停止理由を含む', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'paused',
        issue: { number: 10, title: '古い一時停止', labels: [] },
        prNumber: 20,
      }),
      makeRun({
        iteration: 4,
        verdict: 'dry-run',
        issue: { number: 13, title: '新しいドライラン', labels: [] },
        prNumber: null,
      }),
    ];
    const { container } = render(<PausedDryRunSurvivalPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="paused-dryrun-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'paused-dryrun-row-4',
      'paused-dryrun-row-1',
    ]);

    const newestRow = container.querySelector('[data-testid="paused-dryrun-row-4"]');
    expect(newestRow?.textContent).toContain('issue #13');
    expect(newestRow?.textContent).toContain('新しいドライラン');
    expect(newestRow?.textContent).toContain('ドライラン');
    expect(newestRow?.textContent).toContain('PRなし');

    const oldestRow = container.querySelector('[data-testid="paused-dryrun-row-1"]');
    expect(oldestRow?.textContent).toContain('issue #10');
    expect(oldestRow?.textContent).toContain('一時停止');
    expect(oldestRow?.textContent).toContain('PR #20');
  });

  it('abandoned/failedの行はpaused/dry-run一覧にもreasons集計にも出ない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'paused' }),
    ];
    const { container } = render(<PausedDryRunSurvivalPanel runs={runs} />);
    expect(container.querySelector('[data-testid="paused-dryrun-row-1"]')).toBeNull();
    expect(container.querySelector('[data-testid="paused-dryrun-row-2"]')).toBeNull();
    expect(container.querySelector('[data-testid="paused-dryrun-count"]')?.textContent).toBe('1件');
  });
});
