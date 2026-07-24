import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AbandonedIterationsPanel } from './AbandonedIterationsPanel';
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

describe('AbandonedIterationsPanel', () => {
  it('run が0件、またはabandonedが1件も無ければ「データなし」を表示し、パネル本体を描画しない', () => {
    const first = render(<AbandonedIterationsPanel runs={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    first.unmount();

    const runs = [makeRun({ iteration: 1, verdict: 'merged' }), makeRun({ iteration: 2, verdict: 'failed' })];
    const { container } = render(<AbandonedIterationsPanel runs={runs} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="abandoned-iterations-panel"]')).toBeNull();
  });

  it('サマリー指標（件数・累積見送り率・浪費コスト・平均revise回数・最多不通過理由）を正確な値で表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        issue: { number: 20, title: 'issue A', labels: [] },
        reviseCycles: 2,
        cost: { builderUsd: 0.1, adversaryUsd: 0.02, ideationUsd: 0, totalUsd: 0.12 },
        gateReasons: ['adversary が approve していない'],
      }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        issue: { number: 21, title: 'issue B', labels: [] },
        reviseCycles: 4,
        cost: { builderUsd: 0.2, adversaryUsd: 0.03, ideationUsd: 0, totalUsd: 0.23 },
        gateReasons: ['adversary が approve していない'],
      }),
    ];
    const { container } = render(<AbandonedIterationsPanel runs={runs} />);

    expect(container.querySelector('[data-testid="abandoned-count"]')?.textContent).toBe('2件');
    // 3反復中、2,3反復目がabandoned: 累積率は最終点 2/3*100
    expect(container.querySelector('[data-testid="abandoned-latest-rate"]')?.textContent).toBe('66.7%');
    expect(container.querySelector('[data-testid="abandoned-total-cost"]')?.textContent).toBe('$0.35');
    expect(container.querySelector('[data-testid="abandoned-avg-revise"]')?.textContent).toBe('3.0');
    expect(container.querySelector('[data-testid="abandoned-top-reason"]')?.textContent).toBe(
      'adversary未承認 (2件)',
    );
  });

  it('abandoned反復ごとの行を新しい反復から順に表示し、issue番号・タイトル・gateReasonsを含む', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        issue: { number: 10, title: '古い見送り', labels: [] },
        gateReasons: ['builder が変更を生成しなかった'],
      }),
      makeRun({
        iteration: 4,
        verdict: 'abandoned',
        issue: { number: 13, title: '新しい見送り', labels: [] },
        gateReasons: ['e2e(Playwright) が失敗している'],
      }),
    ];
    const { container } = render(<AbandonedIterationsPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="abandoned-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['abandoned-row-4', 'abandoned-row-1']);

    const newestRow = container.querySelector('[data-testid="abandoned-row-4"]');
    expect(newestRow?.textContent).toContain('issue #13');
    expect(newestRow?.textContent).toContain('新しい見送り');
    expect(newestRow?.textContent).toContain('e2e(Playwright) が失敗している');

    const oldestRow = container.querySelector('[data-testid="abandoned-row-1"]');
    expect(oldestRow?.textContent).toContain('issue #10');
    expect(oldestRow?.textContent).toContain('builder が変更を生成しなかった');
  });

  it('abandonedが1件も無い他verdictのgateReasonsを最多不通過理由の集計に混ぜない', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'failed',
        gateReasons: ['変更行数 500 が上限 400 を超えている'],
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['builder が変更を生成しなかった'],
      }),
    ];
    const { container } = render(<AbandonedIterationsPanel runs={runs} />);
    expect(container.querySelector('[data-testid="abandoned-top-reason"]')?.textContent).toBe('変更なし (1件)');
    // failed の行はabandoned一覧に出ない
    expect(container.querySelector('[data-testid="abandoned-row-1"]')).toBeNull();
  });
});
