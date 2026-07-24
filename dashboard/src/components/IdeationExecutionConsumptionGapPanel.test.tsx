import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IdeationExecutionConsumptionGapPanel } from './IdeationExecutionConsumptionGapPanel';
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

describe('IdeationExecutionConsumptionGapPanel', () => {
  it('runが0件ならパネル本体を描画せず判定できない旨を表示する', () => {
    const { container } = render(<IdeationExecutionConsumptionGapPanel runs={[]} />);
    expect(screen.getByText(/比較できません/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-execution-consumption-gap-panel"]')).toBeNull();
  });

  it('実行間隔と消費間隔が一致すると aligned(sky)で未発報を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [101] }),
      makeRun({ iteration: 2, issue: { number: 101, title: 'x', labels: [] } }),
      makeRun({ iteration: 3, issue: { number: 3, title: 'gen', labels: [] }, nextIssues: [102] }),
      makeRun({ iteration: 4, issue: { number: 102, title: 'y', labels: [] } }),
      makeRun({ iteration: 5, issue: { number: 5, title: 'gen', labels: [] }, nextIssues: [103] }),
      makeRun({ iteration: 6, issue: { number: 103, title: 'z', labels: [] } }),
    ];
    const { container } = render(<IdeationExecutionConsumptionGapPanel runs={runs} />);

    const panel = container.querySelector('[data-testid="ideation-execution-consumption-gap-panel"]');
    expect(panel).not.toBeNull();

    expect(container.querySelector('[data-testid="ideation-execution-consumption-gap-counts"]')?.textContent).toBe(
      '実行 3件 / 着手 3件',
    );
    expect(
      container.querySelector('[data-testid="ideation-execution-consumption-gap-execution-interval"]')?.textContent,
    ).toBe('2.0反復');
    expect(
      container.querySelector('[data-testid="ideation-execution-consumption-gap-consumption-interval"]')?.textContent,
    ).toBe('2.0反復');
    expect(container.querySelector('[data-testid="ideation-execution-consumption-gap-ratio"]')?.textContent).toBe(
      '1.00倍',
    );

    const signal = container.querySelector('[data-testid="ideation-execution-consumption-gap-signal"]');
    expect(signal?.getAttribute('data-direction')).toBe('aligned');
    expect(signal?.getAttribute('data-triggered')).toBe('false');
    const status = container.querySelector('[data-testid="ideation-execution-consumption-gap-status"]');
    expect(status?.textContent).toContain('未発報');
    expect(status?.className).toContain('text-sky-400');

    expect(
      container.querySelector('[data-testid="ideation-execution-consumption-gap-iterations"]')?.textContent,
    ).toContain('実行iteration: 1, 3, 5 / 着手iteration: 2, 4, 6');
  });

  it('実行が消費より高頻度だと execution-ahead(rose)で発報する', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [101] }),
      makeRun({ iteration: 2, issue: { number: 2, title: 'gen', labels: [] }, nextIssues: [102] }),
      makeRun({ iteration: 3, issue: { number: 3, title: 'gen', labels: [] } }),
      makeRun({ iteration: 10, issue: { number: 101, title: 'x', labels: [] } }),
      makeRun({ iteration: 20, issue: { number: 102, title: 'y', labels: [] } }),
    ];
    const { container } = render(<IdeationExecutionConsumptionGapPanel runs={runs} />);

    const signal = container.querySelector('[data-testid="ideation-execution-consumption-gap-signal"]');
    expect(signal?.getAttribute('data-direction')).toBe('execution-ahead');
    expect(signal?.getAttribute('data-triggered')).toBe('true');
    const status = container.querySelector('[data-testid="ideation-execution-consumption-gap-status"]');
    expect(status?.textContent).toContain('発報');
    expect(status?.className).toContain('text-rose-400');
  });

  it('消費が実行より高頻度だと consumption-ahead(amber)で発報する', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [201] }),
      makeRun({ iteration: 31, issue: { number: 31, title: 'gen', labels: [] }, nextIssues: [202] }),
      makeRun({ iteration: 61, issue: { number: 61, title: 'gen', labels: [] }, nextIssues: [203] }),
      makeRun({ iteration: 59, issue: { number: 201, title: 'a', labels: [] } }),
      makeRun({ iteration: 60, issue: { number: 202, title: 'b', labels: [] } }),
      makeRun({ iteration: 62, issue: { number: 203, title: 'c', labels: [] } }),
    ];
    const { container } = render(<IdeationExecutionConsumptionGapPanel runs={runs} />);

    const signal = container.querySelector('[data-testid="ideation-execution-consumption-gap-signal"]');
    expect(signal?.getAttribute('data-direction')).toBe('consumption-ahead');
    expect(signal?.getAttribute('data-triggered')).toBe('true');
    const status = container.querySelector('[data-testid="ideation-execution-consumption-gap-status"]');
    expect(status?.textContent).toContain('発報');
    expect(status?.className).toContain('text-amber-400');
  });
});
