import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviseCycleCostRecoveryPanel } from './ReviseCycleCostRecoveryPanel';
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

describe('ReviseCycleCostRecoveryPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<ReviseCycleCostRecoveryPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="revise-cycle-cost-recovery-panel"]')).toBeNull();
  });

  it('bucketごとのコスト統計値と回収率(merged/count)を正確な値で表示する（部分一致に頼らない）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        reviseCycles: 1,
        cost: { builderUsd: 0.9, adversaryUsd: 0.1, ideationUsd: 0, totalUsd: 1.0 },
      }),
      makeRun({
        iteration: 2,
        verdict: 'merged',
        reviseCycles: 1,
        cost: { builderUsd: 1.8, adversaryUsd: 0.2, ideationUsd: 0, totalUsd: 2.0 },
      }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        reviseCycles: 1,
        cost: { builderUsd: 3.6, adversaryUsd: 0.4, ideationUsd: 0, totalUsd: 4.0 },
      }),
    ];
    const { container } = render(<ReviseCycleCostRecoveryPanel runs={runs} />);

    expect(container.querySelector('[data-testid="revise-cycle-cost-recovery-panel"]')?.textContent).toContain(
      '1区分',
    );

    const stats = container.querySelector('[data-testid="revise-cost-recovery-stats-1"]');
    // mean=7/3=2.3333..., median=2, p90=3.6
    expect(stats?.textContent).toBe('平均$2.33 / 中央値$2.00 / p90 $3.60（3件）');

    const rate = container.querySelector('[data-testid="revise-cost-recovery-rate-1"]');
    expect(rate?.textContent).toBe('回収67%（2/3）');

    const perMerge = container.querySelector('[data-testid="revise-cost-recovery-per-merge-1"]');
    // 7.0 / 2 merged = 3.5
    expect(perMerge?.textContent).toBe('merge到達1件あたり: $3.50');
  });

  it('mergedが1件も無いbucketは「回収実績なし」を表示し、回収率バーの幅は0%になる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        reviseCycles: 0,
        cost: { builderUsd: 0.5, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.5 },
      }),
    ];
    const { container } = render(<ReviseCycleCostRecoveryPanel runs={runs} />);

    const perMerge = container.querySelector('[data-testid="revise-cost-recovery-per-merge-0"]');
    expect(perMerge?.textContent).toBe('merge到達1件あたり: 回収実績なし');

    const rateBar = container.querySelector('[data-testid="revise-cost-recovery-rate-bar-0"]') as HTMLElement;
    expect(parseFloat(rateBar.style.width)).toBeCloseTo(0, 2);

    const rate = container.querySelector('[data-testid="revise-cost-recovery-rate-0"]');
    expect(rate?.textContent).toBe('回収0%（0/1）');
  });

  it('コストバーの幅は最大平均コストに対する相対値と一致する（同一の並び順ではなく実際の値で検証）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        reviseCycles: 0,
        cost: { builderUsd: 4, adversaryUsd: 0, ideationUsd: 0, totalUsd: 4 },
      }),
      makeRun({
        iteration: 2,
        verdict: 'merged',
        reviseCycles: 1,
        cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 },
      }),
    ];
    const { container } = render(<ReviseCycleCostRecoveryPanel runs={runs} />);
    const bar0 = container.querySelector('[data-testid="revise-cost-recovery-cost-bar-0"]') as HTMLElement;
    const bar1 = container.querySelector('[data-testid="revise-cost-recovery-cost-bar-1"]') as HTMLElement;
    // 最大平均コストは bucket 0 (4) なので bucket0=100%, bucket1=1/4*100=25%
    expect(parseFloat(bar0.style.width)).toBeCloseTo(100, 2);
    expect(parseFloat(bar1.style.width)).toBeCloseTo(25, 2);
  });

  it('bucketは常に 0→1→2→3+ の順で表示される（出現したものだけ）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 5 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0 }),
    ];
    const { container } = render(<ReviseCycleCostRecoveryPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="revise-cost-recovery-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'revise-cost-recovery-row-0',
      'revise-cost-recovery-row-3+',
    ]);
  });
});
