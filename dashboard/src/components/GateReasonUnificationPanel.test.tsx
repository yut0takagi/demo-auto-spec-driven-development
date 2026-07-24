import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import { GateReasonUnificationPanel } from './GateReasonUnificationPanel';
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

describe('GateReasonUnificationPanel', () => {
  it('runが0件、または連続2反復以上のstreakが無いなら「データなし」を表示し、行を描画しない', () => {
    const { container: emptyContainer } = render(<GateReasonUnificationPanel runs={[]} />);
    expect(
      within(emptyContainer).getByText('データなし（gateReasonsを持つ反復が2回以上連続した区間はありません）'),
    ).toBeInTheDocument();

    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 3, verdict: 'merged', gateReasons: [] }),
    ];
    const { container } = render(<GateReasonUnificationPanel runs={runs} />);
    expect(
      within(container).getByText('データなし（gateReasonsを持つ反復が2回以上連続した区間はありません）'),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-testid^="gate-reason-unification-streak-"]')).toBeNull();
  });

  it('streak全体で同じ根本原因が続く場合は「最初から単一原因」と表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 3, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
    ];
    const { container } = render(<GateReasonUnificationPanel runs={runs} />);
    const row = container.querySelector('[data-testid="gate-reason-unification-streak-1-3"]');
    expect(row).not.toBeNull();
    expect(row?.getAttribute('data-pattern')).toBe('unified-from-start');
    expect(row?.textContent).toContain('最初から単一原因');
    expect(row?.textContent).toContain('最初から一貫してe2e失敗が原因（3反復）');
    expect(container.querySelector('[data-testid="gate-reason-unification-panel"]')?.textContent).toContain(
      '1区間中1区間が単一原因化',
    );
  });

  it('前半で原因が入れ替わり末尾2反復以上が同じ原因に収束する場合は「単一原因に収束」と表示し、収束開始反復と持続反復数を示す', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
      }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
      }),
    ];
    const { container } = render(<GateReasonUnificationPanel runs={runs} />);
    const row = container.querySelector('[data-testid="gate-reason-unification-streak-1-3"]');
    expect(row?.getAttribute('data-pattern')).toBe('converged');
    expect(row?.textContent).toContain('単一原因に収束');
    expect(row?.textContent).toContain('#2以降、verify失敗に収束（2反復持続）');
  });

  it('末尾まで原因が入れ替わり続ける場合は「収束せず」と表示し、複数区間を新しい区間から一覧表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
      }),
      makeRun({ iteration: 3, verdict: 'paused', gateReasons: [] }),
      makeRun({ iteration: 4, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 5, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
    ];
    const { container } = render(<GateReasonUnificationPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="gate-reason-unification-panel"]');
    expect(panel?.textContent).toContain('2区間中1区間が単一原因化');

    const rows = container.querySelectorAll('[data-testid^="gate-reason-unification-streak-"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-testid')).toBe('gate-reason-unification-streak-4-5');
    expect(rows[1].getAttribute('data-testid')).toBe('gate-reason-unification-streak-1-2');

    const notUnifiedRow = container.querySelector('[data-testid="gate-reason-unification-streak-1-2"]');
    expect(notUnifiedRow?.getAttribute('data-pattern')).toBe('not-unified');
    expect(notUnifiedRow?.textContent).toContain('収束せず: 最後まで原因が入れ替わり続けた');
  });

  it('adversary.summary が技術的棄却の文言(adversaryUnparseable)のときは、reasonが同じ「adversary が approve していない」でも adversary未承認とは別ラベルで表示し、そこへ収束したことを示す', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: '要件を満たしていない実装のため却下' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: 'adversary の出力を解釈できないため棄却として扱う' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: 'adversary の出力を解釈できないため棄却として扱う' },
      }),
    ];
    const { container } = render(<GateReasonUnificationPanel runs={runs} />);
    const row = container.querySelector('[data-testid="gate-reason-unification-streak-1-3"]');
    expect(row).not.toBeNull();
    expect(row?.getAttribute('data-pattern')).toBe('converged');
    expect(row?.textContent).toContain('adversary未承認');
    expect(row?.textContent).toContain('adversary出力解析不能');
    expect(row?.textContent).toContain('#2以降、adversary出力解析不能に収束（2反復持続）');
  });
});
