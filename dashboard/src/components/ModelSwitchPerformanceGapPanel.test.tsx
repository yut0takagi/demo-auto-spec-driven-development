import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ModelSwitchPerformanceGapPanel } from './ModelSwitchPerformanceGapPanel';
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

function makeSwitchRun(iteration: number, model: string, durationSec: number, costUsd: number): RunRecord {
  return makeRun({
    iteration,
    durationSec,
    cost: { builderUsd: costUsd, adversaryUsd: 0, ideationUsd: 0, totalUsd: costUsd },
    models: { builder: model, adversary: 'x', ideation: 'x' },
  });
}

describe('ModelSwitchPerformanceGapPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<ModelSwitchPerformanceGapPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="model-switch-perf-gap-panel"]')).toBeNull();
  });

  it('切り替え後に所要時間が短縮・コストが増加した場合、フォーマット済みの値とdeltaの符号込みでそれぞれ改善/悪化と表示される', () => {
    const runs = [makeSwitchRun(1, 'model-a', 600, 0.2), makeSwitchRun(2, 'model-b', 300, 0.4)];
    const { container } = render(<ModelSwitchPerformanceGapPanel runs={runs} />);

    expect(container.querySelector('[data-testid="model-switch-perf-gap-panel"]')).not.toBeNull();
    expect(container.textContent).toContain('1回の切り替え');

    expect(container.querySelector('[data-testid="model-switch-perf-duration-value-1"]')?.textContent).toBe(
      '10.0分 → 5.0分'
    );
    expect(container.querySelector('[data-testid="model-switch-perf-duration-verdict-1"]')?.textContent).toBe(
      '-5.0分 (改善)'
    );
    expect(container.querySelector('[data-testid="model-switch-perf-cost-value-1"]')?.textContent).toBe(
      '$0.20 → $0.40'
    );
    expect(container.querySelector('[data-testid="model-switch-perf-cost-verdict-1"]')?.textContent).toBe(
      '+0.20 (悪化)'
    );
  });

  it('切り替え後に所要時間・コストとも変化が無ければ「変化なし」と表示される', () => {
    const runs = [makeSwitchRun(1, 'model-a', 300, 0.12), makeSwitchRun(2, 'model-b', 300, 0.12)];
    const { container } = render(<ModelSwitchPerformanceGapPanel runs={runs} />);
    expect(container.querySelector('[data-testid="model-switch-perf-duration-verdict-1"]')?.textContent).toBe(
      '0.0分 (変化なし)'
    );
    expect(container.querySelector('[data-testid="model-switch-perf-cost-verdict-1"]')?.textContent).toBe(
      '0.00 (変化なし)'
    );
  });

  it('複数回切り替わった場合、各切り替えイベントを switchIndex 順に個別の行として表示し、A→B→A再登板を独立イベント（悪化）として扱う', () => {
    const runs = [makeSwitchRun(1, 'model-a', 300, 0.1), makeSwitchRun(2, 'model-b', 300, 0.1), makeSwitchRun(3, 'model-a', 600, 0.3)];
    const { container } = render(<ModelSwitchPerformanceGapPanel runs={runs} />);
    expect(container.textContent).toContain('2回の切り替え');

    const rows = Array.from(container.querySelectorAll('[data-testid^="model-switch-perf-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'model-switch-perf-row-1',
      'model-switch-perf-row-2',
    ]);

    expect(rows[0].textContent).toContain('model-a (iteration 1〜1) → model-b (iteration 2〜2)');
    expect(container.querySelector('[data-testid="model-switch-perf-duration-verdict-1"]')?.textContent).toBe(
      '0.0分 (変化なし)'
    );

    // model-b(iteration2) → 再登板の model-a(iteration3) は前回のmodel-a区間と合算されない
    expect(rows[1].textContent).toContain('model-b (iteration 2〜2) → model-a (iteration 3〜3)');
    expect(container.querySelector('[data-testid="model-switch-perf-duration-verdict-2"]')?.textContent).toBe(
      '+5.0分 (悪化)'
    );
    expect(rows[1].textContent).toContain('対象反復数: model-b 1件 / model-a 1件');
  });
});
