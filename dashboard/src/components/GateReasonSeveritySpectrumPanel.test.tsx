import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GateReasonSeveritySpectrumPanel } from './GateReasonSeveritySpectrumPanel';
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

describe('GateReasonSeveritySpectrumPanel', () => {
  it('run が0件、またはgateReasonsが全run空なら「データなし」を表示し、パネル本体を描画しない', () => {
    render(<GateReasonSeveritySpectrumPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();

    const runs = [makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] })];
    const { container } = render(<GateReasonSeveritySpectrumPanel runs={runs} />);
    expect(screen.getAllByText('データなし').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="gate-reason-severity-spectrum-panel"]')).toBeNull();
  });

  it('全runがabandonedなカテゴリは深刻度スコア2.00（中間）でバーが50%幅になる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['変更行数 500 が上限 400 を超えている'],
        cost: { builderUsd: 0.2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.2 },
      }),
    ];
    const { container } = render(<GateReasonSeveritySpectrumPanel runs={runs} />);

    const score = container.querySelector('[data-testid="severity-spectrum-score-changedLinesExceeded"]');
    expect(score?.textContent).toBe('深刻度 2.00（平均$0.20 / 1反復）');

    const bar = container.querySelector('[data-testid="severity-spectrum-bar-changedLinesExceeded"]') as HTMLElement;
    // (2 - 1) / (3 - 1) * 100 = 50%
    expect(parseFloat(bar.style.width)).toBeCloseTo(50, 2);

    const tier = container.querySelector(
      '[data-testid="severity-spectrum-tier-changedLinesExceeded-abandoned"]',
    );
    expect(tier?.textContent).toBe('見送り（自動）1反復 / 平均$0.20 / revise平均0.0回');
  });

  it('failedのみのカテゴリはバーが100%幅、needs-humanのみは0%幅になり、深刻度降順で並ぶ', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'needs-human',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: '既存の挙動を壊している' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'failed',
        gateReasons: ['反復が例外で異常終了した: boom'],
      }),
    ];
    const { container } = render(<GateReasonSeveritySpectrumPanel runs={runs} />);

    const rows = Array.from(container.querySelectorAll('[data-testid^="severity-spectrum-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'severity-spectrum-row-crashed',
      'severity-spectrum-row-adversaryNotApproved',
    ]);

    const crashedBar = container.querySelector('[data-testid="severity-spectrum-bar-crashed"]') as HTMLElement;
    const needsHumanBar = container.querySelector(
      '[data-testid="severity-spectrum-bar-adversaryNotApproved"]',
    ) as HTMLElement;
    expect(parseFloat(crashedBar.style.width)).toBeCloseTo(100, 2);
    expect(parseFloat(needsHumanBar.style.width)).toBeCloseTo(0, 2);
  });

  it('同一カテゴリが複数verdictにまたがる場合、tier別の内訳を全て表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'failed',
        gateReasons: ['反復が例外で異常終了した: boom'],
        cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['反復が例外で異常終了した: boom2'],
        reviseCycles: 2,
        cost: { builderUsd: 0.4, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.4 },
      }),
    ];
    const { container } = render(<GateReasonSeveritySpectrumPanel runs={runs} />);

    const tiers = Array.from(container.querySelectorAll('[data-testid^="severity-spectrum-tier-crashed-"]'));
    expect(tiers.map((t) => t.getAttribute('data-testid'))).toEqual([
      'severity-spectrum-tier-crashed-failed',
      'severity-spectrum-tier-crashed-abandoned',
    ]);
    expect(tiers[0].textContent).toBe('異常終了1反復 / 平均$1.00 / revise平均0.0回');
    expect(tiers[1].textContent).toBe('見送り（自動）1反復 / 平均$0.40 / revise平均2.0回');
  });
});
