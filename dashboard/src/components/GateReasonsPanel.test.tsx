import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GateReasonsPanel } from './GateReasonsPanel';
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

describe('GateReasonsPanel', () => {
  it('run が0件、またはgateReasonsが全run空なら「データなし」を表示し、パネル本体を描画しない', () => {
    render(<GateReasonsPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();

    const runs = [makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] })];
    const { container } = render(<GateReasonsPanel runs={runs} />);
    expect(screen.getAllByText('データなし').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="gate-reasons-panel"]')).toBeNull();
  });

  it('分類ごとの件数・割合・対象iterationを正確な値で表示する（部分一致に頼らない）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['変更行数 500 が上限 400 を超えている'],
      }),
    ];
    const { container } = render(<GateReasonsPanel runs={runs} />);

    // 合計件数ヘッダ
    expect(container.querySelector('[data-testid="gate-reasons-panel"]')?.textContent).toContain('3件');

    const adversaryCount = container.querySelector('[data-testid="gate-reason-count-adversaryNotApproved"]');
    expect(adversaryCount?.textContent).toBe('2件 (66.7%)');

    const linesCount = container.querySelector('[data-testid="gate-reason-count-changedLinesExceeded"]');
    expect(linesCount?.textContent).toBe('1件 (33.3%)');

    const adversaryRow = container.querySelector('[data-testid="gate-reason-row-adversaryNotApproved"]');
    expect(adversaryRow?.textContent).toContain('対象iteration: 1, 2');

    const linesRow = container.querySelector('[data-testid="gate-reason-row-changedLinesExceeded"]');
    expect(linesRow?.textContent).toContain('対象iteration: 3');
  });

  it('バーの幅がそのカテゴリの割合と一致する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['builder が変更を生成しなかった'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 3, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 4, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
    ];
    const { container } = render(<GateReasonsPanel runs={runs} />);
    const e2eBar = container.querySelector('[data-testid="gate-reason-bar-e2eFailed"]') as HTMLElement;
    const noChangesBar = container.querySelector('[data-testid="gate-reason-bar-noChanges"]') as HTMLElement;
    // 4件中 e2eFailed=3 (75%), noChanges=1 (25%)
    expect(parseFloat(e2eBar.style.width)).toBeCloseTo(75, 2);
    expect(parseFloat(noChangesBar.style.width)).toBeCloseTo(25, 2);
  });

  it('件数降順で行を並べる（同数はgates.py評価順で安定）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['builder が変更を生成しなかった'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({ iteration: 3, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
    ];
    const { container } = render(<GateReasonsPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="gate-reason-row-"]'));
    expect(rows[0].getAttribute('data-testid')).toBe('gate-reason-row-adversaryNotApproved');
    expect(rows[1].getAttribute('data-testid')).toBe('gate-reason-row-noChanges');
  });

  it('未知の理由文字列は「その他」として表示される', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['まだ分類されていない理由'] })];
    const { container } = render(<GateReasonsPanel runs={runs} />);
    const row = container.querySelector('[data-testid="gate-reason-row-other"]');
    expect(row?.textContent).toContain('その他');
    expect(row?.textContent).toContain('1件 (100.0%)');
  });
});
