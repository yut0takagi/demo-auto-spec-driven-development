import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuilderUtilizationDeclinePanel } from './BuilderUtilizationDeclinePanel';
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

describe('BuilderUtilizationDeclinePanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<BuilderUtilizationDeclinePanel runs={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="builder-utilization-decline-panel"]')).toBeNull();
  });

  it('PRが作られた反復が1件だけなら比較対象が無いため「データなし」を表示する', () => {
    const runs = [makeRun({ iteration: 1, durationSec: 100, prNumber: 1 })];
    const { container } = render(<BuilderUtilizationDeclinePanel runs={runs} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="builder-utilization-decline-panel"]')).toBeNull();
  });

  it('直近1反復だけが明確に逆転していても閾値未満(1回)なら未発報のまま', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, prNumber: 1 }),
      makeRun({ iteration: 2, durationSec: 300, prNumber: 2 }),
    ];
    const { container } = render(<BuilderUtilizationDeclinePanel runs={runs} />);
    const signal = container.querySelector('[data-testid="builder-utilization-decline-signal"]');
    expect(signal?.getAttribute('data-triggered')).toBe('false');
    const status = container.querySelector('[data-testid="builder-utilization-decline-status"]');
    expect(status?.textContent).toContain('未発報');
    expect(status?.className).toContain('text-sky-400');
    const streak = container.querySelector('[data-testid="builder-utilization-decline-streak"]');
    expect(streak?.textContent).toBe('1');
    expect(container.querySelector('[data-testid="builder-utilization-decline-inversion-2"]')).not.toBeNull();
  });

  it('2反復連続で明確に逆転すると発報(rose)し、逆転した各ペアを一覧表示する', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, prNumber: 1 }),
      makeRun({ iteration: 2, durationSec: 200, prNumber: 2 }),
      makeRun({ iteration: 3, durationSec: 400, prNumber: 3 }),
    ];
    const { container } = render(<BuilderUtilizationDeclinePanel runs={runs} />);
    const signal = container.querySelector('[data-testid="builder-utilization-decline-signal"]');
    expect(signal?.getAttribute('data-triggered')).toBe('true');
    const status = container.querySelector('[data-testid="builder-utilization-decline-status"]');
    expect(status?.textContent).toContain('発報');
    expect(status?.className).toContain('text-rose-400');
    const streak = container.querySelector('[data-testid="builder-utilization-decline-streak"]');
    expect(streak?.textContent).toBe('2');

    expect(container.querySelector('[data-testid="builder-utilization-decline-inversion-2"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="builder-utilization-decline-inversion-3"]')).not.toBeNull();
    const inv3 = container.querySelector('[data-testid="builder-utilization-decline-inversion-3"]');
    expect(inv3?.textContent).toContain('#2 → #3');
    expect(inv3?.textContent).toContain('3.3分');
    expect(inv3?.textContent).toContain('6.7分');
  });

  it('直前で逆転しても直近が改善に転じるとstreakは0に戻り、未発報になる（トレイリング判定であること）', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, prNumber: 1 }),
      makeRun({ iteration: 2, durationSec: 300, prNumber: 2 }),
      makeRun({ iteration: 3, durationSec: 600, prNumber: 3 }),
      // 直近は大幅に短縮 → データ終端は逆転していない
      makeRun({ iteration: 4, durationSec: 60, prNumber: 4 }),
    ];
    const { container } = render(<BuilderUtilizationDeclinePanel runs={runs} />);
    const signal = container.querySelector('[data-testid="builder-utilization-decline-signal"]');
    expect(signal?.getAttribute('data-triggered')).toBe('false');
    const streak = container.querySelector('[data-testid="builder-utilization-decline-streak"]');
    expect(streak?.textContent).toBe('0');
    // 過去に逆転が2回あったとしても、末尾が逆転していない以上一覧には出さない
    expect(container.querySelector('[data-testid="builder-utilization-decline-inversion-2"]')).toBeNull();
    expect(container.querySelector('[data-testid="builder-utilization-decline-inversion-3"]')).toBeNull();
    // ただし総逆転数はヘッダに残る
    const panel = container.querySelector('[data-testid="builder-utilization-decline-panel"]');
    expect(panel?.textContent).toContain('逆転 2/3件');
  });

  it('変化が閾値未満(ノイズ)なら逆転として数えず未発報のまま', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, prNumber: 1 }),
      makeRun({ iteration: 2, durationSec: 101, prNumber: 2 }),
      makeRun({ iteration: 3, durationSec: 102, prNumber: 3 }),
    ];
    const { container } = render(<BuilderUtilizationDeclinePanel runs={runs} />);
    const panel = container.querySelector('[data-testid="builder-utilization-decline-panel"]');
    expect(panel?.textContent).toContain('逆転 0/2件');
    const streak = container.querySelector('[data-testid="builder-utilization-decline-streak"]');
    expect(streak?.textContent).toBe('0');
  });

  it('PRが作られなかった反復(prNumber: null)は逆転判定の母集団から除外される', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, prNumber: 1 }),
      // 極端な値だが prNumber: null なので無視されるはず
      makeRun({ iteration: 2, durationSec: 99999, prNumber: null, verdict: 'failed' }),
      makeRun({ iteration: 3, durationSec: 100, prNumber: 3 }),
    ];
    const { container } = render(<BuilderUtilizationDeclinePanel runs={runs} />);
    const panel = container.querySelector('[data-testid="builder-utilization-decline-panel"]');
    expect(panel?.textContent).toContain('逆転 0/1件');
  });
});
