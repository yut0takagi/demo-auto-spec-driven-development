import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BreakerRunwayPanel } from './BreakerRunwayPanel';
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

describe('BreakerRunwayPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<BreakerRunwayPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="breaker-runway-panel"]')).toBeNull();
  });

  it('全件 merged なら streak 0・remaining は threshold と同じ・平常表示になる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'merged' }),
    ];
    const { container } = render(<BreakerRunwayPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="breaker-runway-panel"]');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('data-tripped')).toBe('false');

    expect(container.querySelector('[data-testid="breaker-runway-remaining"]')?.textContent).toBe('3');
    expect(container.querySelector('[data-testid="breaker-runway-status"]')?.textContent).toContain('平常');

    // 3スロット全てが未消費（emerald 系）
    for (let i = 0; i < 3; i++) {
      const slot = container.querySelector(`[data-testid="breaker-runway-slot-${i}"]`);
      expect(slot?.getAttribute('data-consumed')).toBe('false');
    }
    // 連続が無いので対象iteration注記は表示されない
    expect(panel?.textContent).not.toContain('対象iteration');
  });

  it('連続失敗が1回だけの状態では、消費済みスロットが1つだけ rose になる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
    ];
    const { container } = render(<BreakerRunwayPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="breaker-runway-panel"]');
    expect(panel?.getAttribute('data-tripped')).toBe('false');
    expect(container.querySelector('[data-testid="breaker-runway-remaining"]')?.textContent).toBe('2');

    const slot0 = container.querySelector('[data-testid="breaker-runway-slot-0"]');
    const slot1 = container.querySelector('[data-testid="breaker-runway-slot-1"]');
    const slot2 = container.querySelector('[data-testid="breaker-runway-slot-2"]');
    expect(slot0?.getAttribute('data-consumed')).toBe('false');
    expect(slot1?.getAttribute('data-consumed')).toBe('false');
    expect(slot2?.getAttribute('data-consumed')).toBe('true');
    expect(slot2?.className).toContain('bg-rose-400');

    expect(panel?.textContent).toContain('対象iteration: 2');
  });

  it('残り1回まで詰まると amber の警告表示になる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'needs-human' }),
    ];
    const { container } = render(<BreakerRunwayPanel runs={runs} />);
    const status = container.querySelector('[data-testid="breaker-runway-status"]');
    expect(status?.textContent).toContain('残り僅か');
    expect(status?.className).toContain('text-amber-400');
    expect(container.querySelector('[data-testid="breaker-runway-remaining"]')?.textContent).toBe('1');
  });

  it('連続が閾値に達すると発火条件成立の rose 表示になり、remaining は 0', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'needs-human' }),
      makeRun({ iteration: 3, verdict: 'abandoned' }),
    ];
    const { container } = render(<BreakerRunwayPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="breaker-runway-panel"]');
    expect(panel?.getAttribute('data-tripped')).toBe('true');

    const status = container.querySelector('[data-testid="breaker-runway-status"]');
    expect(status?.textContent).toContain('発火条件成立');
    expect(status?.className).toContain('text-rose-400');

    const remaining = container.querySelector('[data-testid="breaker-runway-remaining"]');
    expect(remaining?.textContent).toBe('0');
    expect(remaining?.className).toContain('text-rose-400');

    // 全スロットが消費済み
    for (let i = 0; i < 3; i++) {
      expect(
        container.querySelector(`[data-testid="breaker-runway-slot-${i}"]`)?.getAttribute('data-consumed'),
      ).toBe('true');
    }
    expect(panel?.textContent).toContain('この時点でブレーカが発火し');
    expect(panel?.textContent).toContain('対象iteration: 1, 2, 3');
  });

  it('paused は連続をリセットするため、直前に失敗が続いていても平常表示に戻る', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'paused' }),
    ];
    const { container } = render(<BreakerRunwayPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="breaker-runway-panel"]');
    expect(panel?.getAttribute('data-tripped')).toBe('false');
    expect(container.querySelector('[data-testid="breaker-runway-remaining"]')?.textContent).toBe('3');
    expect(panel?.textContent).not.toContain('対象iteration');
  });
});
