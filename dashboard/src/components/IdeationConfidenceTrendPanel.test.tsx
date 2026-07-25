import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { IdeationConfidenceTrendPanel } from './IdeationConfidenceTrendPanel';
import { ideationConfidenceTrend } from '@/lib/aggregate';
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

describe('IdeationConfidenceTrendPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体もsvgも描画しない', () => {
    const { container } = render(<IdeationConfidenceTrendPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="ideation-confidence-trend-panel"]')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('着手済みissueが1件もない場合も「データなし」（境界値）', () => {
    const runs = [makeRun({ iteration: 1, issue: { number: 1, title: 'a', labels: [] }, nextIssues: [2] })];
    const { container } = render(<IdeationConfidenceTrendPanel runs={runs} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="ideation-confidence-trend-panel"]')).toBeNull();
  });

  it('着手済みが1件のみのときはcircleフォールバックで単一点を描画する', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'a', labels: [] }, nextIssues: [2] }),
      makeRun({ iteration: 2, issue: { number: 2, title: 'child', labels: [] }, verdict: 'merged' }),
    ];
    const { container } = render(<IdeationConfidenceTrendPanel runs={runs} />);

    const panel = container.querySelector('[data-testid="ideation-confidence-trend-panel"]');
    expect(panel?.textContent).toContain('1件');
    expect(container.querySelector('[data-testid="ideation-confidence-trend-point-confidence"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ideation-confidence-trend-point-weighted"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ideation-confidence-trend-line-confidence"]')).toBeNull();
    expect(container.querySelector('svg')?.innerHTML).not.toMatch(/NaN/);
  });

  it('複数件時は折れ線と凡例の値が ideationConfidenceTrend() の戻り値と一致する', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'a', labels: [] }, nextIssues: [2, 3, 4] }),
      makeRun({ iteration: 2, issue: { number: 2, title: 'c1', labels: [] }, verdict: 'merged' }),
      makeRun({ iteration: 3, issue: { number: 3, title: 'c2', labels: [] }, verdict: 'failed' }),
      makeRun({ iteration: 4, issue: { number: 4, title: 'c3', labels: [] }, verdict: 'merged' }),
    ];
    const trend = ideationConfidenceTrend(runs);
    expect(trend).toHaveLength(3);

    const { container } = render(<IdeationConfidenceTrendPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="ideation-confidence-trend-panel"]');
    expect(panel?.textContent).toContain('3件');
    expect(container.querySelector('[data-testid="ideation-confidence-trend-line-confidence"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ideation-confidence-trend-line-weighted"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ideation-confidence-trend-point-confidence"]')).toBeNull();

    const latest = trend[trend.length - 1];
    expect(container.querySelector('[data-testid="ideation-confidence-trend-latest-confidence"]')?.textContent).toBe(
      `最新${(latest.confidence * 100).toFixed(1)}% (サンプル${latest.totalCount}件)`,
    );
    expect(container.querySelector('[data-testid="ideation-confidence-trend-latest-weighted"]')?.textContent).toBe(
      `最新${(latest.weightedScore * 100).toFixed(1)}%`,
    );
    expect(container.querySelector('svg')?.innerHTML).not.toMatch(/NaN/);
  });
});
