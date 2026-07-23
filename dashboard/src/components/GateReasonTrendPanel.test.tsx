import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GateReasonTrendPanel } from './GateReasonTrendPanel';
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

function gateRun(iteration: number, gateReasons: string[]) {
  return makeRun({ iteration, verdict: 'abandoned', gateReasons });
}

const CL = '変更行数 500 が上限 400 を超えている';
const E2E = 'e2e(Playwright) が失敗している';
const ADV = 'adversary が approve していない';

describe('GateReasonTrendPanel', () => {
  it('比較対象の反復が不足している場合は判定不能メッセージを表示し、行を描画しない', () => {
    const { container } = render(<GateReasonTrendPanel runs={[]} />);
    expect(container.textContent).toContain('まだ判定できません');
    expect(container.querySelector('[data-testid^="gate-reason-trend-row-"]')).toBeNull();
  });

  it('全カテゴリ横ばいのときは行を描画せず「全カテゴリで有意な変化なし」を表示する', () => {
    const runs = [gateRun(1, [E2E]), gateRun(2, [E2E]), gateRun(3, [E2E]), gateRun(4, [E2E]), gateRun(5, [E2E]), gateRun(6, [E2E])];
    const { container } = render(<GateReasonTrendPanel runs={runs} />);
    expect(screen.getByTestId('gate-reason-trend-all-flat')).toBeInTheDocument();
    expect(container.querySelector('[data-testid^="gate-reason-trend-row-"]')).toBeNull();
  });

  it('悪化/改善しているカテゴリだけを変化幅の大きい順に表示し、横ばいカテゴリは表示しない', () => {
    const runs = [
      // 直前window(1-3): adversaryNotApproved 0件/反復、changedLinesExceeded 1件/反復、e2eFailed 1件/反復(横ばい)
      gateRun(1, [E2E, CL]),
      gateRun(2, [E2E, CL]),
      gateRun(3, [E2E, CL]),
      // 直近window(4-6): adversaryNotApproved 1件/反復(悪化, delta=1)、changedLinesExceeded 3件/反復(悪化, delta=2)、e2eFailed 1件/反復(横ばい)
      gateRun(4, [E2E, ADV, CL, CL, CL]),
      gateRun(5, [E2E, ADV, CL, CL, CL]),
      gateRun(6, [E2E, ADV, CL, CL, CL]),
    ];
    const { container } = render(<GateReasonTrendPanel runs={runs} />);

    // e2eFailed は横ばいなので行が無い
    expect(container.querySelector('[data-testid="gate-reason-trend-row-e2eFailed"]')).toBeNull();

    // changedLinesExceeded(delta=2) の方が adversaryNotApproved(delta=1) より変化幅が大きいので先に並ぶ
    const rows = Array.from(container.querySelectorAll('[data-testid^="gate-reason-trend-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'gate-reason-trend-row-changedLinesExceeded',
      'gate-reason-trend-row-adversaryNotApproved',
    ]);
    expect(rows.every((r) => r.getAttribute('data-direction') === 'worsening')).toBe(true);

    const delta = screen.getByTestId('gate-reason-trend-delta-changedLinesExceeded');
    expect(delta.textContent).toContain('悪化傾向');
    expect(delta.textContent).toContain('1.0 → 3.0件/反復');
  });

  it('データ不足でwindowが縮小されたときは partial 注記を表示する', () => {
    const runs = [gateRun(1, [ADV]), gateRun(2, [E2E]), gateRun(3, [CL])];
    const { container } = render(<GateReasonTrendPanel runs={runs} />);
    expect(container.textContent).toContain('データ不足のため window 未満の反復数で計算');
  });
});
