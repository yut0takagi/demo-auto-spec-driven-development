import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VerdictTransitionRootCausePanel } from './VerdictTransitionRootCausePanel';
import type { RunRecord } from '@/lib/types';

const VERIFY_FAILED = 'verify(lint/typecheck/unit/build) が失敗している';
const E2E_FAILED = 'e2e(Playwright) が失敗している';

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

describe('VerdictTransitionRootCausePanel', () => {
  it('隣接ペアが無い、またはsustainedSuccessのみ(merged同士)でgateReasonsが無ければ「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<VerdictTransitionRootCausePanel runs={[makeRun({ iteration: 1 })]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="verdict-transition-root-cause-panel"]')).toBeNull();

    const sustainedOnly = [makeRun({ iteration: 1, verdict: 'merged' }), makeRun({ iteration: 2, verdict: 'merged' })];
    const { container: c2 } = render(<VerdictTransitionRootCausePanel runs={sustainedOnly} />);
    expect(c2.textContent).toContain('データなし');
  });

  it('regressed/repeatedFailure/shiftedFailureはtoのgateReasonsから、recoveredはfromのgateReasonsから根本原因を求め、種別ごとに件数・割合を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed', gateReasons: [VERIFY_FAILED] }), // 1→2: regressed / verifyFailed
      makeRun({ iteration: 3, verdict: 'merged' }), // 2→3: recovered / verifyFailed(from iter2の原因)
    ];
    const { container } = render(<VerdictTransitionRootCausePanel runs={runs} />);
    const panel = container.querySelector('[data-testid="verdict-transition-root-cause-panel"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('2種別');

    expect(container.querySelector('[data-testid="verdict-transition-root-cause-total-regressed"]')?.textContent).toBe(
      '1件',
    );
    expect(
      container.querySelector('[data-testid="verdict-transition-root-cause-rate-regressed-verifyFailed"]')?.textContent,
    ).toBe('1件 (100.0%)');
    expect(
      container.querySelector('[data-testid="verdict-transition-root-cause-rate-recovered-verifyFailed"]')?.textContent,
    ).toBe('1件 (100.0%)');
  });

  it('paused/dry-runが関わる遷移はgateReasonsが空のため根本原因を特定できず、その遷移分は集計に含めない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'paused', gateReasons: [] }), // regressed だが根本原因不明
      makeRun({ iteration: 3, verdict: 'failed', gateReasons: [E2E_FAILED] }), // paused→failed: shiftedFailure / e2eFailed
    ];
    const { container } = render(<VerdictTransitionRootCausePanel runs={runs} />);
    // regressed(1→2)はpausedのgateReasonsが空のため対象外。shiftedFailure(2→3)のみ現れる
    expect(container.querySelector('[data-testid="verdict-transition-root-cause-row-regressed"]')).toBeNull();
    const shiftedRow = container.querySelector('[data-testid="verdict-transition-root-cause-row-shiftedFailure"]');
    expect(shiftedRow?.textContent).toContain('不通過の型が変化');
    expect(
      container.querySelector('[data-testid="verdict-transition-root-cause-rate-shiftedFailure-e2eFailed"]')
        ?.textContent,
    ).toBe('1件 (100.0%)');
  });

  it('同じkind内で複数の根本原因があるときcount降順でセルを並べる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed', gateReasons: [E2E_FAILED] }),
      makeRun({ iteration: 3, verdict: 'merged' }),
      makeRun({ iteration: 4, verdict: 'failed', gateReasons: [VERIFY_FAILED] }),
      makeRun({ iteration: 5, verdict: 'merged' }),
      makeRun({ iteration: 6, verdict: 'failed', gateReasons: [VERIFY_FAILED] }),
    ];
    const { container } = render(<VerdictTransitionRootCausePanel runs={runs} />);
    const row = container.querySelector('[data-testid="verdict-transition-root-cause-row-regressed"]');
    const cellOrder = Array.from(
      row!.querySelectorAll('[data-testid^="verdict-transition-root-cause-cell-regressed-"]'),
    ).map((el) => el.getAttribute('data-testid'));
    expect(cellOrder).toEqual([
      'verdict-transition-root-cause-cell-regressed-verifyFailed',
      'verdict-transition-root-cause-cell-regressed-e2eFailed',
    ]);
  });
});
