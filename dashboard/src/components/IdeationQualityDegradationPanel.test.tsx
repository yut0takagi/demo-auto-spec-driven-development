import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IdeationQualityDegradationPanel } from './IdeationQualityDegradationPanel';
import type { RunRecord } from '@/lib/types';
import { IDEATION_DROP_STALENESS_ITERATIONS } from '@/lib/aggregate';

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

describe('IdeationQualityDegradationPanel', () => {
  it('ideationが一度も提案していない場合は「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<IdeationQualityDegradationPanel runs={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-quality-degradation-panel"]')).toBeNull();
  });

  it('悪化面が無ければ normal レベルを表示する', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] }),
      makeRun({ iteration: 2, issue: { number: 10, title: 'x', labels: [] } }),
    ];
    const { container } = render(<IdeationQualityDegradationPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="ideation-quality-degradation-panel"]');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('data-level')).toBe('normal');
    expect(container.querySelector('[data-testid="ideation-quality-degradation-level"]')?.textContent).toContain(
      '平常',
    );
  });

  it(`提案順末尾からIDEATION_DROP_RATE_STREAK_THRESHOLD件連続ドロップすると dropStreak 面が悪化として表示され watch レベルになり、度数(1/1)も一致する`, () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen1', labels: [] }, nextIssues: [10] }),
      makeRun({ iteration: 2, issue: { number: 2, title: 'gen2', labels: [] }, nextIssues: [20] }),
      makeRun({
        iteration: 1 + IDEATION_DROP_STALENESS_ITERATIONS + 2,
        issue: { number: 999, title: 'filler', labels: [] },
      }),
    ];
    const { container } = render(<IdeationQualityDegradationPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="ideation-quality-degradation-panel"]');
    expect(panel?.getAttribute('data-level')).toBe('watch');
    expect(panel?.textContent).toContain('1/1');

    const dropFacet = container.querySelector('[data-testid="ideation-quality-degradation-facet-dropStreak"]');
    expect(dropFacet?.getAttribute('data-available')).toBe('true');
    expect(dropFacet?.getAttribute('data-degraded')).toBe('true');
    expect(dropFacet?.textContent).toContain('悪化');

    // 判定材料の無い他の面は「データ不足」として表示され、悪化扱いにはならない
    const leadTimeFacet = container.querySelector('[data-testid="ideation-quality-degradation-facet-leadTime"]');
    expect(leadTimeFacet?.getAttribute('data-available')).toBe('false');
    expect(leadTimeFacet?.textContent).toContain('データ不足');
  });
});
