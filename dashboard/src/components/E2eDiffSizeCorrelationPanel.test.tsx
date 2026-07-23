import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { E2eDiffSizeCorrelationPanel } from './E2eDiffSizeCorrelationPanel';
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
    cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: 0.11 },
    models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
    nextIssues: [],
    ...overrides,
  };
}

describe('E2eDiffSizeCorrelationPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<E2eDiffSizeCorrelationPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="e2e-diffsize-correlation-panel"]')).toBeNull();
  });

  it('verify に到達した run が1件も無ければ（全run failed）「データなし」のまま（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed', verify: { unitPassed: false, e2ePassed: false, coveragePct: 0 } }),
    ];
    const { container } = render(<E2eDiffSizeCorrelationPanel runs={runs} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="e2e-diffsize-correlation-panel"]')).toBeNull();
  });

  it('e2e成功/失敗群の件数・平均変更行数・相関係数を正確な値で表示する（部分一致に頼らない）', () => {
    // changedLines は e2eFailureReviseCorrelation のテストで使うreviseCycles [0,1,3,4] を
    // y' = 100y + 20 でアフィン変換した値。Pearson相関はアフィン変換で不変なので
    // 相関係数は同じ r ≈ 0.9487 になるはず（別経路で既に検算済みの値との整合性を利用）。
    const runs = [
      makeRun({ iteration: 1, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, changedLines: 20 }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, changedLines: 120 }),
      makeRun({ iteration: 3, verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 }, changedLines: 320 }),
      makeRun({ iteration: 4, verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 }, changedLines: 420 }),
    ];
    const { container } = render(<E2eDiffSizeCorrelationPanel runs={runs} />);

    expect(screen.getByText('E2E成功 (2件)')).toBeInTheDocument();
    expect(screen.getByText('E2E失敗 (2件)')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="e2e-diffsize-passed-mean"]')?.textContent).toBe('70.0行');
    expect(container.querySelector('[data-testid="e2e-diffsize-failed-mean"]')?.textContent).toBe('370.0行');
    expect(container.querySelector('[data-testid="e2e-diffsize-correlation-coefficient"]')?.textContent).toBe(
      'r = 0.95',
    );
    expect(container.querySelector('[data-testid="e2e-diffsize-failed-iterations"]')?.textContent).toBe(
      'E2E失敗した反復: 3, 4',
    );
    expect(screen.getByText('E2E失敗時は成功時より平均 300.0行 diffが大きい')).toBeInTheDocument();

    const passedBar = container.querySelector('[data-testid="e2e-diffsize-passed-bar"]') as HTMLElement;
    const failedBar = container.querySelector('[data-testid="e2e-diffsize-failed-bar"]') as HTMLElement;
    // 失敗群の方が変更行数が多いので、バー幅も失敗群の方が長いはず
    expect(parseFloat(failedBar.style.width)).toBeGreaterThan(parseFloat(passedBar.style.width));
  });

  it('e2e結果が全run同じ（分散0）だと相関係数は「算出不可」になり、失敗反復の注記も出ない（境界値）', () => {
    // 失敗群が空のとき failedMeanChangedLines は mean([])=0 のsentinel値になるため、
    // delta を厳密に0にするには passed 群の平均も0になる値を選ぶ必要がある。
    const runs = [
      makeRun({ iteration: 1, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, changedLines: 0 }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, changedLines: 0 }),
    ];
    const { container } = render(<E2eDiffSizeCorrelationPanel runs={runs} />);
    expect(container.querySelector('[data-testid="e2e-diffsize-correlation-coefficient"]')?.textContent).toBe(
      '算出不可',
    );
    expect(container.querySelector('[data-testid="e2e-diffsize-failed-iterations"]')).toBeNull();
    expect(screen.getByText('E2E成功/失敗で平均変更行数に差はない')).toBeInTheDocument();
  });

  it('e2e失敗群の変更行数が成功群より少ないと「diffが小さい」表記になる', () => {
    const runs = [
      makeRun({ iteration: 1, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, changedLines: 500 }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 }, changedLines: 100 }),
    ];
    const { container } = render(<E2eDiffSizeCorrelationPanel runs={runs} />);
    expect(screen.getByText('E2E失敗時は成功時より平均 400.0行 diffが小さい')).toBeInTheDocument();
    const passedBar = container.querySelector('[data-testid="e2e-diffsize-passed-bar"]') as HTMLElement;
    const failedBar = container.querySelector('[data-testid="e2e-diffsize-failed-bar"]') as HTMLElement;
    expect(parseFloat(passedBar.style.width)).toBeGreaterThan(parseFloat(failedBar.style.width));
  });
});
