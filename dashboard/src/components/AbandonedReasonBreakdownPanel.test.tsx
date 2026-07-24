import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AbandonedReasonBreakdownPanel } from './AbandonedReasonBreakdownPanel';
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

describe('AbandonedReasonBreakdownPanel', () => {
  it('runsが0件なら「データなし」を表示し、パネル本体（data-testid付き要素）を描画しない', () => {
    const { container } = render(<AbandonedReasonBreakdownPanel runs={[]} />);
    expect(screen.getByText('データなし（abandonedになった反復はありません）')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="abandoned-reason-breakdown-panel"]')).toBeNull();
  });

  it('abandonedが1件も無ければ、他verdictが混在していても「データなし」を表示する（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed', gateReasons: ['反復が例外で異常終了した: boom'] }),
    ];
    const { container } = render(<AbandonedReasonBreakdownPanel runs={runs} />);
    expect(screen.getByText('データなし（abandonedになった反復はありません）')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="abandoned-reason-breakdown-panel"]')).toBeNull();
  });

  it('abandonedのみをカテゴリ別に集計し、failed/mergedのgateReasonsを混ぜずに件数・割合・対象iterationを表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['変更行数 500 が上限 400 を超えている'],
      }),
      // failed のカテゴリ(crashed)が紛れ込んでいないことを検証するための混入データ
      makeRun({ iteration: 4, verdict: 'failed', gateReasons: ['反復が例外で異常終了した: boom'] }),
    ];
    const { container } = render(<AbandonedReasonBreakdownPanel runs={runs} />);

    const panel = container.querySelector('[data-testid="abandoned-reason-breakdown-panel"]');
    expect(panel?.textContent).toContain('3件');

    const adversaryCount = container.querySelector('[data-testid="abandoned-reason-count-adversaryNotApproved"]');
    expect(adversaryCount?.textContent).toBe('2件 (66.7%)');

    const linesCount = container.querySelector('[data-testid="abandoned-reason-count-changedLinesExceeded"]');
    expect(linesCount?.textContent).toBe('1件 (33.3%)');

    const adversaryRow = container.querySelector('[data-testid="abandoned-reason-row-adversaryNotApproved"]');
    expect(adversaryRow?.textContent).toContain('対象iteration: 1, 2');

    expect(container.querySelector('[data-testid="abandoned-reason-row-crashed"]')).toBeNull();

    const adversaryBar = container.querySelector(
      '[data-testid="abandoned-reason-bar-adversaryNotApproved"]',
    ) as HTMLElement;
    expect(parseFloat(adversaryBar.style.width)).toBeCloseTo((2 / 3) * 100, 2);
  });

  it('件数降順で行を並べる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['builder が変更を生成しなかった'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({ iteration: 3, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
    ];
    const { container } = render(<AbandonedReasonBreakdownPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="abandoned-reason-row-"]'));
    expect(rows[0].getAttribute('data-testid')).toBe('abandoned-reason-row-adversaryNotApproved');
    expect(rows[1].getAttribute('data-testid')).toBe('abandoned-reason-row-noChanges');
  });

  it('abandonedで全体より突出して多いカテゴリにoverrepresentedバッジとサマリー文を表示し、そうでないカテゴリはunderrepresented/neutralを表示する', () => {
    const runs = [
      // abandoned: adversaryNotApproved 1件(50%) / crashed 1件(50%)
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['反復が例外で異常終了した: boom'] }),
      // failed側にcrashedを8件足す -> 全体10件中 crashedが9件(90%)、adversaryNotApprovedが1件(10%)
      ...Array.from({ length: 8 }, (_, i) =>
        makeRun({ iteration: 3 + i, verdict: 'failed', gateReasons: ['反復が例外で異常終了した: boom'] }),
      ),
    ];
    const { container } = render(<AbandonedReasonBreakdownPanel runs={runs} />);

    // adversaryNotApproved: abandoned内50% vs 全体10% -> +40pt で overrepresented
    const adversarySignal = container.querySelector('[data-testid="abandoned-reason-signal-adversaryNotApproved"]');
    expect(adversarySignal?.textContent).toBe('全体より突出 (+40.0pt)');

    // crashed: abandoned内50% vs 全体90% -> -40pt で underrepresented
    const crashedSignal = container.querySelector('[data-testid="abandoned-reason-signal-crashed"]');
    expect(crashedSignal?.textContent).toBe('全体より少ない (-40.0pt)');

    // 最も突出したカテゴリ(adversaryNotApproved)のサマリー文が表示される
    const summary = container.querySelector('[data-testid="abandoned-reason-top-overrepresented"]');
    expect(summary?.textContent).toContain('adversary未承認');
    expect(summary?.textContent).toContain('+40.0pt');
  });

  it('abandonedしか無くgateReasonsを持つ他反復が無ければ、全カテゴリがneutralでサマリー文は表示されない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['変更行数 500 が上限 400 を超えている'],
      }),
    ];
    const { container } = render(<AbandonedReasonBreakdownPanel runs={runs} />);

    const signals = Array.from(container.querySelectorAll('[data-testid^="abandoned-reason-signal-"]'));
    expect(signals).toHaveLength(2);
    for (const s of signals) {
      expect(s.textContent).toContain('全体と同程度 (+0.0pt)');
    }
    expect(container.querySelector('[data-testid="abandoned-reason-top-overrepresented"]')).toBeNull();
  });
});
