import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ModelIssueLabelSuccessMatrixPanel } from './ModelIssueLabelSuccessMatrixPanel';
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

describe('ModelIssueLabelSuccessMatrixPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<ModelIssueLabelSuccessMatrixPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="model-issue-label-success-matrix-panel"]')).toBeNull();
  });

  it('labelが空配列の反復のみの場合は行が1件も無く「データなし」になる', () => {
    const runs = [makeRun({ iteration: 1, issue: { number: 1, title: 't', labels: [] } })];
    const { container } = render(<ModelIssueLabelSuccessMatrixPanel runs={runs} />);
    expect(container.textContent).toContain('データなし');
  });

  it('モデル行×labelセルに成功率・件数・対象iterationを表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        issue: { number: 1, title: 'a', labels: ['bug'] },
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        issue: { number: 2, title: 'b', labels: ['bug'] },
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
    ];
    const { container } = render(<ModelIssueLabelSuccessMatrixPanel runs={runs} />);

    expect(container.querySelector('[data-testid="model-issue-label-success-matrix-panel"]')).not.toBeNull();

    const total = container.querySelector('[data-testid="model-issue-label-success-total-model-a"]');
    expect(total?.textContent).toContain('ラベル付きissue 2件');

    const rate = container.querySelector('[data-testid="model-issue-label-success-rate-model-a-bug"]');
    expect(rate?.textContent).toBe('成功率50.0% (1/2)');

    expect(container.textContent).toContain('対象iteration: 1, 2');

    const bar = container.querySelector(
      '[data-testid="model-issue-label-success-bar-model-a-bug"]',
    ) as HTMLElement;
    expect(parseFloat(bar.style.width)).toBeCloseTo(50, 2);
  });

  it('モデルが複数あるとき、それぞれ独立した行として描画し、他モデルのラベルと混同しない', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        issue: { number: 1, title: 'a', labels: ['bug'] },
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'needs-human',
        issue: { number: 2, title: 'b', labels: ['bug'] },
        models: { builder: 'model-b', adversary: 'x', ideation: 'x' },
      }),
    ];
    const { container } = render(<ModelIssueLabelSuccessMatrixPanel runs={runs} />);

    const rateA = container.querySelector('[data-testid="model-issue-label-success-rate-model-a-bug"]');
    expect(rateA?.textContent).toBe('成功率100.0% (1/1)');

    const rateB = container.querySelector('[data-testid="model-issue-label-success-rate-model-b-bug"]');
    expect(rateB?.textContent).toBe('成功率0.0% (0/1)');

    const rows = container.querySelectorAll('[data-testid^="model-issue-label-success-row-"]');
    expect(rows).toHaveLength(2);
  });
});
