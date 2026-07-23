import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviseCyclesByModelPanel } from './ReviseCyclesByModelPanel';
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

describe('ReviseCyclesByModelPanel', () => {
  it('run が0件、またはfailedのみ（verify未到達）なら「データなし」を表示し、パネル本体を描画しない', () => {
    render(<ReviseCyclesByModelPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();

    const runs = [makeRun({ iteration: 1, verdict: 'failed', reviseCycles: 99 })];
    const { container } = render(<ReviseCyclesByModelPanel runs={runs} />);
    expect(screen.getAllByText('データなし').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="revise-cycles-by-model-panel"]')).toBeNull();
  });

  it('builder モデルごとの平均/中央値/範囲/件数を正確な値で表示する（部分一致に頼らない）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        reviseCycles: 1,
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        reviseCycles: 5,
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 3,
        reviseCycles: 0,
        models: { builder: 'claude-opus-4-8', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const { container } = render(<ReviseCyclesByModelPanel runs={runs} />);

    expect(container.querySelector('[data-testid="revise-cycles-by-model-panel"]')?.textContent).toContain(
      '2モデル',
    );

    const sonnetStats = container.querySelector('[data-testid="revise-model-stats-claude-sonnet-5"]');
    expect(sonnetStats?.textContent).toBe('平均3.0 / 中央値3.0 / 1〜5回 (2件)');

    const opusStats = container.querySelector('[data-testid="revise-model-stats-claude-opus-4-8"]');
    expect(opusStats?.textContent).toBe('平均0.0 / 中央値0.0 / 0〜0回 (1件)');

    const sonnetRow = container.querySelector('[data-testid="revise-model-row-claude-sonnet-5"]');
    expect(sonnetRow?.textContent).toContain('対象iteration: 1, 2');
  });

  it('バーの幅が平均値の最大モデルに対する相対値と一致する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        reviseCycles: 4,
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        reviseCycles: 2,
        models: { builder: 'claude-opus-4-8', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const { container } = render(<ReviseCyclesByModelPanel runs={runs} />);
    const sonnetBar = container.querySelector('[data-testid="revise-model-bar-claude-sonnet-5"]') as HTMLElement;
    const opusBar = container.querySelector('[data-testid="revise-model-bar-claude-opus-4-8"]') as HTMLElement;
    // 最大平均は sonnet(4) なので sonnet=100%, opus=2/4*100=50%
    expect(parseFloat(sonnetBar.style.width)).toBeCloseTo(100, 2);
    expect(parseFloat(opusBar.style.width)).toBeCloseTo(50, 2);
  });

  it('平均revise回数の降順でモデルを並べる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        reviseCycles: 1,
        models: { builder: 'low-model', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        reviseCycles: 9,
        models: { builder: 'high-model', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const { container } = render(<ReviseCyclesByModelPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="revise-model-row-"]'));
    expect(rows[0].getAttribute('data-testid')).toBe('revise-model-row-high-model');
    expect(rows[1].getAttribute('data-testid')).toBe('revise-model-row-low-model');
  });
});
