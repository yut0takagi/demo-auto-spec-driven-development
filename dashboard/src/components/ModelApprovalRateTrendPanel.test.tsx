import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ModelApprovalRateTrendPanel } from './ModelApprovalRateTrendPanel';
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

describe('ModelApprovalRateTrendPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体もsvgも描画しない', () => {
    const { container } = render(<ModelApprovalRateTrendPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="model-approval-rate-trend-panel"]')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('全反復がfailedでverify未到達ならモデルが1件あっても「データなし」（境界値）', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'failed', adversary: { approved: false, summary: '' } })];
    const { container } = render(<ModelApprovalRateTrendPanel runs={runs} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="model-approval-rate-trend-panel"]')).toBeNull();
  });

  it('builderモデルごとに独立した折れ線と最新承認率を表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        adversary: { approved: true, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        adversary: { approved: false, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 3,
        adversary: { approved: false, summary: '' },
        models: { builder: 'claude-haiku-4-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const { container } = render(<ModelApprovalRateTrendPanel runs={runs} />);

    const panel = container.querySelector('[data-testid="model-approval-rate-trend-panel"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('2モデル');

    // sonnet: 2件の点があるので path(折れ線)、haiku: 1件だけなので circle(単一点)
    expect(container.querySelector('[data-testid="model-approval-rate-trend-line-claude-sonnet-5"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-approval-rate-trend-point-claude-haiku-4-5"]')).not.toBeNull();

    const sonnetLegend = container.querySelector('[data-testid="model-approval-rate-trend-latest-claude-sonnet-5"]');
    // sonnet: iteration1 approved(100%) → iteration2 not approved(50%)
    expect(sonnetLegend?.textContent).toBe('最新50.0% (2件)');

    const haikuLegend = container.querySelector('[data-testid="model-approval-rate-trend-latest-claude-haiku-4-5"]');
    expect(haikuLegend?.textContent).toBe('最新0.0% (1件)');

    // NaN が座標に紛れ込んでいない
    expect(container.querySelector('svg')?.innerHTML).not.toMatch(/NaN/);
  });

  it('verify到達済み反復を持たないmodelは「データなし」の凡例行を表示し、svgには描画しない', () => {
    const runs = [
      makeRun({
        iteration: 1,
        adversary: { approved: true, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'failed',
        adversary: { approved: false, summary: '' },
        models: { builder: 'claude-haiku-4-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const { container } = render(<ModelApprovalRateTrendPanel runs={runs} />);

    const panel = container.querySelector('[data-testid="model-approval-rate-trend-panel"]');
    expect(panel?.textContent).toContain('2モデル');

    const haikuLegend = container.querySelector('[data-testid="model-approval-rate-trend-latest-claude-haiku-4-5"]');
    expect(haikuLegend?.textContent).toBe('データなし (0件)');

    expect(container.querySelector('[data-testid="model-approval-rate-trend-line-claude-haiku-4-5"]')).toBeNull();
    expect(container.querySelector('[data-testid="model-approval-rate-trend-point-claude-haiku-4-5"]')).toBeNull();
  });

  it('折れ線とその凡例の色（インデックス）が一致する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        adversary: { approved: true, summary: '' },
        models: { builder: 'alpha-model', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        adversary: { approved: true, summary: '' },
        models: { builder: 'alpha-model', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 3,
        adversary: { approved: true, summary: '' },
        models: { builder: 'beta-model', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 4,
        adversary: { approved: true, summary: '' },
        models: { builder: 'beta-model', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const { container } = render(<ModelApprovalRateTrendPanel runs={runs} />);

    // 同数(2件ずつ)なのでモデル名昇順: alpha-model が index 0、beta-model が index 1
    const alphaLine = container.querySelector('[data-testid="model-approval-rate-trend-line-alpha-model"]');
    const alphaDot = container.querySelector('[data-testid="model-approval-rate-trend-legend-alpha-model"] span span');
    expect(alphaLine?.getAttribute('class')).toContain('text-sky-400');
    expect(alphaDot?.getAttribute('class')).toContain('bg-sky-400');

    const betaLine = container.querySelector('[data-testid="model-approval-rate-trend-line-beta-model"]');
    const betaDot = container.querySelector('[data-testid="model-approval-rate-trend-legend-beta-model"] span span');
    expect(betaLine?.getAttribute('class')).toContain('text-emerald-400');
    expect(betaDot?.getAttribute('class')).toContain('bg-emerald-400');
  });
});
