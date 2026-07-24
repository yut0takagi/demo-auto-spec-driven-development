import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BuilderModelGateReasonCorrelationPanel } from './BuilderModelGateReasonCorrelationPanel';
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

describe('BuilderModelGateReasonCorrelationPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<BuilderModelGateReasonCorrelationPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="builder-model-gate-reason-correlation-panel"]')).toBeNull();
  });

  it('gateReasonsが全反復で空(mergedのみ)の場合も「データなし」になる', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] })];
    const { container } = render(<BuilderModelGateReasonCorrelationPanel runs={runs} />);
    expect(container.textContent).toContain('データなし');
  });

  it('平均より過剰発生しているカテゴリのliftとバー幅を正しく表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['e2e(Playwright) が失敗している'],
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 4,
        verdict: 'abandoned',
        gateReasons: ['e2e(Playwright) が失敗している'],
        models: { builder: 'model-b', adversary: 'x', ideation: 'x' },
      }),
    ];
    const { container } = render(<BuilderModelGateReasonCorrelationPanel runs={runs} />);

    expect(container.querySelector('[data-testid="builder-model-gate-reason-correlation-panel"]')).not.toBeNull();

    const totalA = container.querySelector('[data-testid="builder-model-gate-reason-total-model-a"]');
    expect(totalA?.textContent).toContain('理由出現 3件');

    // model-a の verifyFailed: 2/3=66.7% (自) / 全体50% → lift 1.33x
    const liftA = container.querySelector('[data-testid="builder-model-gate-reason-lift-model-a-verifyFailed"]');
    expect(liftA?.textContent).toContain('lift 1.33x');
    expect(liftA?.textContent).toContain('2件');

    const barA = container.querySelector(
      '[data-testid="builder-model-gate-reason-bar-model-a-verifyFailed"]',
    ) as HTMLElement;
    // lift(1.333...) * 50 = 66.67% 幅、100%に張り付かない
    expect(parseFloat(barA.style.width)).toBeCloseTo((2 / 3 / 0.5) * 50, 1);
    expect(barA.className).toContain('bg-rose-400');

    // model-b の e2eFailed: 1/1=100%(自) / 全体50% → lift 2.0x（100%を超える幅は切り詰め）
    const liftB = container.querySelector('[data-testid="builder-model-gate-reason-lift-model-b-e2eFailed"]');
    expect(liftB?.textContent).toContain('lift 2.00x');
    const barB = container.querySelector(
      '[data-testid="builder-model-gate-reason-bar-model-b-e2eFailed"]',
    ) as HTMLElement;
    expect(parseFloat(barB.style.width)).toBe(100);
    expect(barB.className).toContain('bg-rose-400');
  });

  it('平均より明確に少ないカテゴリは緑バーになる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['e2e(Playwright) が失敗している'],
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 4,
        verdict: 'abandoned',
        gateReasons: ['e2e(Playwright) が失敗している'],
        models: { builder: 'model-b', adversary: 'x', ideation: 'x' },
      }),
    ];
    const { container } = render(<BuilderModelGateReasonCorrelationPanel runs={runs} />);

    // model-a の e2eFailed: 1/3=33.3%(自) / 全体50% → lift 0.67x（0.8以下なので緑）
    const barA = container.querySelector(
      '[data-testid="builder-model-gate-reason-bar-model-a-e2eFailed"]',
    ) as HTMLElement;
    expect(barA.className).toContain('bg-emerald-400');
  });

  it('モデルが複数あるとき、それぞれ独立した行として描画する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['builder が変更を生成しなかった'],
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['builder が変更を生成しなかった'],
        models: { builder: 'model-b', adversary: 'x', ideation: 'x' },
      }),
    ];
    const { container } = render(<BuilderModelGateReasonCorrelationPanel runs={runs} />);
    const rows = container.querySelectorAll('[data-testid^="builder-model-gate-reason-row-"]');
    expect(rows).toHaveLength(2);
  });
});
