import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { IssueLabelQualityRecoveryMatrixPanel } from './IssueLabelQualityRecoveryMatrixPanel';
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

describe('IssueLabelQualityRecoveryMatrixPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<IssueLabelQualityRecoveryMatrixPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="issue-label-quality-recovery-matrix-panel"]')).toBeNull();
  });

  it('labelが空配列の反復しか無い場合も「データなし」を表示する', () => {
    const runs = [makeRun({ issue: { number: 1, title: 't', labels: [] } })];
    const { container } = render(<IssueLabelQualityRecoveryMatrixPanel runs={runs} />);
    expect(container.textContent).toContain('データなし');
  });

  it('label別に提案品質(承認率)と回収効率(マージ率・merge単価)を正しい値で表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        issue: { number: 1, title: 'a', labels: ['bug'] },
        adversary: { approved: true, summary: '' },
        cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        issue: { number: 2, title: 'b', labels: ['bug'] },
        adversary: { approved: false, summary: '' },
        cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 },
      }),
    ];

    const { container } = render(<IssueLabelQualityRecoveryMatrixPanel runs={runs} />);

    expect(
      container.querySelector('[data-testid="issue-label-quality-recovery-matrix-panel"]')?.textContent,
    ).toContain('1ラベル');

    const quality = container.querySelector('[data-testid="issue-label-quality-recovery-quality-bug"]');
    expect(quality?.textContent).toBe('提案品質(承認率) 50.0%');

    const rate = container.querySelector('[data-testid="issue-label-quality-recovery-rate-bug"]');
    expect(rate?.textContent).toBe('回収効率50.0% (1/2件)');

    const cost = container.querySelector('[data-testid="issue-label-quality-recovery-cost-bug"]');
    expect(cost?.textContent).toBe('merge1件あたり $2.00');

    const bar = container.querySelector('[data-testid="issue-label-quality-recovery-bar-bug"]') as HTMLElement;
    expect(parseFloat(bar.style.width)).toBeCloseTo(50, 2);

    const row = container.querySelector('[data-testid="issue-label-quality-recovery-row-bug"]');
    expect(row?.textContent).toContain('対象iteration: 1, 2');
  });

  it('verify未到達で品質を測れずマージ実績も無いlabelは「測定不可」「回収実績なし」を表示する（0除算のNaN表示にならない）', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'failed', issue: { number: 1, title: 'a', labels: ['crash'] } })];
    const { container } = render(<IssueLabelQualityRecoveryMatrixPanel runs={runs} />);
    expect(container.querySelector('[data-testid="issue-label-quality-recovery-quality-crash"]')?.textContent).toBe(
      '提案品質 測定不可',
    );
    expect(container.querySelector('[data-testid="issue-label-quality-recovery-cost-crash"]')?.textContent).toBe(
      '回収実績なし',
    );
    const bar = container.querySelector('[data-testid="issue-label-quality-recovery-bar-crash"]') as HTMLElement;
    expect(Number.isNaN(parseFloat(bar.style.width))).toBe(false);
    expect(parseFloat(bar.style.width)).toBeCloseTo(0, 2);
  });

  it('回収効率(recoveryRate)降順で行が並ぶ', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', issue: { number: 1, title: 'a', labels: ['zeta'] } }),
      makeRun({ iteration: 2, verdict: 'abandoned', issue: { number: 2, title: 'b', labels: ['alpha'] } }),
      makeRun({ iteration: 3, verdict: 'merged', issue: { number: 3, title: 'c', labels: ['alpha'] } }),
    ];
    const { container } = render(<IssueLabelQualityRecoveryMatrixPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="issue-label-quality-recovery-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'issue-label-quality-recovery-row-zeta',
      'issue-label-quality-recovery-row-alpha',
    ]);
  });
});
