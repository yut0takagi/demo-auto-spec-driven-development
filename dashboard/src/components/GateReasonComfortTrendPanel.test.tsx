import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GateReasonComfortTrendPanel } from './GateReasonComfortTrendPanel';
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

function run(iteration: number, gateReasons: string[]) {
  return makeRun({ iteration, verdict: gateReasons.length === 0 ? 'merged' : 'abandoned', gateReasons });
}

const ADV = 'adversary が approve していない';

describe('GateReasonComfortTrendPanel', () => {
  it('比較対象の反復が不足している場合は判定不能メッセージを表示する', () => {
    const { container } = render(<GateReasonComfortTrendPanel runs={[]} />);
    expect(container.textContent).toContain('まだ判定できません');
    expect(container.querySelector('[data-testid="gate-reason-comfort-trend-delta"]')).toBeNull();
  });

  it('直近が全て快適・直前が全て不快適なら改善傾向ラベルと比率0%→100%を表示する', () => {
    const runs = [run(1, [ADV]), run(2, [ADV]), run(3, [ADV]), run(4, []), run(5, []), run(6, [])];
    const { getByTestId } = render(<GateReasonComfortTrendPanel runs={runs} />);
    const panel = getByTestId('gate-reason-comfort-trend-panel');
    expect(panel).toBeInTheDocument();

    const delta = getByTestId('gate-reason-comfort-trend-delta');
    expect(delta.textContent).toContain('快適化傾向');
    expect(delta.textContent).toContain('0.0%');
    expect(delta.textContent).toContain('100.0%');
    expect(panel.querySelector('[data-direction="improving"]')).not.toBeNull();
  });

  it('直近が全て不快適・直前が全て快適なら悪化傾向ラベルを表示する', () => {
    const runs = [run(1, []), run(2, []), run(3, []), run(4, [ADV]), run(5, [ADV]), run(6, [ADV])];
    const { getByTestId, container } = render(<GateReasonComfortTrendPanel runs={runs} />);
    const delta = getByTestId('gate-reason-comfort-trend-delta');
    expect(delta.textContent).toContain('悪化傾向');
    expect(container.querySelector('[data-direction="worsening"]')).not.toBeNull();
  });

  it('比率の差が閾値未満なら横ばいラベルを表示する', () => {
    const runs = [run(1, []), run(2, []), run(3, [ADV]), run(4, []), run(5, []), run(6, [ADV])];
    const { getByTestId, container } = render(<GateReasonComfortTrendPanel runs={runs} />);
    const delta = getByTestId('gate-reason-comfort-trend-delta');
    expect(delta.textContent).toContain('横ばい');
    expect(container.querySelector('[data-direction="flat"]')).not.toBeNull();
  });

  it('データ不足でwindowが縮小されたときはpartial注記を表示する', () => {
    const runs = [run(1, [ADV]), run(2, []), run(3, [])];
    const { container } = render(<GateReasonComfortTrendPanel runs={runs} />);
    expect(container.textContent).toContain('データ不足のため window 未満の反復数で計算');
  });
});
