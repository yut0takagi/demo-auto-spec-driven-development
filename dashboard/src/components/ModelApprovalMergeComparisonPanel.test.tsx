import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ModelApprovalMergeComparisonPanel } from './ModelApprovalMergeComparisonPanel';
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

describe('ModelApprovalMergeComparisonPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<ModelApprovalMergeComparisonPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="model-approval-merge-panel"]')).toBeNull();
  });

  it('承認済みだがマージされていないモデルのギャップを正の値で表示する', () => {
    // paused: adversary承認済み(approved=true)だが verdict は merged ではないので
    // 承認率100% / マージ率0% となり、ギャップは +100.0pt になるはず。
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'paused',
        adversary: { approved: true, summary: '' },
        models: { builder: 'model-a', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const { container } = render(<ModelApprovalMergeComparisonPanel runs={runs} />);

    const approval = container.querySelector('[data-testid="model-approval-merge-approval-value-model-a"]');
    const merge = container.querySelector('[data-testid="model-approval-merge-merge-value-model-a"]');
    expect(approval?.textContent).toBe('100.0%');
    expect(merge?.textContent).toBe('0.0%');

    const gap = container.querySelector('[data-testid="model-approval-merge-gap-model-a"]');
    expect(gap?.textContent).toBe('承認→マージのギャップ: +100.0pt');
  });

  it('マージ済みでギャップが0のケースを正しく表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'model-b', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const { container } = render(<ModelApprovalMergeComparisonPanel runs={runs} />);
    const gap = container.querySelector('[data-testid="model-approval-merge-gap-model-b"]');
    expect(gap?.textContent).toBe('承認→マージのギャップ: +0.0pt');
  });

  it('マージ率が承認率を上回る異常データではギャップが負の値になり符号+が付かない', () => {
    // 通常運用では起こらないが、mergeRate(全件が分母)とapprovalRate(verify到達件のみが分母)は
    // 定義上の分母が異なるため、理論上 mergeRate > approvalRate になりうる。
    // 1件はverify到達済みだが未承認のままmergedというイレギュラーな記録、もう1件はfailed。
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: false, summary: '' },
        models: { builder: 'model-c', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'merged',
        adversary: { approved: false, summary: '' },
        models: { builder: 'model-c', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const { container } = render(<ModelApprovalMergeComparisonPanel runs={runs} />);
    // mergeRate = 2/2 = 100%, approvalRate = 0/2 = 0% → gap = 0 - 100 = -100.0pt
    const gap = container.querySelector('[data-testid="model-approval-merge-gap-model-c"]');
    expect(gap?.textContent).toBe('承認→マージのギャップ: -100.0pt');
  });

  it('モデル名の昇順で行が並ぶ（ModelEffectivenessPanel のマージ率降順とは異なる並び順）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        models: { builder: 'zeta-model', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'needs-human',
        adversary: { approved: false, summary: '' },
        models: { builder: 'alpha-model', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const { container } = render(<ModelApprovalMergeComparisonPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="model-approval-merge-row-"]'));
    // マージ率だけで見れば zeta-model(100%) が先に来そうだが、このパネルはモデル名昇順固定
    // なので alpha-model が先に描画されるはず。
    expect(rows[0].getAttribute('data-testid')).toBe('model-approval-merge-row-alpha-model');
    expect(rows[1].getAttribute('data-testid')).toBe('model-approval-merge-row-zeta-model');
  });

  it('バーの幅は全モデル・両指標を通した最大値に対する相対値になる（指標間で比較可能にするため）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'model-a', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'needs-human',
        adversary: { approved: false, summary: '' },
        models: { builder: 'model-b', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const { container } = render(<ModelApprovalMergeComparisonPanel runs={runs} />);
    // model-a: 承認率100%・マージ率100% → 全体最大は100%
    // model-b: 承認率0%・マージ率0%
    const approvalBarA = container.querySelector(
      '[data-testid="model-approval-merge-approval-bar-model-a"]',
    ) as HTMLElement;
    const mergeBarA = container.querySelector(
      '[data-testid="model-approval-merge-merge-bar-model-a"]',
    ) as HTMLElement;
    const approvalBarB = container.querySelector(
      '[data-testid="model-approval-merge-approval-bar-model-b"]',
    ) as HTMLElement;

    expect(parseFloat(approvalBarA.style.width)).toBeCloseTo(100, 2);
    expect(parseFloat(mergeBarA.style.width)).toBeCloseTo(100, 2);
    expect(parseFloat(approvalBarB.style.width)).toBeCloseTo(0, 2);
  });

  it('複数モデルの件数・対象iterationをそれぞれ独立して表示する', () => {
    const runs = [
      makeRun({ iteration: 1, models: { builder: 'model-a', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' } }),
      makeRun({ iteration: 3, models: { builder: 'model-a', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' } }),
      makeRun({ iteration: 2, models: { builder: 'model-b', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' } }),
    ];
    const { container } = render(<ModelApprovalMergeComparisonPanel runs={runs} />);
    const rowA = container.querySelector('[data-testid="model-approval-merge-row-model-a"]');
    const rowB = container.querySelector('[data-testid="model-approval-merge-row-model-b"]');
    expect(rowA?.textContent).toContain('2件 / 対象iteration: 1, 3');
    expect(rowB?.textContent).toContain('1件 / 対象iteration: 2');
  });
});
