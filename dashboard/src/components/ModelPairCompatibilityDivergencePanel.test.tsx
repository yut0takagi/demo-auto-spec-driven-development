import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ModelPairCompatibilityDivergencePanel } from './ModelPairCompatibilityDivergencePanel';
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

function makePairRuns(
  startIteration: number,
  builder: string,
  adversary: string,
  count: number,
  mergedCount: number,
): RunRecord[] {
  return Array.from({ length: count }, (_, i) =>
    makeRun({
      iteration: startIteration + i,
      verdict: i < mergedCount ? 'merged' : 'needs-human',
      models: { builder, adversary, ideation: adversary },
    }),
  );
}

describe('ModelPairCompatibilityDivergencePanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<ModelPairCompatibilityDivergencePanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="model-pair-compatibility-divergence-panel"]')).toBeNull();
  });

  it('交絡ペア（builderが常に同じadversaryとしか組んでいない）は乖離バッジを出さず、対象外である旨を表示する', () => {
    const runs = makePairRuns(1, 'b1', 'a1', 3, 2);
    const { container } = render(<ModelPairCompatibilityDivergencePanel runs={runs} />);

    expect(
      container.querySelector('[data-testid="model-pair-compatibility-row-b1__a1"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="model-pair-compatibility-flag-b1__a1"]')).toBeNull();
    expect(container.textContent).toContain('乖離判定の対象外');
    expect(container.querySelector('[data-testid="model-pair-compatibility-divergent-count"]')?.textContent).toBe(
      '1組中 乖離0組',
    );
  });

  it('乖離を検知したペアには乖離バッジと乖離幅(pt)を表示し、乖離度の高い順に並べる', () => {
    // 2x2クロス設計: 全セルが単体成績からの期待値と18.75pt乖離する
    const runs = [
      ...makePairRuns(1, 'B1', 'A1', 4, 4), // 100%
      ...makePairRuns(5, 'B1', 'A2', 4, 1), // 25%
      ...makePairRuns(9, 'B2', 'A1', 4, 1), // 25%
      ...makePairRuns(13, 'B2', 'A2', 4, 1), // 25%
    ];
    const { container } = render(<ModelPairCompatibilityDivergencePanel runs={runs} />);

    expect(container.querySelector('[data-testid="model-pair-compatibility-divergent-count"]')?.textContent).toBe(
      '4組中 乖離4組',
    );

    const flag = container.querySelector('[data-testid="model-pair-compatibility-flag-B1__A1"]');
    expect(flag).not.toBeNull();
    expect(flag?.textContent).toContain('18.8pt');

    const divergenceValue = container.querySelector('[data-testid="model-pair-compatibility-divergence-B1__A1"]');
    expect(divergenceValue?.textContent).toBe('+18.8pt');
    expect((divergenceValue as HTMLElement).className).toContain('text-emerald-400');

    const negativeDivergence = container.querySelector('[data-testid="model-pair-compatibility-divergence-B1__A2"]');
    expect(negativeDivergence?.textContent).toBe('-18.8pt');
    expect((negativeDivergence as HTMLElement).className).toContain('text-rose-400');

    // isDivergent が全行 true のため、乖離幅(絶対値)の降順→同点は builder→adversary 名昇順で並ぶ
    const rows = Array.from(container.querySelectorAll('[data-testid^="model-pair-compatibility-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'model-pair-compatibility-row-B1__A1',
      'model-pair-compatibility-row-B1__A2',
      'model-pair-compatibility-row-B2__A1',
      'model-pair-compatibility-row-B2__A2',
    ]);
  });

  it('サンプル数不足で乖離未検知のペアはバッジを出さず、件数と実測/期待の値を表示する', () => {
    const runs = [
      ...makePairRuns(1, 'b1', 'a1', 2, 2), // 100%, count=2 は閾値未満
      ...makePairRuns(3, 'b1', 'a2', 1, 0),
      ...makePairRuns(4, 'b2', 'a1', 1, 0),
    ];
    const { container } = render(<ModelPairCompatibilityDivergencePanel runs={runs} />);

    const row = container.querySelector('[data-testid="model-pair-compatibility-row-b1__a1"]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('2件 (merged 2)');
    expect(row?.textContent).toContain('実測 100.0% / 期待 83.3%');
    expect(container.querySelector('[data-testid="model-pair-compatibility-flag-b1__a1"]')).toBeNull();
  });
});
