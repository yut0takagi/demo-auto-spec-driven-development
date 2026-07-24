import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IdeationEarlyAbandonmentPanel } from './IdeationEarlyAbandonmentPanel';
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

describe('IdeationEarlyAbandonmentPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<IdeationEarlyAbandonmentPanel runs={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-early-abandonment-panel"]')).toBeNull();
  });

  it('ideation起源issueが着手されていない場合は「データなし」を表示する', () => {
    const runs = [makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] })];
    const { container } = render(<IdeationEarlyAbandonmentPanel runs={runs} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-early-abandonment-panel"]')).toBeNull();
  });

  it('revise0回でabandonedになった着手を早期abandonmentとして率・一覧に表示する', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] }),
      makeRun({
        iteration: 2,
        issue: { number: 10, title: 'x', labels: [] },
        verdict: 'abandoned',
        reviseCycles: 0,
      }),
    ];
    const { container } = render(<IdeationEarlyAbandonmentPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="ideation-early-abandonment-panel"]');
    expect(panel).not.toBeNull();

    const value = container.querySelector('[data-testid="ideation-early-abandonment-value"]');
    expect(value?.textContent).toBe('100.0%');

    const counts = container.querySelector('[data-testid="ideation-early-abandonment-counts"]');
    expect(counts?.textContent).toContain('着手 1件中 1件が早期abandonment');

    const row = container.querySelector('[data-testid="ideation-early-abandonment-issue-10"]');
    expect(row).not.toBeNull();
    const verdictEl = container.querySelector('[data-testid="ideation-early-abandonment-verdict-10"]');
    expect(verdictEl?.textContent).toBe('abandoned');
    expect(verdictEl?.className).toContain('text-rose-400');
  });

  it('reviseを重ねてabandonedになった場合は早期abandonmentに数えず、rose色にもならない', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] }),
      makeRun({
        iteration: 2,
        issue: { number: 10, title: 'x', labels: [] },
        verdict: 'abandoned',
        reviseCycles: 3,
      }),
    ];
    const { container } = render(<IdeationEarlyAbandonmentPanel runs={runs} />);
    const value = container.querySelector('[data-testid="ideation-early-abandonment-value"]');
    expect(value?.textContent).toBe('0.0%');
    const verdictEl = container.querySelector('[data-testid="ideation-early-abandonment-verdict-10"]');
    expect(verdictEl?.className).not.toContain('text-rose-400');
  });

  it('直近windowが直前windowより悪化していれば発報(rose)し、ステータス文言に「発報」を含む', () => {
    const runs: RunRecord[] = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10, 20, 30, 40, 50, 60] }),
    ];
    for (const [i, issueNumber] of [10, 20, 30].entries()) {
      runs.push(
        makeRun({ iteration: 2 + i, issue: { number: issueNumber, title: 'x', labels: [] }, verdict: 'merged' }),
      );
    }
    for (const [i, issueNumber] of [40, 50, 60].entries()) {
      runs.push(
        makeRun({
          iteration: 5 + i,
          issue: { number: issueNumber, title: 'x', labels: [] },
          verdict: 'abandoned',
          reviseCycles: 0,
        }),
      );
    }
    const { container } = render(<IdeationEarlyAbandonmentPanel runs={runs} />);
    const signal = container.querySelector('[data-testid="ideation-early-abandonment-signal"]');
    expect(signal?.getAttribute('data-triggered')).toBe('true');
    const status = container.querySelector('[data-testid="ideation-early-abandonment-status"]');
    expect(status?.textContent).toContain('発報');
    expect(status?.className).toContain('text-rose-400');
  });

  it('baseline(非ideation起源issue。提案元反復自身も含む)の早期abandonment率を併記する', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10], verdict: 'merged' }),
      makeRun({ iteration: 2, issue: { number: 10, title: 'x', labels: [] }, verdict: 'merged' }),
      makeRun({
        iteration: 3,
        issue: { number: 999, title: 'human-authored', labels: [] },
        verdict: 'abandoned',
        reviseCycles: 0,
      }),
    ];
    const { container } = render(<IdeationEarlyAbandonmentPanel runs={runs} />);
    // baseline は issue1(提案元自身、merged) と issue999(abandoned, revise0) の2件で率は50%
    expect(container.textContent).toContain('50.0%');
    expect(container.textContent).toContain('（1/2件）');
  });
});
