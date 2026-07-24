import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GatePauseAbandonmentPanel } from './GatePauseAbandonmentPanel';
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

describe('GatePauseAbandonmentPanel', () => {
  it('runが0件、またはpausedが1件も無ければ「データなし」を表示し、パネル本体を描画しない', () => {
    const first = render(<GatePauseAbandonmentPanel runs={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    first.unmount();

    const runs = [makeRun({ iteration: 1, verdict: 'merged' }), makeRun({ iteration: 2, verdict: 'dry-run' })];
    const { container } = render(<GatePauseAbandonmentPanel runs={runs} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="gate-pause-abandonment-panel"]')).toBeNull();
  });

  it('reviseCyclesが0ならclean-pause、1以上ならcontested-pauseとして件数を分ける', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'paused', reviseCycles: 0 }),
      makeRun({
        iteration: 2,
        verdict: 'paused',
        reviseCycles: 3,
        issue: { number: 2, title: 'b', labels: [] },
      }),
      makeRun({ iteration: 10, verdict: 'merged', issue: { number: 99, title: 'latest', labels: [] } }),
    ];
    const { container } = render(<GatePauseAbandonmentPanel runs={runs} />);

    expect(container.querySelector('[data-testid="gate-pause-count"]')?.textContent).toBe('2件');
    expect(container.querySelector('[data-testid="gate-pause-pattern-clean-pause"]')?.textContent).toContain('1件');
    expect(container.querySelector('[data-testid="gate-pause-pattern-contested-pause"]')?.textContent).toContain(
      '1件',
    );
  });

  it('同じissueが後続反復で再実行されていればreattempted、無くsurvivalIterationsが閾値以上ならstalledとして分ける', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'paused',
        issue: { number: 1, title: '再実行されたissue', labels: [] },
      }),
      makeRun({ iteration: 2, verdict: 'merged', issue: { number: 1, title: '再実行されたissue', labels: [] } }),
      makeRun({
        iteration: 3,
        verdict: 'paused',
        issue: { number: 2, title: '放置されたissue', labels: [] },
      }),
      makeRun({ iteration: 10, verdict: 'merged', issue: { number: 99, title: 'latest', labels: [] } }),
    ];
    const { container } = render(<GatePauseAbandonmentPanel runs={runs} />);

    expect(container.querySelector('[data-testid="gate-pause-status-reattempted"]')?.textContent).toContain('1件');
    expect(container.querySelector('[data-testid="gate-pause-status-stalled"]')?.textContent).toContain('1件');
    // pendingは該当0件なので表示されない
    expect(container.querySelector('[data-testid="gate-pause-status-pending"]')).toBeNull();

    const mostAtRisk = container.querySelector('[data-testid="gate-pause-most-at-risk"]');
    expect(mostAtRisk?.textContent).toContain('issue #2');
    expect(mostAtRisk?.textContent).toContain('放置されたissue');
  });

  it('stalledが1件も無ければmost-at-riskを描画しない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'paused' }),
      makeRun({ iteration: 2, verdict: 'merged' }),
    ];
    const { container } = render(<GatePauseAbandonmentPanel runs={runs} />);
    expect(container.querySelector('[data-testid="gate-pause-most-at-risk"]')).toBeNull();
  });

  it('paused反復ごとの行を新しい反復から順に表示し、issue番号・タイトル・PR番号を含む', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'paused',
        issue: { number: 10, title: '古い一時停止', labels: [] },
        prNumber: 20,
      }),
      makeRun({
        iteration: 4,
        verdict: 'paused',
        issue: { number: 13, title: '新しい一時停止', labels: [] },
        prNumber: null,
      }),
    ];
    const { container } = render(<GatePauseAbandonmentPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="gate-pause-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['gate-pause-row-4', 'gate-pause-row-1']);

    const newestRow = container.querySelector('[data-testid="gate-pause-row-4"]');
    expect(newestRow?.textContent).toContain('issue #13');
    expect(newestRow?.textContent).toContain('新しい一時停止');
    expect(newestRow?.textContent).toContain('PRなし');

    const oldestRow = container.querySelector('[data-testid="gate-pause-row-1"]');
    expect(oldestRow?.textContent).toContain('issue #10');
    expect(oldestRow?.textContent).toContain('古い一時停止');
    expect(oldestRow?.textContent).toContain('PR #20');
  });

  it('dry-run/merged/failedの行はpaused一覧にもpattern集計にも出ない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'dry-run' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'paused' }),
    ];
    const { container } = render(<GatePauseAbandonmentPanel runs={runs} />);
    expect(container.querySelector('[data-testid="gate-pause-row-1"]')).toBeNull();
    expect(container.querySelector('[data-testid="gate-pause-row-2"]')).toBeNull();
    expect(container.querySelector('[data-testid="gate-pause-count"]')?.textContent).toBe('1件');
  });
});
