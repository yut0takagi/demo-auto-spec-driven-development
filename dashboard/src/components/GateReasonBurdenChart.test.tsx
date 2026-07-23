import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GateReasonBurdenChart } from './GateReasonBurdenChart';
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

describe('GateReasonBurdenChart', () => {
  it('run が0件、またはgateReasonsが全run空なら「データなし」を表示し、チャート本体を描画しない', () => {
    render(<GateReasonBurdenChart runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();

    const runs = [makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] })];
    const { container } = render(<GateReasonBurdenChart runs={runs} />);
    expect(screen.getAllByText('データなし').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="gate-reason-burden-chart"]')).toBeNull();
  });

  it('gateReasonsが空の反復（merged/paused）は列を持たない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] }),
      makeRun({ iteration: 2, verdict: 'paused', gateReasons: [] }),
      makeRun({ iteration: 3, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
    ];
    const { container } = render(<GateReasonBurdenChart runs={runs} />);
    expect(container.querySelector('[data-testid="gate-reason-burden-column-1"]')).toBeNull();
    expect(container.querySelector('[data-testid="gate-reason-burden-column-2"]')).toBeNull();
    expect(container.querySelector('[data-testid="gate-reason-burden-column-3"]')).not.toBeNull();
  });

  it('積み上げ棒の座標が「最大合計に対する比率」で正確に計算される（下から積む・カテゴリ順）', () => {
    // iteration1: e2eFailed x2 (total=2, このデータ内の最大値)
    // iteration2: adversaryNotApproved x1 (total=1)
    // iteration3: adversaryNotApproved x1 + changedLinesExceeded x1 (total=2)
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['e2e(Playwright) が失敗している', 'e2e(Playwright) が失敗している'],
      }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない', '変更行数 500 が上限 400 を超えている'],
      }),
    ];
    const { container } = render(<GateReasonBurdenChart runs={runs} />);
    // height=200, pad=24 → plotHeight=152, bottom(y for value=0)=176, top(y for maxTotal=2)=24

    // iteration1: e2eFailed が唯一のカテゴリで maxTotal(2)を占めるため、
    // プロット全高(152)を使い、下端176・上端24ぴったりに一致する。
    const bar1 = container.querySelector('[data-testid="gate-reason-burden-bar-1-e2eFailed"]') as SVGRectElement;
    expect(bar1).not.toBeNull();
    expect(parseFloat(bar1.getAttribute('y')!)).toBeCloseTo(24, 1);
    expect(parseFloat(bar1.getAttribute('height')!)).toBeCloseTo(152, 1);

    // iteration2: adversaryNotApproved count=1, maxTotal=2 → 半分の高さ(76)、
    // 下端176から積むので y=100。
    const bar2 = container.querySelector(
      '[data-testid="gate-reason-burden-bar-2-adversaryNotApproved"]',
    ) as SVGRectElement;
    expect(parseFloat(bar2.getAttribute('y')!)).toBeCloseTo(100, 1);
    expect(parseFloat(bar2.getAttribute('height')!)).toBeCloseTo(76, 1);

    // iteration3: adversaryNotApproved (CATEGORY_ORDER で先) が下段(y=100,height=76)、
    // changedLinesExceeded がその上に積まれ、上端(y=24)まで届く(height=76)。
    const bar3a = container.querySelector(
      '[data-testid="gate-reason-burden-bar-3-adversaryNotApproved"]',
    ) as SVGRectElement;
    const bar3b = container.querySelector(
      '[data-testid="gate-reason-burden-bar-3-changedLinesExceeded"]',
    ) as SVGRectElement;
    expect(parseFloat(bar3a.getAttribute('y')!)).toBeCloseTo(100, 1);
    expect(parseFloat(bar3a.getAttribute('height')!)).toBeCloseTo(76, 1);
    expect(parseFloat(bar3b.getAttribute('y')!)).toBeCloseTo(24, 1);
    expect(parseFloat(bar3b.getAttribute('height')!)).toBeCloseTo(76, 1);

    // count=0のカテゴリは描画されない
    expect(container.querySelector('[data-testid="gate-reason-burden-bar-1-noChanges"]')).toBeNull();
    expect(container.querySelector('[data-testid="gate-reason-burden-bar-2-e2eFailed"]')).toBeNull();
  });

  it('ヘッダに最新iterationの合計件数を表示し、対象iterationを昇順で列挙する', () => {
    const runs = [
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['e2e(Playwright) が失敗している', 'e2e(Playwright) が失敗している'],
      }),
    ];
    const { container } = render(<GateReasonBurdenChart runs={runs} />);
    const chart = container.querySelector('[data-testid="gate-reason-burden-chart"]');
    expect(chart?.textContent).toContain('直近iteration 2: 1件');
    const iterations = container.querySelector('[data-testid="gate-reason-burden-iterations"]');
    expect(iterations?.textContent).toContain('対象iteration: 1, 2');
  });
});
