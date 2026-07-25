import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviseCountAdversaryApprovalPanel } from './ReviseCountAdversaryApprovalPanel';
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

describe('ReviseCountAdversaryApprovalPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<ReviseCountAdversaryApprovalPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="revise-count-adversary-approval-panel"]')).toBeNull();
  });

  it('単一bucketの承認率・平均/中央値文字数を正確な値で表示する（部分一致に頼らない）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 1, adversary: { approved: true, summary: 'x'.repeat(10) } }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 1, adversary: { approved: true, summary: 'x'.repeat(20) } }),
      makeRun({ iteration: 3, verdict: 'abandoned', reviseCycles: 1, adversary: { approved: false, summary: 'x'.repeat(60) } }),
    ];
    const { container } = render(<ReviseCountAdversaryApprovalPanel runs={runs} />);

    expect(container.querySelector('[data-testid="revise-count-adversary-approval-panel"]')?.textContent).toContain(
      '1区分',
    );

    const rate = container.querySelector('[data-testid="revise-count-adversary-approval-rate-1"]');
    // approvedCount=2, count=3 -> 66.666...% -> toFixed(0) = 67%
    expect(rate?.textContent).toBe('承認67%（2/3）');

    const lengthStats = container.querySelector('[data-testid="revise-count-adversary-length-stats-1"]');
    // mean=(10+20+60)/3=30, median=20
    expect(lengthStats?.textContent).toBe('平均30文字 / 中央値20文字（3件）');
  });

  it('failed runは母集団から除外され、reachedVerifyなrunのみが集計に反映される', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0, adversary: { approved: true, summary: 'ok' } }),
      makeRun({
        iteration: 2,
        verdict: 'failed',
        reviseCycles: 0,
        adversary: { approved: false, summary: 'レビューに到達しなかった。'.repeat(20) },
      }),
    ];
    const { container } = render(<ReviseCountAdversaryApprovalPanel runs={runs} />);
    const rate = container.querySelector('[data-testid="revise-count-adversary-approval-rate-0"]');
    expect(rate?.textContent).toBe('承認100%（1/1）');
  });

  it('複数bucketが 0→1→2→3+ の順で表示され、各行のdata-testidが対応する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 5, adversary: { approved: true, summary: 'ok' } }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0, adversary: { approved: false, summary: 'ok' } }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 2, adversary: { approved: true, summary: 'ok' } }),
    ];
    const { container } = render(<ReviseCountAdversaryApprovalPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="revise-count-adversary-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'revise-count-adversary-row-0',
      'revise-count-adversary-row-2',
      'revise-count-adversary-row-3+',
    ]);
  });

  it('承認率バーの幅は承認率(%)と一致する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0, adversary: { approved: true, summary: 'ok' } }),
      makeRun({ iteration: 2, verdict: 'abandoned', reviseCycles: 0, adversary: { approved: false, summary: 'ok' } }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 0, adversary: { approved: true, summary: 'ok' } }),
      makeRun({ iteration: 4, verdict: 'merged', reviseCycles: 0, adversary: { approved: true, summary: 'ok' } }),
    ];
    const { container } = render(<ReviseCountAdversaryApprovalPanel runs={runs} />);
    const bar = container.querySelector('[data-testid="revise-count-adversary-approval-bar-0"]') as HTMLElement;
    // approvedCount=3, count=4 -> 75%
    expect(parseFloat(bar.style.width)).toBeCloseTo(75, 2);
  });
});
