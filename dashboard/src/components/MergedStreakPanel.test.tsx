import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MergedStreakPanel } from './MergedStreakPanel';
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

describe('MergedStreakPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<MergedStreakPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="merged-streak-panel"]')).toBeNull();
  });

  it('最新反復が merged なら current・longest が一致し、記録更新中の表示になる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'merged' }),
    ];
    const { container } = render(<MergedStreakPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="merged-streak-panel"]');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('data-is-record')).toBe('true');

    expect(container.querySelector('[data-testid="merged-streak-current"]')?.textContent).toBe('2');
    expect(container.querySelector('[data-testid="merged-streak-longest"]')?.textContent).toBe('2');
    expect(container.querySelector('[data-testid="merged-streak-status"]')?.textContent).toContain('記録更新中');
    expect(container.querySelector('[data-testid="merged-streak-current-iterations"]')?.textContent).toContain(
      '1, 2',
    );
  });

  it('最新反復が merged でなければ current は0、途切れ中の表示になる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'merged' }),
      makeRun({ iteration: 3, verdict: 'failed' }),
    ];
    const { container } = render(<MergedStreakPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="merged-streak-panel"]');
    expect(panel?.getAttribute('data-is-record')).toBe('false');
    expect(container.querySelector('[data-testid="merged-streak-current"]')?.textContent).toBe('0');
    expect(container.querySelector('[data-testid="merged-streak-longest"]')?.textContent).toBe('2');
    expect(container.querySelector('[data-testid="merged-streak-status"]')?.textContent).toContain('途切れ中');
    // current が0なので対象iteration注記は表示されない
    expect(container.querySelector('[data-testid="merged-streak-current-iterations"]')).toBeNull();
    expect(container.querySelector('[data-testid="merged-streak-longest-iterations"]')?.textContent).toContain(
      '1, 2',
    );
  });

  it('過去の最長記録より短い連続が継続中なら「継続中」の sky 表示になり、isRecord は false', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'merged' }),
      makeRun({ iteration: 3, verdict: 'merged' }),
      makeRun({ iteration: 4, verdict: 'failed' }),
      makeRun({ iteration: 5, verdict: 'merged' }),
    ];
    const { container } = render(<MergedStreakPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="merged-streak-panel"]');
    expect(panel?.getAttribute('data-is-record')).toBe('false');

    const status = container.querySelector('[data-testid="merged-streak-status"]');
    expect(status?.textContent).toContain('継続中');
    expect(status?.className).toContain('text-sky-400');

    expect(container.querySelector('[data-testid="merged-streak-current"]')?.textContent).toBe('1');
    expect(container.querySelector('[data-testid="merged-streak-longest"]')?.textContent).toBe('3');
    expect(panel?.textContent).toContain('過去最長は 3 回');
  });
});
