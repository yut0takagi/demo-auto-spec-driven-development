import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ModelEfficiencyPanel } from './ModelEfficiencyPanel';
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

describe('ModelEfficiencyPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<ModelEfficiencyPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="model-efficiency-panel"]')).toBeNull();
  });

  it('役割ごとにモデル別のマージ率とコストを分離して表示し、role単体のコストのみを集計する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        cost: { builderUsd: 1, adversaryUsd: 0.1, ideationUsd: 0.05, totalUsd: 1.15 },
        models: { builder: 'sonnet', adversary: 'haiku', ideation: 'haiku' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'needs-human',
        cost: { builderUsd: 2, adversaryUsd: 0.2, ideationUsd: 0.3, totalUsd: 2.5 },
        models: { builder: 'sonnet', adversary: 'haiku', ideation: 'opus' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'merged',
        cost: { builderUsd: 0.5, adversaryUsd: 0.4, ideationUsd: 0.1, totalUsd: 1.0 },
        models: { builder: 'haiku', adversary: 'sonnet', ideation: 'haiku' },
      }),
    ];

    const { container } = render(<ModelEfficiencyPanel runs={runs} />);

    // builder: haiku(mergeRate 100%) が sonnet(mergeRate 50%) より先に並ぶ
    const builderRole = container.querySelector('[data-testid="model-efficiency-role-builder"]');
    const builderEntries = Array.from(
      builderRole?.querySelectorAll('[data-testid^="model-efficiency-entry-builder-"]') ?? [],
    );
    expect(builderEntries.map((e) => e.getAttribute('data-testid'))).toEqual([
      'model-efficiency-entry-builder-haiku',
      'model-efficiency-entry-builder-sonnet',
    ]);

    const builderHaikuMerge = container.querySelector('[data-testid="model-efficiency-merge-builder-haiku"]');
    expect(builderHaikuMerge?.textContent).toBe('マージ率100.0% (1件)');
    const builderSonnetMerge = container.querySelector('[data-testid="model-efficiency-merge-builder-sonnet"]');
    expect(builderSonnetMerge?.textContent).toBe('マージ率50.0% (2件)');

    // builder の sonnet は builderUsd(1+2=3) のみを集計し、adversary/ideation のコストと混ざらない
    const builderSonnetStats = container.querySelector('[data-testid="model-efficiency-stats-builder-sonnet"]');
    expect(builderSonnetStats?.textContent).toBe('コスト$3.00（平均$1.50/件）/ マージ1件あたり$3.00');

    // adversary: 同じ haiku モデルでも adversaryUsd(0.1+0.2=0.3) のみを集計する（builder役割の$3.00とは別値）
    const adversaryHaikuStats = container.querySelector('[data-testid="model-efficiency-stats-adversary-haiku"]');
    expect(adversaryHaikuStats?.textContent).toBe('コスト$0.30（平均$0.15/件）/ マージ1件あたり$0.30');

    // ideation: opus はマージ0件のため「マージ1件あたり」は算出不可と表示する
    const ideationOpusStats = container.querySelector('[data-testid="model-efficiency-stats-ideation-opus"]');
    expect(ideationOpusStats?.textContent).toBe('コスト$0.30（平均$0.30/件）/ マージ1件あたり算出不可（マージ0件）');
  });

  it('バーの幅が同一role内の最大マージ率に対する相対値と一致する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', models: { builder: 'model-a', adversary: 'x', ideation: 'x' } }),
      makeRun({ iteration: 2, verdict: 'merged', models: { builder: 'model-b', adversary: 'x', ideation: 'x' } }),
      makeRun({
        iteration: 3,
        verdict: 'needs-human',
        adversary: { approved: false, summary: '' },
        models: { builder: 'model-b', adversary: 'x', ideation: 'x' },
      }),
    ];
    const { container } = render(<ModelEfficiencyPanel runs={runs} />);
    const barA = container.querySelector('[data-testid="model-efficiency-bar-builder-model-a"]') as HTMLElement;
    const barB = container.querySelector('[data-testid="model-efficiency-bar-builder-model-b"]') as HTMLElement;
    // model-a: mergeRate=1(100%), model-b: mergeRate=0.5(50%) → 最大は model-a なので a=100%, b=50%
    expect(parseFloat(barA.style.width)).toBeCloseTo(100, 2);
    expect(parseFloat(barB.style.width)).toBeCloseTo(50, 2);
  });

  it('対象iterationの一覧を昇順で表示する', () => {
    const runs = [
      makeRun({ iteration: 3, models: { builder: 'claude-sonnet-5', adversary: 'x', ideation: 'x' } }),
      makeRun({ iteration: 1, models: { builder: 'claude-sonnet-5', adversary: 'x', ideation: 'x' } }),
    ];
    const { container } = render(<ModelEfficiencyPanel runs={runs} />);
    const entry = container.querySelector('[data-testid="model-efficiency-entry-builder-claude-sonnet-5"]');
    expect(entry?.textContent).toContain('対象iteration: 1, 3');
  });
});
