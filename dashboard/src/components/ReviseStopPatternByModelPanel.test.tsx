import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviseStopPatternByModelPanel } from './ReviseStopPatternByModelPanel';
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

describe('ReviseStopPatternByModelPanel', () => {
  it('run が0件、またはfailedのみ（verify未到達）なら「データなし」を表示し、パネル本体を描画しない', () => {
    render(<ReviseStopPatternByModelPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();

    const runs = [makeRun({ iteration: 1, verdict: 'failed', reviseCycles: 99 })];
    const { container } = render(<ReviseStopPatternByModelPanel runs={runs} />);
    expect(screen.getAllByText('データなし').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="revise-stop-pattern-by-model-panel"]')).toBeNull();
  });

  it('モデルごとに early-exit（承認されて打ち止め）件数・枯渇（上限まで承認されず打ち止め）件数・枯渇率を正確な値で表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        reviseCycles: 0,
        adversary: { approved: true, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        reviseCycles: 1,
        adversary: { approved: true, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 3,
        reviseCycles: 3,
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 4,
        reviseCycles: 3,
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
        models: { builder: 'claude-opus-4-8', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const { container } = render(<ReviseStopPatternByModelPanel runs={runs} />);

    expect(container.querySelector('[data-testid="revise-stop-pattern-by-model-panel"]')?.textContent).toContain(
      '2モデル',
    );

    // 枯渇率降順: opus(100%) が sonnet(33.3%) より先
    const rows = Array.from(container.querySelectorAll('[data-testid^="revise-stop-pattern-row-"]'));
    expect(rows[0].getAttribute('data-testid')).toBe('revise-stop-pattern-row-claude-opus-4-8');
    expect(rows[1].getAttribute('data-testid')).toBe('revise-stop-pattern-row-claude-sonnet-5');

    const sonnetStats = container.querySelector('[data-testid="revise-stop-pattern-stats-claude-sonnet-5"]');
    expect(sonnetStats?.textContent).toBe('early-exit 2件 / 枯渇 1件 (枯渇率33.3%, 3件中)');

    const opusStats = container.querySelector('[data-testid="revise-stop-pattern-stats-claude-opus-4-8"]');
    expect(opusStats?.textContent).toBe('early-exit 0件 / 枯渇 1件 (枯渇率100.0%, 1件中)');

    const sonnetMean = container.querySelector('[data-testid="revise-stop-pattern-mean-claude-sonnet-5"]');
    expect(sonnetMean?.textContent).toBe('平均revise回数: early-exit 0.5回 / 枯渇 3.0回');

    const opusMean = container.querySelector('[data-testid="revise-stop-pattern-mean-claude-opus-4-8"]');
    expect(opusMean?.textContent).toBe('平均revise回数: early-exit 0.0回 / 枯渇 3.0回');
  });

  it('積み上げバーの幅が early-exit / 枯渇 それぞれの件数割合と一致する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        adversary: { approved: true, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        adversary: { approved: true, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 4,
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const { container } = render(<ReviseStopPatternByModelPanel runs={runs} />);
    const earlyBar = container.querySelector(
      '[data-testid="revise-stop-pattern-early-bar-claude-sonnet-5"]',
    ) as HTMLElement;
    const exhaustedBar = container.querySelector(
      '[data-testid="revise-stop-pattern-exhausted-bar-claude-sonnet-5"]',
    ) as HTMLElement;
    // 4件中 early-exit 2件・枯渇 2件 → 50% / 50%
    expect(parseFloat(earlyBar.style.width)).toBeCloseTo(50, 2);
    expect(parseFloat(exhaustedBar.style.width)).toBeCloseTo(50, 2);
  });
});
