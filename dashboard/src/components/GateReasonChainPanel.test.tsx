import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { GateReasonChainPanel } from './GateReasonChainPanel';
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

describe('GateReasonChainPanel', () => {
  it('run が0件、またはgateReasonsが全run空なら「データなし」を表示し、行を描画しない', () => {
    render(<GateReasonChainPanel runs={[]} />);
    expect(screen.getByText('データなし（gateReasonsを持つ反復はありません）')).toBeInTheDocument();

    const runs = [makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] })];
    const { container } = render(<GateReasonChainPanel runs={runs} />);
    expect(within(container).getByText('データなし（gateReasonsを持つ反復はありません）')).toBeInTheDocument();
    expect(container.querySelector('[data-testid^="gate-reason-chain-row-"]')).toBeNull();
  });

  it('gateReasonsを持つ反復だけを新しい順に行として表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] }),
      makeRun({
        iteration: 2,
        issue: { number: 5, title: 't', labels: [] },
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
      }),
      makeRun({
        iteration: 3,
        issue: { number: 6, title: 't', labels: [] },
        verdict: 'needs-human',
        gateReasons: ['e2e(Playwright) が失敗している', 'adversary が approve していない'],
      }),
    ];
    const { container } = render(<GateReasonChainPanel runs={runs} />);

    expect(container.querySelector('[data-testid="gate-reason-chain-row-1"]')).toBeNull();
    const row3 = container.querySelector('[data-testid="gate-reason-chain-row-3"]');
    const row2 = container.querySelector('[data-testid="gate-reason-chain-row-2"]');
    expect(row3).not.toBeNull();
    expect(row2).not.toBeNull();
    expect(row3?.textContent).toContain('issue #6');
    expect(row3?.getAttribute('data-verdict')).toBe('needs-human');

    // 新しい順（iteration降順）でDOMに並ぶ
    const rows = container.querySelectorAll('[data-testid^="gate-reason-chain-row-"]');
    expect(rows[0].getAttribute('data-testid')).toBe('gate-reason-chain-row-3');
    expect(rows[1].getAttribute('data-testid')).toBe('gate-reason-chain-row-2');
  });

  it('1反復内の複数カテゴリを連鎖として表示し、重複カテゴリはまとめる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: [
          'e2e(Playwright) が失敗している',
          'adversary が approve していない',
          'adversary が approve していない',
        ],
      }),
    ];
    const { container } = render(<GateReasonChainPanel runs={runs} />);
    const row = container.querySelector('[data-testid="gate-reason-chain-row-1"]');
    expect(row?.querySelector('[data-testid="gate-reason-chain-category-1-e2eFailed"]')).not.toBeNull();
    expect(row?.querySelector('[data-testid="gate-reason-chain-category-1-adversaryNotApproved"]')).not.toBeNull();
    // 重複除去されているので "adversary未承認" の要素は1つだけ
    expect(row?.querySelectorAll('[data-testid="gate-reason-chain-category-1-adversaryNotApproved"]')).toHaveLength(
      1,
    );
  });

  it('ヘッダにパス件数を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
    ];
    const { container } = render(<GateReasonChainPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="gate-reason-chain-panel"]');
    expect(panel?.textContent).toContain('2パス');
  });

  it('adversaryの応答が構造化できず技術的に棄却された反復は、内容を読んで却下したパスと別カテゴリとして描画される', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: 'adversary の出力を解釈できないため棄却として扱う' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: '既存の挙動を壊している' },
      }),
    ];
    const { container } = render(<GateReasonChainPanel runs={runs} />);

    const row1 = container.querySelector('[data-testid="gate-reason-chain-row-1"]');
    const row2 = container.querySelector('[data-testid="gate-reason-chain-row-2"]');
    expect(row1?.querySelector('[data-testid="gate-reason-chain-category-1-adversaryUnparseable"]')).not.toBeNull();
    expect(row1?.querySelector('[data-testid="gate-reason-chain-category-1-adversaryNotApproved"]')).toBeNull();
    expect(row2?.querySelector('[data-testid="gate-reason-chain-category-2-adversaryNotApproved"]')).not.toBeNull();
    expect(row2?.querySelector('[data-testid="gate-reason-chain-category-2-adversaryUnparseable"]')).toBeNull();
    expect(row1?.textContent).toContain('adversary出力解析不能');
  });
});
