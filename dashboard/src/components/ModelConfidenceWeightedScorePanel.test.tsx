import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ModelConfidenceWeightedScorePanel } from './ModelConfidenceWeightedScorePanel';
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

describe('ModelConfidenceWeightedScorePanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<ModelConfidenceWeightedScorePanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="model-confidence-weighted-panel"]')).toBeNull();
  });

  it('1件しかないモデルの生マージ率100%を、加重スコアでは全体平均側に縮約して表示する', () => {
    const runs = [
      // model-a: 1件のみ merged → 生マージ率100%（暴れやすい極端値）
      makeRun({
        iteration: 1,
        verdict: 'merged',
        models: { builder: 'model-a', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      // model-b: 9件中3件 merged → 生マージ率33.3%
      ...Array.from({ length: 9 }, (_, i) =>
        makeRun({
          iteration: i + 2,
          verdict: i < 3 ? 'merged' : 'needs-human',
          models: { builder: 'model-b', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
        }),
      ),
    ];

    const { container } = render(<ModelConfidenceWeightedScorePanel runs={runs} />);

    expect(container.querySelector('[data-testid="model-confidence-weighted-panel"]')?.textContent).toContain(
      '2モデル',
    );

    // globalMean = 4/10 = 0.4, priorWeight=5 → model-a weighted = (1*1+5*0.4)/6 = 0.5 = 50.0%
    const scoreA = container.querySelector('[data-testid="model-confidence-weighted-score-model-a"]');
    expect(scoreA?.textContent).toBe('加重50.0%');
    const rawA = container.querySelector('[data-testid="model-confidence-weighted-raw-model-a"]');
    expect(rawA?.textContent).toBe('生マージ率100.0% (1件) / 信頼度17%');

    // model-b weighted = (9*(1/3)+5*0.4)/14 = 5/14 ≈ 35.7%
    const scoreB = container.querySelector('[data-testid="model-confidence-weighted-score-model-b"]');
    expect(scoreB?.textContent).toBe('加重35.7%');
    const rawB = container.querySelector('[data-testid="model-confidence-weighted-raw-model-b"]');
    expect(rawB?.textContent).toBe('生マージ率33.3% (9件) / 信頼度64%');

    // 生の値では model-a(100%) が model-b(33%) を圧倒しているが、
    // 加重後は model-a(50.0%) が model-b(35.7%) との差が大きく縮まっている
    const scoreAVal = parseFloat(scoreA!.textContent!.replace('加重', '').replace('%', ''));
    const scoreBVal = parseFloat(scoreB!.textContent!.replace('加重', '').replace('%', ''));
    expect(scoreAVal - scoreBVal).toBeLessThan(100 - 100 / 3);
  });

  it('少数サンプル（count < 5）のモデルには注意書きを表示し、十分な件数のモデルには表示しない', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        models: { builder: 'model-few', adversary: 'x', ideation: 'x' },
      }),
      ...Array.from({ length: 6 }, (_, i) =>
        makeRun({
          iteration: i + 2,
          verdict: 'merged',
          models: { builder: 'model-many', adversary: 'x', ideation: 'x' },
        }),
      ),
    ];
    const { container } = render(<ModelConfidenceWeightedScorePanel runs={runs} />);
    expect(
      container.querySelector('[data-testid="model-confidence-weighted-lowsample-model-few"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="model-confidence-weighted-lowsample-model-many"]'),
    ).toBeNull();
  });

  it('バーの幅が最大加重スコアのモデルに対する相対値と一致する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'needs-human',
        adversary: { approved: false, summary: '' },
        models: { builder: 'model-b', adversary: 'x', ideation: 'x' },
      }),
    ];
    const { container } = render(<ModelConfidenceWeightedScorePanel runs={runs} />);
    const barA = container.querySelector('[data-testid="model-confidence-weighted-bar-model-a"]') as HTMLElement;
    const barB = container.querySelector('[data-testid="model-confidence-weighted-bar-model-b"]') as HTMLElement;
    expect(parseFloat(barA.style.width)).toBeCloseTo(100, 2);
    expect(parseFloat(barB.style.width)).toBeLessThan(100);
  });

  it('加重スコア降順で並び、対象iterationを昇順表示する', () => {
    const runs = [
      makeRun({ iteration: 3, verdict: 'merged', models: { builder: 'model-a', adversary: 'x', ideation: 'x' } }),
      makeRun({ iteration: 1, verdict: 'merged', models: { builder: 'model-a', adversary: 'x', ideation: 'x' } }),
      makeRun({
        iteration: 2,
        verdict: 'needs-human',
        adversary: { approved: false, summary: '' },
        models: { builder: 'model-b', adversary: 'x', ideation: 'x' },
      }),
    ];
    const { container } = render(<ModelConfidenceWeightedScorePanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="model-confidence-weighted-row-"]'));
    expect(rows[0].getAttribute('data-testid')).toBe('model-confidence-weighted-row-model-a');
    expect(rows[1].getAttribute('data-testid')).toBe('model-confidence-weighted-row-model-b');
    expect(rows[0].textContent).toContain('対象iteration: 1, 3');
  });
});
