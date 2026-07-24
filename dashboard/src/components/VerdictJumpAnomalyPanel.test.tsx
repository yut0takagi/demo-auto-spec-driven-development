import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VerdictJumpAnomalyPanel } from './VerdictJumpAnomalyPanel';
import type { RunRecord } from '@/lib/types';

const VERIFY_FAILED = 'verify(lint/typecheck/unit/build) が失敗している';

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

// 'm'=merged, 'f'=failed(gateReasons付き) の1文字パターンから反復1始まりのrunsを作る
const seq = (pattern: string): RunRecord[] =>
  pattern.split('').map((c, i) =>
    makeRun({
      iteration: i + 1,
      verdict: c === 'm' ? 'merged' : 'failed',
      gateReasons: c === 'm' ? [] : [VERIFY_FAILED],
    }),
  );

describe('VerdictJumpAnomalyPanel', () => {
  it('孤立した逸脱が無ければ「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<VerdictJumpAnomalyPanel runs={seq('mmmmm')} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="verdict-jump-anomaly-panel"]')).toBeNull();
  });

  it('spikeFailure/spikeSuccessそれぞれの件数・ラベル・割合を表示する', () => {
    // iteration4: spikeFailure（前後mergedの中の孤立failed）/ iteration13: spikeSuccess（前後failedの中の孤立merged）
    const runs = seq('mmmfmmmfffffmfff');

    const { container } = render(<VerdictJumpAnomalyPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="verdict-jump-anomaly-panel"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('2件');

    expect(container.querySelector('[data-testid="verdict-jump-anomaly-count-spikeFailure"]')?.textContent).toBe(
      '1件 (50.0%)',
    );
    expect(container.querySelector('[data-testid="verdict-jump-anomaly-count-spikeSuccess"]')?.textContent).toBe(
      '1件 (50.0%)',
    );

    const failureRow = container.querySelector('[data-testid="verdict-jump-anomaly-row-spikeFailure"]');
    expect(failureRow?.textContent).toContain('安定成功中の孤立した不通過');
    const successRow = container.querySelector('[data-testid="verdict-jump-anomaly-row-spikeSuccess"]');
    expect(successRow?.textContent).toContain('安定不通過中の孤立した通過');

    expect(
      container.querySelector('[data-testid="verdict-jump-anomaly-item-spikeFailure-4"]')?.textContent,
    ).toContain('iteration 4');
    expect(
      container.querySelector('[data-testid="verdict-jump-anomaly-item-spikeSuccess-13"]')?.textContent,
    ).toContain('iteration 13');
  });

  it('gateReasonsが特定できるspikeFailureではrootCauseカテゴリのラベルを表示する', () => {
    const { container } = render(<VerdictJumpAnomalyPanel runs={seq('mmmfmmm')} />);
    expect(container.querySelector('[data-testid="verdict-jump-anomaly-reason-spikeFailure-4"]')?.textContent).toBe(
      'verify失敗',
    );
  });

  it('gateReasonsが特定できないspikeFailureでは原因ラベルを表示しない', () => {
    const runs = seq('mmmmmmm');
    runs[3] = makeRun({ iteration: 4, verdict: 'paused', gateReasons: [] });
    const { container } = render(<VerdictJumpAnomalyPanel runs={runs} />);
    expect(container.querySelector('[data-testid="verdict-jump-anomaly-reason-spikeFailure-4"]')).toBeNull();
  });
});
