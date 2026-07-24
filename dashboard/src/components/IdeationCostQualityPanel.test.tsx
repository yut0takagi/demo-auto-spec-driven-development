import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IdeationCostQualityPanel } from './IdeationCostQualityPanel';
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
    cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: 0.11 },
    models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
    nextIssues: [],
    ...overrides,
  };
}

describe('IdeationCostQualityPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<IdeationCostQualityPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-cost-quality-panel"]')).toBeNull();
  });

  it('ideation が1件も実行されていない（全て ideationUsd=0）場合も「データなし」（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: 0.11 } }),
    ];
    const { container } = render(<IdeationCostQualityPanel runs={runs} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-cost-quality-panel"]')).toBeNull();
  });

  it('ideation を実行したが提案0件（nextIssues空）の反復は batch に含めず「データなし」のまま（境界値）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        nextIssues: [],
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.05, totalUsd: 0.16 },
      }),
    ];
    const { container } = render(<IdeationCostQualityPanel runs={runs} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-cost-quality-panel"]')).toBeNull();
  });

  it('提案issueがまだ着手されていない場合、着手数0・承認率/マージ率「未着手」を正確な値で表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        nextIssues: [2, 3],
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.1, totalUsd: 0.21 },
      }),
    ];
    const { container } = render(<IdeationCostQualityPanel runs={runs} />);
    expect(container.querySelector('[data-testid="ideation-cost-quality-panel"]')).not.toBeNull();

    const row = container.querySelector('[data-testid="ideation-cost-quality-row-1"]');
    expect(row?.textContent).toBe('12$0.0500未着手未着手');
    expect(container.querySelector('[data-testid="ideation-cost-quality-correlation-approval"]')?.textContent).toBe(
      '算出不可',
    );
    expect(container.querySelector('[data-testid="ideation-cost-quality-correlation-merge"]')?.textContent).toBe(
      '算出不可',
    );
  });

  it('提案元自身の issue番号が nextIssues に含まれていても自分自身を着手済みとしてカウントしない（自己参照の境界値）', () => {
    const runs = [
      makeRun({
        iteration: 5,
        issue: { number: 10, title: 'self', labels: [] },
        nextIssues: [10, 11],
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.1, totalUsd: 0.21 },
      }),
      makeRun({ iteration: 6, issue: { number: 11, title: 'child', labels: [] }, verdict: 'merged' }),
    ];
    const { container } = render(<IdeationCostQualityPanel runs={runs} />);
    const row = container.querySelector('[data-testid="ideation-cost-quality-row-5"]');
    // 提案2件のうち着手されたのは issue 11 の1件のみ（issue 10 は自分自身なので除外）
    expect(row?.textContent).toBe('52$0.0501100%100%');
  });

  it('複数batchのコスト単価と承認率/マージ率から相関係数を実際に算出する（部分一致に頼らない）', () => {
    const runs = [
      // batch1: iteration1が issue2,3 を提案。単価0.005。両方着手され両方承認・マージ→承認率/マージ率とも100%
      makeRun({
        iteration: 1,
        issue: { number: 1, title: 'a', labels: [] },
        nextIssues: [2, 3],
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.01, totalUsd: 0.12 },
      }),
      makeRun({ iteration: 2, issue: { number: 2, title: 'c1', labels: [] }, verdict: 'merged', adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 3, issue: { number: 3, title: 'c2', labels: [] }, verdict: 'merged', adversary: { approved: true, summary: '' } }),
      // batch2: iteration4が issue5,6 を提案。単価0.1（batch1より高い）。両方着手され両方却下・非マージ→0%
      makeRun({
        iteration: 4,
        issue: { number: 4, title: 'b', labels: [] },
        nextIssues: [5, 6],
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.2, totalUsd: 0.31 },
      }),
      makeRun({
        iteration: 5,
        issue: { number: 5, title: 'c3', labels: [] },
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
      }),
      makeRun({
        iteration: 6,
        issue: { number: 6, title: 'c4', labels: [] },
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
      }),
    ];
    const { container } = render(<IdeationCostQualityPanel runs={runs} />);

    // 単価が高いbatchほど品質(承認率/マージ率)が低い→完全な負の相関(r=-1)になるはず
    expect(container.querySelector('[data-testid="ideation-cost-quality-correlation-approval"]')?.textContent).toBe(
      'r = -1.00',
    );
    expect(container.querySelector('[data-testid="ideation-cost-quality-correlation-merge"]')?.textContent).toBe(
      'r = -1.00',
    );

    const row1 = container.querySelector('[data-testid="ideation-cost-quality-row-1"]');
    expect(row1?.textContent).toBe('12$0.0052100%100%');
    const row4 = container.querySelector('[data-testid="ideation-cost-quality-row-4"]');
    expect(row4?.textContent).toBe('42$0.10020%0%');
  });
});
