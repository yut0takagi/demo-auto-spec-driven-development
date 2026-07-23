import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GateFailureTypesPanel } from './GateFailureTypesPanel';
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

describe('GateFailureTypesPanel', () => {
  it('run が0件、またはgateReasonsが全run空なら「データなし」を表示し、パネル本体を描画しない', () => {
    render(<GateFailureTypesPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();

    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] }),
      makeRun({ iteration: 2, verdict: 'paused', gateReasons: [] }),
      makeRun({ iteration: 3, verdict: 'dry-run', gateReasons: [] }),
    ];
    const { container } = render(<GateFailureTypesPanel runs={runs} />);
    expect(screen.getAllByText('データなし').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="gate-failure-types-panel"]')).toBeNull();
  });

  it('verdictごとの件数・割合・対象iterationを正確な値で表示する（部分一致に頼らない）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({
        iteration: 3,
        verdict: 'failed',
        gateReasons: ['反復が例外で異常終了した: AgentError: claude exited 1'],
      }),
    ];
    const { container } = render(<GateFailureTypesPanel runs={runs} />);

    expect(container.querySelector('[data-testid="gate-failure-types-panel"]')?.textContent).toContain('3件');

    const abandonedCount = container.querySelector('[data-testid="gate-failure-type-count-abandoned"]');
    expect(abandonedCount?.textContent).toBe('2件 (66.7%)');

    const failedCount = container.querySelector('[data-testid="gate-failure-type-count-failed"]');
    expect(failedCount?.textContent).toBe('1件 (33.3%)');

    const abandonedRow = container.querySelector('[data-testid="gate-failure-type-row-abandoned"]');
    expect(abandonedRow?.textContent).toContain('対象iteration: 1, 2');

    const failedRow = container.querySelector('[data-testid="gate-failure-type-row-failed"]');
    expect(failedRow?.textContent).toContain('対象iteration: 3');
  });

  it('paused/dry-runはgateReasonsが空である限り集計対象から除外される（意図的な非マージであり「不通過」ではないため）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({ iteration: 2, verdict: 'paused', gateReasons: [] }),
      makeRun({ iteration: 3, verdict: 'dry-run', gateReasons: [] }),
    ];
    const { container } = render(<GateFailureTypesPanel runs={runs} />);

    expect(container.querySelector('[data-testid="gate-failure-types-panel"]')?.textContent).toContain('1件');
    expect(container.querySelector('[data-testid="gate-failure-type-row-paused"]')).toBeNull();
    expect(container.querySelector('[data-testid="gate-failure-type-row-dry-run"]')).toBeNull();
  });

  it('バーの幅がそのverdictの割合と一致する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed', gateReasons: ['反復が例外で異常終了した: a'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['builder が変更を生成しなかった'] }),
      makeRun({ iteration: 3, verdict: 'abandoned', gateReasons: ['builder が変更を生成しなかった'] }),
      makeRun({ iteration: 4, verdict: 'abandoned', gateReasons: ['builder が変更を生成しなかった'] }),
    ];
    const { container } = render(<GateFailureTypesPanel runs={runs} />);
    const abandonedBar = container.querySelector('[data-testid="gate-failure-type-bar-abandoned"]') as HTMLElement;
    const failedBar = container.querySelector('[data-testid="gate-failure-type-bar-failed"]') as HTMLElement;
    // 4件中 abandoned=3 (75%), failed=1 (25%)
    expect(parseFloat(abandonedBar.style.width)).toBeCloseTo(75, 2);
    expect(parseFloat(failedBar.style.width)).toBeCloseTo(25, 2);
  });

  it('件数降順で行を並べ、同数はfailed→abandoned→needs-humanの順で安定させる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['builder が変更を生成しなかった'] }),
      makeRun({
        iteration: 2,
        verdict: 'needs-human',
        gateReasons: ['adversary が approve していない'],
      }),
      makeRun({
        iteration: 3,
        verdict: 'failed',
        gateReasons: ['反復が例外で異常終了した: a'],
      }),
    ];
    const { container } = render(<GateFailureTypesPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="gate-failure-type-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'gate-failure-type-row-failed',
      'gate-failure-type-row-abandoned',
      'gate-failure-type-row-needs-human',
    ]);
  });
});
