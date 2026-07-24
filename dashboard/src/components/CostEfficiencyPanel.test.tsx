import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CostEfficiencyPanel } from './CostEfficiencyPanel';
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

describe('CostEfficiencyPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<CostEfficiencyPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="cost-efficiency-panel"]')).toBeNull();
  });

  it('承認PRが1件も無ければ「データなし」を表示する（全runがabandoned/needs-humanの境界値）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
        prNumber: null,
        gateReasons: ['builder が変更を生成しなかった'],
      }),
      makeRun({
        iteration: 2,
        verdict: 'needs-human',
        adversary: { approved: false, summary: '' },
        prNumber: 20,
        gateReasons: ['adversary が approve していない'],
      }),
    ];
    const { container } = render(<CostEfficiencyPanel runs={runs} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="cost-efficiency-panel"]')).toBeNull();
  });

  it('adversaryがapproved=trueでもprNumberがnullなら承認PRとして数えず「データなし」のまま', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        adversary: { approved: true, summary: '' },
        prNumber: null,
        gateReasons: ['builder が変更を生成しなかった'],
      }),
    ];
    const { container } = render(<CostEfficiencyPanel runs={runs} />);
    expect(container.querySelector('[data-testid="cost-efficiency-panel"]')).toBeNull();
  });

  it('総コスト・承認PR件数・USD per 承認PRを正確な値で表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        prNumber: 11,
        cost: { builderUsd: 0.3, adversaryUsd: 0.05, ideationUsd: 0.05, totalUsd: 0.4 },
      }),
      makeRun({
        iteration: 2,
        verdict: 'failed',
        adversary: { approved: false, summary: '' },
        prNumber: null,
        gateReasons: ['反復が例外で異常終了した: boom'],
        cost: { builderUsd: 0.1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.1 },
      }),
    ];
    const { container } = render(<CostEfficiencyPanel runs={runs} />);

    // 総コスト0.5(=0.4+0.1、failedのコストも合算) / 承認PR1件 = 0.50
    expect(container.querySelector('[data-testid="cost-efficiency-total"]')?.textContent).toBe(
      '総コスト $0.50 / 承認PR 1件',
    );
    expect(container.querySelector('[data-testid="cost-efficiency-value"]')?.textContent).toContain('$0.50');
  });

  it('承認PRが複数回出るケースでは累計コスト÷累計承認PR数の最終値がusdPerApprovedPrと一致する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        prNumber: 11,
        cost: { builderUsd: 0.4, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.4 },
      }),
      makeRun({
        iteration: 2,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        prNumber: 12,
        cost: { builderUsd: 0.2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.2 },
      }),
    ];
    const { container } = render(<CostEfficiencyPanel runs={runs} />);

    // 総コスト0.6 / 承認PR2件 = 0.30
    expect(container.querySelector('[data-testid="cost-efficiency-value"]')?.textContent).toContain('$0.30');

    const bars = container.querySelectorAll('[data-testid^="cost-efficiency-bar-"]');
    expect(bars).toHaveLength(2);
    const bar1 = container.querySelector('[data-testid="cost-efficiency-bar-1"]') as HTMLElement;
    const bar2 = container.querySelector('[data-testid="cost-efficiency-bar-2"]') as HTMLElement;
    // iter1: 累計0.4/1件=0.4, iter2: 累計0.6/2件=0.3。最大値0.4に対する高さ比なので
    // bar1は100%、bar2は0.3/0.4=75%になる。
    expect(parseFloat(bar1.style.height)).toBeCloseTo(100, 2);
    expect(parseFloat(bar2.style.height)).toBeCloseTo(75, 2);
  });

  it('paused/dry-runも承認済みでPRが開いていれば承認PR数に含める', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'paused',
        adversary: { approved: true, summary: '' },
        prNumber: 14,
        cost: { builderUsd: 0.1, adversaryUsd: 0.02, ideationUsd: 0.02, totalUsd: 0.14 },
      }),
    ];
    const { container } = render(<CostEfficiencyPanel runs={runs} />);
    expect(container.querySelector('[data-testid="cost-efficiency-total"]')?.textContent).toContain('承認PR 1件');
  });

  it('窓内に早期の大コスト点があっても最終バーは不可視にならない最小高さを確保する（回帰: e2e toBeVisible）', () => {
    // 最初の承認PRだけ大コスト($100)、以降は~$0。累計コスト/累計承認 は 100/n と急減し、
    // 窓内 max=100 に対し最終点(iter30)=3.33 → 素朴な (value/max)*100 では高さ約3%となり、
    // サブピクセルで不可視化して Playwright の toBeVisible が落ちる（CI で実際に発生）。
    const runs = Array.from({ length: 30 }, (_, i) =>
      makeRun({
        iteration: i + 1,
        prNumber: 100 + i,
        adversary: { approved: true, summary: '' },
        cost: {
          builderUsd: i === 0 ? 100 : 0,
          adversaryUsd: 0,
          ideationUsd: 0,
          totalUsd: i === 0 ? 100 : 0,
        },
      }),
    );
    const { container } = render(<CostEfficiencyPanel runs={runs} />);
    const lastBar = container.querySelector('[data-testid="cost-efficiency-bar-30"]') as HTMLElement;
    expect(lastBar).not.toBeNull();
    const heightPct = parseFloat(lastBar.style.height);
    // 素朴計算なら約3.33%。正の値のバーは可視を保証する最小高さ(>=4%)を下回らないこと。
    expect(heightPct).toBeGreaterThanOrEqual(4);
  });

  it('値が0のバーは高さ0のまま（正の値だけ最小高さを与え、幻のバーを作らない）', () => {
    // 最初の承認PRのコストが$0なら usdPerApprovedPr=0 → データなし経路に落ちるため、
    // ここでは「正の値には最小高さ、実質ゼロには与えない」ことを最大値との比で確認する。
    const runs = [
      makeRun({ iteration: 1, prNumber: 201, cost: { builderUsd: 100, adversaryUsd: 0, ideationUsd: 0, totalUsd: 100 } }),
      makeRun({ iteration: 2, prNumber: 202, cost: { builderUsd: 0, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0 } }),
    ];
    const { container } = render(<CostEfficiencyPanel runs={runs} />);
    // iter1=100/1=100(最大), iter2=100/2=50 → 50%。最小フロア(4%)以上で素の比率を保つ。
    const bar2 = container.querySelector('[data-testid="cost-efficiency-bar-2"]') as HTMLElement;
    expect(parseFloat(bar2.style.height)).toBeCloseTo(50, 1);
  });
});
