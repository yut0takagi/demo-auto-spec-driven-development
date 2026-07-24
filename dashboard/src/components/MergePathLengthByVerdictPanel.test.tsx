import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MergePathLengthByVerdictPanel } from './MergePathLengthByVerdictPanel';
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

describe('MergePathLengthByVerdictPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<MergePathLengthByVerdictPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="merge-path-length-verdict-panel"]')).toBeNull();
  });

  it('merged だけの run では経路長を計算できる対象が無いため「データなし」になる', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'merged' }), makeRun({ iteration: 2, verdict: 'merged' })];
    const { container } = render(<MergePathLengthByVerdictPanel runs={runs} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="merge-path-length-verdict-panel"]')).toBeNull();
  });

  it('verdict ごとの平均/中央値/範囲/件数を正確な値で表示する（部分一致に頼らない）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'merged' }),
    ];
    const { container } = render(<MergePathLengthByVerdictPanel runs={runs} />);

    expect(container.querySelector('[data-testid="merge-path-length-verdict-panel"]')?.textContent).toContain(
      '1種類',
    );

    // failed: iteration1は経路長2(→iteration3で merge)、iteration2は経路長1 → 平均1.5・中央値1.5・1〜2・2件
    const failedStats = container.querySelector('[data-testid="merge-path-length-verdict-stats-failed"]');
    expect(failedStats?.textContent).toBe('平均1.5回 / 中央値1.5回 / 1〜2回 (2件)');

    const failedRow = container.querySelector('[data-testid="merge-path-length-verdict-row-failed"]');
    expect(failedRow?.textContent).toContain('対象iteration: 1, 2');
  });

  it('平均経路長が異なる verdict はバーの幅が最大平均に対する相対値と一致する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }), // 経路長4
      makeRun({ iteration: 2, verdict: 'abandoned' }), // 経路長3
      makeRun({ iteration: 3, verdict: 'abandoned' }), // 経路長2
      makeRun({ iteration: 4, verdict: 'abandoned' }), // 経路長1
      makeRun({ iteration: 5, verdict: 'merged' }),
    ];
    const { container } = render(<MergePathLengthByVerdictPanel runs={runs} />);
    const failedBar = container.querySelector('[data-testid="merge-path-length-verdict-bar-failed"]') as HTMLElement;
    const abandonedBar = container.querySelector(
      '[data-testid="merge-path-length-verdict-bar-abandoned"]',
    ) as HTMLElement;
    // 最大平均は failed(4) なので failed=100%, abandoned平均=2 → 2/4*100=50%
    expect(parseFloat(failedBar.style.width)).toBeCloseTo(100, 2);
    expect(parseFloat(abandonedBar.style.width)).toBeCloseTo(50, 2);
  });

  it('平均経路長の降順（mergeから遠い順）でverdictを並べる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned' }), // 経路長1
      makeRun({ iteration: 2, verdict: 'merged' }),
      makeRun({ iteration: 3, verdict: 'failed' }), // 経路長3
      makeRun({ iteration: 4, verdict: 'failed' }), // 経路長2
      makeRun({ iteration: 5, verdict: 'failed' }), // 経路長1
      makeRun({ iteration: 6, verdict: 'merged' }),
    ];
    const { container } = render(<MergePathLengthByVerdictPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="merge-path-length-verdict-row-"]'));
    expect(rows[0].getAttribute('data-testid')).toBe('merge-path-length-verdict-row-failed');
    expect(rows[1].getAttribute('data-testid')).toBe('merge-path-length-verdict-row-abandoned');
  });
});
