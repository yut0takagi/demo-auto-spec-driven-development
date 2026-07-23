import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GateReasonCostPanel } from './GateReasonCostPanel';
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

describe('GateReasonCostPanel', () => {
  it('run が0件、またはgateReasonsが全run空なら「データなし」を表示し、パネル本体を描画しない', () => {
    render(<GateReasonCostPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();

    const runs = [makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] })];
    const { container } = render(<GateReasonCostPanel runs={runs} />);
    expect(screen.getAllByText('データなし').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="gate-reason-cost-panel"]')).toBeNull();
  });

  it('カテゴリ別の合計コスト・反復数・revise1回あたりコストを正確な値で表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['e2e(Playwright) が失敗している'],
        reviseCycles: 2,
        durationSec: 600,
        cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['e2e(Playwright) が失敗している'],
        reviseCycles: 2,
        durationSec: 400,
        cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 },
      }),
    ];
    const { container } = render(<GateReasonCostPanel runs={runs} />);

    expect(container.querySelector('[data-testid="gate-reason-cost-panel"]')?.textContent).toContain(
      '総コスト $2.00',
    );

    const total = container.querySelector('[data-testid="gate-reason-cost-total-e2eFailed"]');
    expect(total?.textContent).toBe('$2.00（2反復）');

    // 合計コスト2USD / revise合計4回 = 0.5USD、合計duration1000秒 / revise4回 = 250秒 = 4.2分
    const perRevise = container.querySelector('[data-testid="gate-reason-cost-per-revise-e2eFailed"]');
    expect(perRevise?.textContent).toBe('revise 1回あたり: $0.500 / 4.2分');
  });

  it('該当カテゴリの全runがreviseCycles=0のとき、revise1回あたりコストは0除算せず代替文言を表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['反復が例外で異常終了した: boom'],
        reviseCycles: 0,
        cost: { builderUsd: 0.5, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.5 },
      }),
    ];
    const { container } = render(<GateReasonCostPanel runs={runs} />);
    const perRevise = container.querySelector('[data-testid="gate-reason-cost-per-revise-crashed"]');
    expect(perRevise?.textContent).toBe('revise 1回あたり: revise無し（即abandon等）');
    expect(perRevise?.textContent).not.toContain('NaN');
    expect(perRevise?.textContent).not.toContain('Infinity');
  });

  it('バーの幅は最大totalCostUsdに対する相対値で、コスト降順で行を並べる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['builder が変更を生成しなかった'],
        reviseCycles: 1,
        cost: { builderUsd: 0.5, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.5 },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['e2e(Playwright) が失敗している'],
        reviseCycles: 3,
        cost: { builderUsd: 2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 2 },
      }),
    ];
    const { container } = render(<GateReasonCostPanel runs={runs} />);

    const rows = Array.from(container.querySelectorAll('[data-testid^="gate-reason-cost-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'gate-reason-cost-row-e2eFailed',
      'gate-reason-cost-row-noChanges',
    ]);

    const e2eBar = container.querySelector('[data-testid="gate-reason-cost-bar-e2eFailed"]') as HTMLElement;
    const noChangesBar = container.querySelector('[data-testid="gate-reason-cost-bar-noChanges"]') as HTMLElement;
    // 最大が e2eFailed=2USDなので、その行は100%、noChanges(0.5USD)は25%
    expect(parseFloat(e2eBar.style.width)).toBeCloseTo(100, 2);
    expect(parseFloat(noChangesBar.style.width)).toBeCloseTo(25, 2);
  });
});
