import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VerdictDurationComparisonPanel } from './VerdictDurationComparisonPanel';
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

describe('VerdictDurationComparisonPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<VerdictDurationComparisonPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="verdict-duration-comparison-panel"]')).toBeNull();
  });

  it('verdict ごとの平均/中央値/範囲/件数を分単位の正確な値で表示し、failed も含める（部分一致に頼らない）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', durationSec: 300 }),
      makeRun({ iteration: 2, verdict: 'merged', durationSec: 900 }),
      makeRun({ iteration: 3, verdict: 'failed', durationSec: 60 }),
    ];
    const { container } = render(<VerdictDurationComparisonPanel runs={runs} />);

    expect(container.querySelector('[data-testid="verdict-duration-comparison-panel"]')?.textContent).toContain(
      '2種類',
    );

    // merged: (300+900)/2 = 600秒 = 10.0分, median=10.0分, min=5.0分, max=15.0分
    const mergedStats = container.querySelector('[data-testid="duration-verdict-stats-merged"]');
    expect(mergedStats?.textContent).toBe('平均10.0分 / 中央値10.0分 / 5.0〜15.0分 (2件)');

    // failed は他パネルと異なり除外されず、独立したグループとして表示される。60秒 = 1.0分
    const failedStats = container.querySelector('[data-testid="duration-verdict-stats-failed"]');
    expect(failedStats?.textContent).toBe('平均1.0分 / 中央値1.0分 / 1.0〜1.0分 (1件)');

    const mergedRow = container.querySelector('[data-testid="duration-verdict-row-merged"]');
    expect(mergedRow?.textContent).toContain('対象iteration: 1, 2');
  });

  it('平均値が異なる verdict はバーの幅が最大平均に対する相対値と一致する（同値時の並び順ではなく実際の値で検証）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', durationSec: 800 }),
      makeRun({ iteration: 2, verdict: 'abandoned', durationSec: 400 }),
    ];
    const { container } = render(<VerdictDurationComparisonPanel runs={runs} />);
    const mergedBar = container.querySelector('[data-testid="duration-verdict-bar-merged"]') as HTMLElement;
    const abandonedBar = container.querySelector('[data-testid="duration-verdict-bar-abandoned"]') as HTMLElement;
    // 最大平均は merged(800) なので merged=100%, abandoned=400/800*100=50%
    expect(parseFloat(mergedBar.style.width)).toBeCloseTo(100, 2);
    expect(parseFloat(abandonedBar.style.width)).toBeCloseTo(50, 2);
  });

  it('平均所要時間の降順でverdictを並べる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', durationSec: 100 }),
      makeRun({ iteration: 2, verdict: 'failed', durationSec: 900 }),
    ];
    const { container } = render(<VerdictDurationComparisonPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="duration-verdict-row-"]'));
    expect(rows[0].getAttribute('data-testid')).toBe('duration-verdict-row-failed');
    expect(rows[1].getAttribute('data-testid')).toBe('duration-verdict-row-merged');
  });
});
