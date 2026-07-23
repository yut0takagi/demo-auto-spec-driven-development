import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviseCyclesByVerdictPanel } from './ReviseCyclesByVerdictPanel';
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

describe('ReviseCyclesByVerdictPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<ReviseCyclesByVerdictPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="revise-cycles-by-verdict-panel"]')).toBeNull();
  });

  it('verdict ごとの平均/中央値/範囲/件数を正確な値で表示し、failed も含める（部分一致に頼らない）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 1 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 5 }),
      makeRun({ iteration: 3, verdict: 'failed', reviseCycles: 9 }),
    ];
    const { container } = render(<ReviseCyclesByVerdictPanel runs={runs} />);

    expect(container.querySelector('[data-testid="revise-cycles-by-verdict-panel"]')?.textContent).toContain(
      '2種類',
    );

    const mergedStats = container.querySelector('[data-testid="revise-verdict-stats-merged"]');
    expect(mergedStats?.textContent).toBe('平均3.0 / 中央値3.0 / 1〜5回 (2件)');

    // failed は他パネル（reviseCyclesByModel 等）と異なり除外されず、独立したグループとして表示される。
    const failedStats = container.querySelector('[data-testid="revise-verdict-stats-failed"]');
    expect(failedStats?.textContent).toBe('平均9.0 / 中央値9.0 / 9〜9回 (1件)');

    const mergedRow = container.querySelector('[data-testid="revise-verdict-row-merged"]');
    expect(mergedRow?.textContent).toContain('対象iteration: 1, 2');
  });

  it('平均値が異なる verdict はバーの幅が最大平均に対する相対値と一致する（同値時の並び順ではなく実際の値で検証）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 4 }),
      makeRun({ iteration: 2, verdict: 'abandoned', reviseCycles: 2 }),
    ];
    const { container } = render(<ReviseCyclesByVerdictPanel runs={runs} />);
    const mergedBar = container.querySelector('[data-testid="revise-verdict-bar-merged"]') as HTMLElement;
    const abandonedBar = container.querySelector('[data-testid="revise-verdict-bar-abandoned"]') as HTMLElement;
    // 最大平均は merged(4) なので merged=100%, abandoned=2/4*100=50%
    expect(parseFloat(mergedBar.style.width)).toBeCloseTo(100, 2);
    expect(parseFloat(abandonedBar.style.width)).toBeCloseTo(50, 2);
  });

  it('平均revise回数の降順でverdictを並べる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 1 }),
      makeRun({ iteration: 2, verdict: 'failed', reviseCycles: 9 }),
    ];
    const { container } = render(<ReviseCyclesByVerdictPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="revise-verdict-row-"]'));
    expect(rows[0].getAttribute('data-testid')).toBe('revise-verdict-row-failed');
    expect(rows[1].getAttribute('data-testid')).toBe('revise-verdict-row-merged');
  });
});
