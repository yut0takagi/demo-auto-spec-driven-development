import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { E2eReviseCorrelationPanel } from './E2eReviseCorrelationPanel';
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

describe('E2eReviseCorrelationPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<E2eReviseCorrelationPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="e2e-revise-correlation-panel"]')).toBeNull();
  });

  it('verify に到達した run が1件も無ければ（全run failed）「データなし」のまま（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed', verify: { unitPassed: false, e2ePassed: false, coveragePct: 0 } }),
    ];
    const { container } = render(<E2eReviseCorrelationPanel runs={runs} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="e2e-revise-correlation-panel"]')).toBeNull();
  });

  it('e2e成功/失敗群の件数・平均revise回数・相関係数を正確な値で表示する（部分一致に頼らない）', () => {
    const runs = [
      makeRun({ iteration: 1, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, reviseCycles: 0 }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, reviseCycles: 1 }),
      makeRun({ iteration: 3, verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 }, reviseCycles: 3 }),
      makeRun({ iteration: 4, verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 }, reviseCycles: 4 }),
    ];
    const { container } = render(<E2eReviseCorrelationPanel runs={runs} />);

    expect(screen.getByText('E2E成功 (2件)')).toBeInTheDocument();
    expect(screen.getByText('E2E失敗 (2件)')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="e2e-revise-passed-mean"]')?.textContent).toBe('0.5回');
    expect(container.querySelector('[data-testid="e2e-revise-failed-mean"]')?.textContent).toBe('3.5回');
    expect(container.querySelector('[data-testid="e2e-revise-correlation-coefficient"]')?.textContent).toBe(
      'r = 0.95',
    );
    expect(container.querySelector('[data-testid="e2e-revise-failed-iterations"]')?.textContent).toBe(
      'E2E失敗した反復: 3, 4',
    );
    expect(screen.getByText('E2E失敗時は成功時より平均 3.0回 revise が多い')).toBeInTheDocument();

    const passedBar = container.querySelector('[data-testid="e2e-revise-passed-bar"]') as HTMLElement;
    const failedBar = container.querySelector('[data-testid="e2e-revise-failed-bar"]') as HTMLElement;
    // 失敗群の方がrevise回数が多いので、バー幅も失敗群の方が長いはず
    expect(parseFloat(failedBar.style.width)).toBeGreaterThan(parseFloat(passedBar.style.width));
  });

  it('e2e結果が全run同じ（分散0）だと相関係数は「算出不可」になり、失敗反復の注記も出ない（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, reviseCycles: 0 }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, reviseCycles: 0 }),
    ];
    const { container } = render(<E2eReviseCorrelationPanel runs={runs} />);
    expect(container.querySelector('[data-testid="e2e-revise-correlation-coefficient"]')?.textContent).toBe(
      '算出不可',
    );
    expect(container.querySelector('[data-testid="e2e-revise-failed-iterations"]')).toBeNull();
    expect(screen.getByText('E2E成功/失敗で平均revise回数に差はない')).toBeInTheDocument();
  });
});
