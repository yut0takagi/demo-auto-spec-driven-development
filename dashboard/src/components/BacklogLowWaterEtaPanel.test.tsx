import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BacklogLowWaterEtaPanel } from './BacklogLowWaterEtaPanel';
import { IDEATION_LOW_WATER } from '@/lib/aggregate';
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

/** iteration `from`..`to` の run を、各反復 nextIssues 長 `n`（既定0=補充なし）で生成する。 */
function makeRunRange(from: number, to: number, n = 0): RunRecord[] {
  return Array.from({ length: to - from + 1 }, (_, k) =>
    makeRun({ iteration: from + k, nextIssues: Array.from({ length: n }, (_, j) => 1000 * from + k * 10 + j) }),
  );
}

describe('BacklogLowWaterEtaPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<BacklogLowWaterEtaPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="backlog-low-water-eta-panel"]')).toBeNull();
  });

  it('補充が消費を上回り続けている場合は「減少傾向なし」表示になり、ETA値は「—」', () => {
    const { container } = render(<BacklogLowWaterEtaPanel runs={makeRunRange(1, 2, 2)} />);
    const panel = container.querySelector('[data-testid="backlog-low-water-eta-panel"]');
    expect(panel?.getAttribute('data-below-low-water')).toBe('false');
    expect(container.querySelector('[data-testid="backlog-low-water-eta-status"]')?.textContent).toContain(
      '減少傾向なし',
    );
    expect(container.querySelector('[data-testid="backlog-low-water-eta-value"]')?.textContent).toBe('—');
    expect(container.querySelector('[data-testid="backlog-low-water-eta-balance"]')?.textContent).toBe(
      String(IDEATION_LOW_WATER + 2),
    );
  });

  it('残量が既に low_water 以下なら rose の「低水位に到達済み」表示になり、ETAは0', () => {
    const { container } = render(<BacklogLowWaterEtaPanel runs={makeRunRange(1, 1)} />);
    const panel = container.querySelector('[data-testid="backlog-low-water-eta-panel"]');
    expect(panel?.getAttribute('data-below-low-water')).toBe('true');

    const status = container.querySelector('[data-testid="backlog-low-water-eta-status"]');
    expect(status?.textContent).toContain('低水位に到達済み');
    expect(status?.className).toContain('text-rose-400');

    const value = container.querySelector('[data-testid="backlog-low-water-eta-value"]');
    expect(value?.textContent).toBe('0');
    expect(value?.className).toContain('text-rose-400');

    expect(panel?.textContent).toContain('既に下回っている');
    expect(panel?.textContent).toContain('対象iteration: 1');
  });

  it('low_water まで距離があり、ETAがwatch閾値より大きければ平常(emerald)表示になる', () => {
    // 余剰区間(1-10, net+2): 6+10*2=26。直近window(11-15, net-1): 26-5=21。ETA=(21-6)/1=15
    const runs = [...makeRunRange(1, 10, 3), ...makeRunRange(11, 15)];
    const { container } = render(<BacklogLowWaterEtaPanel runs={runs} />);
    const status = container.querySelector('[data-testid="backlog-low-water-eta-status"]');
    expect(status?.textContent).toContain('平常');
    expect(status?.className).toContain('text-emerald-400');
    expect(container.querySelector('[data-testid="backlog-low-water-eta-value"]')?.textContent).toBe('15');
  });

  it('ETAが閾値以下に迫ると amber の「接近中」表示になる', () => {
    // 余剰区間(1-3, net+2): 6+3*2=12。直近window(4-8, net-1): 12-5=7。ETA=(7-6)/1=1
    const runs = [...makeRunRange(1, 3, 3), ...makeRunRange(4, 8)];
    const { container } = render(<BacklogLowWaterEtaPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="backlog-low-water-eta-panel"]');
    expect(panel?.getAttribute('data-below-low-water')).toBe('false');
    expect(container.querySelector('[data-testid="backlog-low-water-eta-value"]')?.textContent).toBe('1');
    expect(container.querySelector('[data-testid="backlog-low-water-eta-balance"]')?.textContent).toBe('7');

    const status = container.querySelector('[data-testid="backlog-low-water-eta-status"]');
    expect(status?.textContent).toContain('接近中');
    expect(status?.className).toContain('text-amber-400');
  });
});
