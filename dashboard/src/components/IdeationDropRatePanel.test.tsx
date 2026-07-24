import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IdeationDropRatePanel } from './IdeationDropRatePanel';
import { IDEATION_DROP_STALENESS_ITERATIONS } from '@/lib/aggregate';
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

describe('IdeationDropRatePanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<IdeationDropRatePanel runs={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-drop-rate-panel"]')).toBeNull();
  });

  it('nextIssuesが一度も出ていない場合は「データなし」を表示する', () => {
    const runs = [makeRun({ iteration: 1, nextIssues: [] })];
    const { container } = render(<IdeationDropRatePanel runs={runs} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-drop-rate-panel"]')).toBeNull();
  });

  it('提案が全て猶予期間中(未判定)ならパネルは出すが判定できない旨を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] }),
      makeRun({ iteration: 2, issue: { number: 2, title: 'other', labels: [] } }),
    ];
    const { container } = render(<IdeationDropRatePanel runs={runs} />);
    const panel = container.querySelector('[data-testid="ideation-drop-rate-panel"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('まだドロップ判定できません');
    expect(container.querySelector('[data-testid="ideation-drop-rate-value"]')).toBeNull();
  });

  it('2件連続でドロップすると発報(rose)し、ドロップ率とドロップ済みissue一覧を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen1', labels: [] }, nextIssues: [10] }),
      makeRun({ iteration: 2, issue: { number: 2, title: 'gen2', labels: [] }, nextIssues: [20] }),
      makeRun({
        iteration: 1 + IDEATION_DROP_STALENESS_ITERATIONS + 2,
        issue: { number: 999, title: 'filler', labels: [] },
      }),
    ];
    const { container } = render(<IdeationDropRatePanel runs={runs} />);
    const value = container.querySelector('[data-testid="ideation-drop-rate-value"]');
    expect(value?.textContent).toBe('100.0%');

    const signal = container.querySelector('[data-testid="ideation-drop-rate-signal"]');
    expect(signal?.getAttribute('data-triggered')).toBe('true');
    const status = container.querySelector('[data-testid="ideation-drop-rate-status"]');
    expect(status?.textContent).toContain('発報');
    expect(status?.className).toContain('text-rose-400');
    const streak = container.querySelector('[data-testid="ideation-drop-rate-streak"]');
    expect(streak?.textContent).toBe('2');

    expect(container.querySelector('[data-testid="ideation-drop-rate-issue-10"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ideation-drop-rate-issue-20"]')).not.toBeNull();
    const counts = container.querySelector('[data-testid="ideation-drop-rate-counts"]');
    expect(counts?.textContent).toContain('判定 2件中 2件がドロップ');
  });

  it('末尾のissueが着手済みならstreakは0で未発報になるが、ドロップ率自体はゼロにならない', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen1', labels: [] }, nextIssues: [10] }),
      makeRun({ iteration: 2, issue: { number: 2, title: 'gen2', labels: [] }, nextIssues: [20] }),
      makeRun({ iteration: 5, issue: { number: 20, title: 'started-late', labels: [] } }),
      makeRun({
        iteration: 1 + IDEATION_DROP_STALENESS_ITERATIONS + 5,
        issue: { number: 999, title: 'filler', labels: [] },
      }),
    ];
    const { container } = render(<IdeationDropRatePanel runs={runs} />);
    const signal = container.querySelector('[data-testid="ideation-drop-rate-signal"]');
    expect(signal?.getAttribute('data-triggered')).toBe('false');
    const streak = container.querySelector('[data-testid="ideation-drop-rate-streak"]');
    expect(streak?.textContent).toBe('0');
    const value = container.querySelector('[data-testid="ideation-drop-rate-value"]');
    expect(value?.textContent).toBe('50.0%');
    expect(container.querySelector('[data-testid="ideation-drop-rate-issue-10"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ideation-drop-rate-issue-20"]')).toBeNull();
  });
});
