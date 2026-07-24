import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { IdeationGenerationDecayPanel } from './IdeationGenerationDecayPanel';
import { GENERATION_DECAY_STREAK_THRESHOLD } from '@/lib/aggregate';
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

/** iteration 1..counts.length の run を、各反復 nextIssues 長 counts[i] で生成する。 */
function makeGenerationRuns(counts: number[]): RunRecord[] {
  return counts.map((n, i) =>
    makeRun({ iteration: i + 1, nextIssues: Array.from({ length: n }, (_, j) => (i + 1) * 1000 + j) }),
  );
}

describe('IdeationGenerationDecayPanel', () => {
  it('runsが0件なら「データなし」を表示し、パネル本体を描画しない（クラッシュしない）', () => {
    const { container } = render(<IdeationGenerationDecayPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="ideation-generation-decay-panel"]')).toBeNull();
  });

  it('データ点数がwindow未満でピークを判定できない場合はデータ不足メッセージを表示する', () => {
    const runs = makeGenerationRuns([3, 2]);
    const { container } = render(<IdeationGenerationDecayPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="ideation-generation-decay-panel"]');
    expect(panel).not.toBeNull();
    expect(container.querySelector('[data-testid="ideation-generation-decay-status"]')?.textContent).toContain(
      'データ不足',
    );
  });

  it('単調増加のみの場合は未検出(emerald)表示になり、発報しない', () => {
    const runs = makeGenerationRuns([1, 2, 3, 4, 5, 6]);
    const { container } = render(<IdeationGenerationDecayPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="ideation-generation-decay-panel"]');
    expect(panel?.getAttribute('data-triggered')).toBe('false');

    const status = container.querySelector('[data-testid="ideation-generation-decay-status"]');
    expect(status?.textContent).toContain('未検出');
    expect(status?.className).toContain('text-emerald-400');

    expect(container.querySelector('[data-testid="ideation-generation-decay-start"]')?.textContent).toBe('—');
    expect(container.querySelector('[data-testid="ideation-generation-decay-streak"]')?.textContent).toBe('0');
    expect(container.querySelector('[data-testid="ideation-generation-decay-confirmed"]')).toBeNull();
  });

  it(`ピーク後に${GENERATION_DECAY_STREAK_THRESHOLD}反復連続で下降すると発報(rose)表示になり、減衰開始/発報点/下落率を表示する`, () => {
    const runs = makeGenerationRuns([5, 5, 5, 5, 4, 3, 2, 1]);
    const { container } = render(<IdeationGenerationDecayPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="ideation-generation-decay-panel"]');
    expect(panel?.getAttribute('data-triggered')).toBe('true');

    const status = container.querySelector('[data-testid="ideation-generation-decay-status"]');
    expect(status?.textContent).toContain('発報');
    expect(status?.className).toContain('text-rose-400');

    expect(container.querySelector('[data-testid="ideation-generation-decay-peak"]')?.textContent).toContain(
      'iteration 3',
    );
    const start = container.querySelector('[data-testid="ideation-generation-decay-start"]');
    expect(start?.textContent).toBe('5');
    expect(start?.className).toContain('text-rose-400');

    const streak = container.querySelector('[data-testid="ideation-generation-decay-streak"]');
    expect(streak?.textContent).toBe('4');
    expect(streak?.className).toContain('text-rose-400');

    expect(container.querySelector('[data-testid="ideation-generation-decay-decline-pct"]')?.textContent).toBe(
      '60.0%',
    );
    expect(container.querySelector('[data-testid="ideation-generation-decay-confirmed"]')?.textContent).toContain(
      '6',
    );
  });

  it('1回だけ下降して回復するケースでは未発報のままで、減衰開始iterationは「—」表示になる', () => {
    const runs = makeGenerationRuns([5, 5, 5, 4, 5, 4]);
    const { container } = render(<IdeationGenerationDecayPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="ideation-generation-decay-panel"]');
    expect(panel?.getAttribute('data-triggered')).toBe('false');
    expect(container.querySelector('[data-testid="ideation-generation-decay-start"]')?.textContent).toBe('—');
    expect(container.querySelector('[data-testid="ideation-generation-decay-streak"]')?.textContent).toBe('1');
  });
});
