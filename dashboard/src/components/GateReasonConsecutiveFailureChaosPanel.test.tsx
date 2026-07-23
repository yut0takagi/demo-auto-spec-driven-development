import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import { GateReasonConsecutiveFailureChaosPanel } from './GateReasonConsecutiveFailureChaosPanel';
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

describe('GateReasonConsecutiveFailureChaosPanel', () => {
  it('runが0件、または連続2反復以上のstreakが無いなら「データなし」を表示し、行を描画しない', () => {
    const { container: emptyContainer } = render(<GateReasonConsecutiveFailureChaosPanel runs={[]} />);
    expect(
      within(emptyContainer).getByText('データなし（gateReasonsを持つ反復が2回以上連続した区間はありません）'),
    ).toBeInTheDocument();

    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 3, verdict: 'merged', gateReasons: [] }),
    ];
    const { container } = render(<GateReasonConsecutiveFailureChaosPanel runs={runs} />);
    expect(
      within(container).getByText('データなし（gateReasonsを持つ反復が2回以上連続した区間はありません）'),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-testid^="gate-reason-chaos-streak-"]')).toBeNull();
  });

  it('同じ根本原因が連続するstreakを「固定」として表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
    ];
    const { container } = render(<GateReasonConsecutiveFailureChaosPanel runs={runs} />);
    const row = container.querySelector('[data-testid="gate-reason-chaos-streak-1-2"]');
    expect(row).not.toBeNull();
    expect(row?.getAttribute('data-chaos-level')).toBe('stable');
    expect(row?.textContent).toContain('固定（同じ原因が居座り）');
    expect(row?.textContent).toContain('0%');
    expect(row?.textContent).toContain('#1〜#2（2反復連続）');
    // 根本原因の連鎖表示に矢印区切りでe2e失敗が2回並ぶ
    expect(row?.textContent?.match(/e2e失敗/g)).toHaveLength(3); // 連鎖表示×2 + 最多原因の要約×1
  });

  it('複数区間を新しい区間（endIteration降順）から一覧表示し、mixed/chaoticそれぞれの水準・割合・最多原因を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
      }),
      makeRun({ iteration: 4, verdict: 'merged', gateReasons: [] }),
      makeRun({ iteration: 5, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({
        iteration: 6,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
      }),
    ];
    const { container } = render(<GateReasonConsecutiveFailureChaosPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="gate-reason-consecutive-failure-chaos-panel"]');
    expect(panel?.textContent).toContain('2区間');

    const rows = container.querySelectorAll('[data-testid^="gate-reason-chaos-streak-"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-testid')).toBe('gate-reason-chaos-streak-5-6');
    expect(rows[1].getAttribute('data-testid')).toBe('gate-reason-chaos-streak-1-3');

    const chaoticRow = container.querySelector('[data-testid="gate-reason-chaos-streak-5-6"]');
    expect(chaoticRow?.getAttribute('data-chaos-level')).toBe('chaotic');
    expect(chaoticRow?.textContent).toContain('カオス（毎回原因が変わる）');
    expect(chaoticRow?.textContent).toContain('100%');

    const mixedRow = container.querySelector('[data-testid="gate-reason-chaos-streak-1-3"]');
    expect(mixedRow?.getAttribute('data-chaos-level')).toBe('mixed');
    expect(mixedRow?.textContent).toContain('混在');
    expect(mixedRow?.textContent).toContain('最多の根本原因: e2e失敗（2/3反復）');
  });
});
