import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { IssueLabelSuccessRatePanel } from './IssueLabelSuccessRatePanel';
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

describe('IssueLabelSuccessRatePanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<IssueLabelSuccessRatePanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="issue-label-success-rate-panel"]')).toBeNull();
  });

  it('labelが空配列の反復しか無い場合も「データなし」を表示する', () => {
    const runs = [makeRun({ issue: { number: 1, title: 't', labels: [] } })];
    const { container } = render(<IssueLabelSuccessRatePanel runs={runs} />);
    expect(container.textContent).toContain('データなし');
  });

  it('bug と feature の label を分けて、成功率降順で件数込みの正確な値を表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        issue: { number: 1, title: 'a', labels: ['bug'] },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        issue: { number: 2, title: 'b', labels: ['bug'] },
      }),
      makeRun({
        iteration: 3,
        verdict: 'merged',
        issue: { number: 3, title: 'c', labels: ['feature'] },
      }),
    ];

    const { container } = render(<IssueLabelSuccessRatePanel runs={runs} />);

    expect(container.querySelector('[data-testid="issue-label-success-rate-panel"]')?.textContent).toContain(
      '2ラベル',
    );

    const featureValue = container.querySelector('[data-testid="issue-label-success-rate-value-feature"]');
    expect(featureValue?.textContent).toBe('成功率100.0% (1/1件)');

    const bugValue = container.querySelector('[data-testid="issue-label-success-rate-value-bug"]');
    expect(bugValue?.textContent).toBe('成功率50.0% (1/2件)');

    // 成功率降順: feature(100%) が bug(50%) より先に並ぶ
    const rows = Array.from(container.querySelectorAll('[data-testid^="issue-label-success-rate-row-"]'));
    expect(rows[0].getAttribute('data-testid')).toBe('issue-label-success-rate-row-feature');
    expect(rows[1].getAttribute('data-testid')).toBe('issue-label-success-rate-row-bug');

    expect(rows[1].textContent).toContain('対象iteration: 1, 2');
  });

  it('バーの幅が最大成功率のlabelに対する相対値と一致する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', issue: { number: 1, title: 'a', labels: ['a-label'] } }),
      makeRun({ iteration: 2, verdict: 'merged', issue: { number: 2, title: 'b', labels: ['b-label'] } }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        issue: { number: 3, title: 'c', labels: ['b-label'] },
      }),
    ];
    const { container } = render(<IssueLabelSuccessRatePanel runs={runs} />);
    const barA = container.querySelector('[data-testid="issue-label-success-rate-bar-a-label"]') as HTMLElement;
    const barB = container.querySelector('[data-testid="issue-label-success-rate-bar-b-label"]') as HTMLElement;
    // a-label: successRate=1(100%), b-label: successRate=0.5(50%) → 最大は a-label
    expect(parseFloat(barA.style.width)).toBeCloseTo(100, 2);
    expect(parseFloat(barB.style.width)).toBeCloseTo(50, 2);
  });
});
