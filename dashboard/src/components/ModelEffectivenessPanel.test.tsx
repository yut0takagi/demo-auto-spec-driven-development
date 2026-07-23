import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ModelEffectivenessPanel } from './ModelEffectivenessPanel';
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

describe('ModelEffectivenessPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<ModelEffectivenessPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="model-effectiveness-panel"]')).toBeNull();
  });

  it('Sonnet と Haiku を builder に使った反復を分けて、マージ率・承認率・コストを正確な値で表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        reviseCycles: 0,
        adversary: { approved: true, summary: '' },
        verify: { unitPassed: true, e2ePassed: true, coveragePct: 90 },
        cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'needs-human',
        reviseCycles: 3,
        adversary: { approved: false, summary: '' },
        verify: { unitPassed: false, e2ePassed: false, coveragePct: 60 },
        cost: { builderUsd: 2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 2 },
        models: { builder: 'claude-haiku-4-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];

    const { container } = render(<ModelEffectivenessPanel runs={runs} />);

    expect(container.querySelector('[data-testid="model-effectiveness-panel"]')?.textContent).toContain(
      '2モデル',
    );

    const sonnetMerge = container.querySelector('[data-testid="model-effectiveness-merge-claude-sonnet-5"]');
    expect(sonnetMerge?.textContent).toBe('マージ率100.0% (1件)');

    const haikuMerge = container.querySelector('[data-testid="model-effectiveness-merge-claude-haiku-4-5"]');
    expect(haikuMerge?.textContent).toBe('マージ率0.0% (1件)');

    const sonnetStats = container.querySelector('[data-testid="model-effectiveness-stats-claude-sonnet-5"]');
    expect(sonnetStats?.textContent).toBe(
      '承認率100.0% / e2e失敗率0.0% / 平均revise0.0回 / 平均カバレッジ90.0% / 平均コスト$1.00',
    );

    const haikuStats = container.querySelector('[data-testid="model-effectiveness-stats-claude-haiku-4-5"]');
    expect(haikuStats?.textContent).toBe(
      '承認率0.0% / e2e失敗率100.0% / 平均revise3.0回 / 平均カバレッジ60.0% / 平均コスト$2.00',
    );

    // マージ率降順: sonnet(100%) が haiku(0%) より先に並ぶ
    const rows = Array.from(container.querySelectorAll('[data-testid^="model-effectiveness-row-"]'));
    expect(rows[0].getAttribute('data-testid')).toBe('model-effectiveness-row-claude-sonnet-5');
    expect(rows[1].getAttribute('data-testid')).toBe('model-effectiveness-row-claude-haiku-4-5');
  });

  it('バーの幅が最大マージ率のモデルに対する相対値と一致する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        models: { builder: 'model-a', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'merged',
        models: { builder: 'model-b', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'needs-human',
        adversary: { approved: false, summary: '' },
        models: { builder: 'model-b', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const { container } = render(<ModelEffectivenessPanel runs={runs} />);
    const barA = container.querySelector('[data-testid="model-effectiveness-bar-model-a"]') as HTMLElement;
    const barB = container.querySelector('[data-testid="model-effectiveness-bar-model-b"]') as HTMLElement;
    // model-a: mergeRate=1(100%), model-b: mergeRate=0.5(50%) → 最大は model-a なので a=100%, b=50%
    expect(parseFloat(barA.style.width)).toBeCloseTo(100, 2);
    expect(parseFloat(barB.style.width)).toBeCloseTo(50, 2);
  });

  it('対象iterationの一覧を昇順で表示する', () => {
    const runs = [
      makeRun({ iteration: 3, models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' } }),
      makeRun({ iteration: 1, models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' } }),
    ];
    const { container } = render(<ModelEffectivenessPanel runs={runs} />);
    const row = container.querySelector('[data-testid="model-effectiveness-row-claude-sonnet-5"]');
    expect(row?.textContent).toContain('対象iteration: 1, 3');
  });
});
