import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import { GateReasonRecoveryPanel } from './GateReasonRecoveryPanel';
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

describe('GateReasonRecoveryPanel', () => {
  it('runが0件、または同一理由の連続streakが無いなら「データなし」を表示し、行を描画しない', () => {
    const { container: emptyContainer } = render(<GateReasonRecoveryPanel runs={[]} />);
    expect(
      within(emptyContainer).getByText('データなし（同一理由の不通過が2回以上連続した区間はありません）'),
    ).toBeInTheDocument();

    const notUnified = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
      }),
    ];
    const { container } = render(<GateReasonRecoveryPanel runs={notUnified} />);
    expect(
      within(container).getByText('データなし（同一理由の不通過が2回以上連続した区間はありません）'),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-testid^="gate-reason-recovery-row-"]')).toBeNull();
  });

  it('同一理由の連続の直後にmergedが来た場合は「回復」として、reason・回数・ステップ数を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 3, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 4, verdict: 'merged', gateReasons: [] }),
    ];
    const { container } = render(<GateReasonRecoveryPanel runs={runs} />);
    const row = container.querySelector('[data-testid="gate-reason-recovery-row-1-3"]');
    expect(row).not.toBeNull();
    expect(row?.getAttribute('data-recovered')).toBe('true');
    expect(row?.textContent).toContain('e2e失敗が#1〜#3で3回連続');
    expect(row?.textContent).toContain('#4で回復（4ステップ）');
    expect(
      container.querySelector('[data-testid="gate-reason-recovery-panel"]')?.textContent,
    ).toContain('1件中1件が回復・平均4.0ステップ');
  });

  it('直後がmerged以外（paused）なら「未回復」で、直後の反復番号とverdictを表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 3, verdict: 'paused', gateReasons: [] }),
    ];
    const { container } = render(<GateReasonRecoveryPanel runs={runs} />);
    const row = container.querySelector('[data-testid="gate-reason-recovery-row-1-2"]');
    expect(row?.getAttribute('data-recovered')).toBe('false');
    expect(row?.textContent).toContain('未回復（#3もpaused）');
    expect(
      container.querySelector('[data-testid="gate-reason-recovery-panel"]')?.textContent,
    ).toContain('1件中0件が回復');
    expect(container.querySelector('[data-testid="gate-reason-recovery-panel"]')?.textContent).not.toContain(
      '平均',
    );
  });

  it('データ終端で同一理由の連続が途切れず終わる場合は「継続中」を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
    ];
    const { container } = render(<GateReasonRecoveryPanel runs={runs} />);
    const row = container.querySelector('[data-testid="gate-reason-recovery-row-1-2"]');
    expect(row?.textContent).toContain('未回復（データ終端。継続中）');
  });

  it('複数区間を新しい区間から一覧表示し、平均ステップ数は回復した区間のみで算出する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 3, verdict: 'merged', gateReasons: [] }),
      makeRun({
        iteration: 4,
        verdict: 'abandoned',
        gateReasons: ['変更行数 501 が上限 400 を超えている'],
      }),
      makeRun({
        iteration: 5,
        verdict: 'abandoned',
        gateReasons: ['変更行数 420 が上限 400 を超えている'],
      }),
      makeRun({
        iteration: 6,
        verdict: 'abandoned',
        gateReasons: ['変更行数 410 が上限 400 を超えている'],
      }),
      makeRun({ iteration: 7, verdict: 'merged', gateReasons: [] }),
    ];
    const { container } = render(<GateReasonRecoveryPanel runs={runs} />);
    const rows = container.querySelectorAll('[data-testid^="gate-reason-recovery-row-"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-testid')).toBe('gate-reason-recovery-row-4-6');
    expect(rows[1].getAttribute('data-testid')).toBe('gate-reason-recovery-row-1-2');

    // 区間1(2回連続→3ステップ) と 区間2(3回連続→4ステップ) の平均 = (3+4)/2 = 3.5
    expect(
      container.querySelector('[data-testid="gate-reason-recovery-panel"]')?.textContent,
    ).toContain('2件中2件が回復・平均3.5ステップ');
  });
});
