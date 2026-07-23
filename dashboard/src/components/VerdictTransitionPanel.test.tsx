import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VerdictTransitionPanel } from './VerdictTransitionPanel';
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

describe('VerdictTransitionPanel', () => {
  it('隣接ペアが無い(run 1件以下)なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<VerdictTransitionPanel runs={[makeRun({ iteration: 1 })]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="verdict-transition-panel"]')).toBeNull();
  });

  it('遷移件数と種別ごとの件数・割合を実際のverdict系列から正しく算出する', () => {
    // merged→failed(regressed), failed→abandoned(repeatedFailureではなくshiftedFailure), abandoned→merged(recovered)
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'abandoned' }),
      makeRun({ iteration: 4, verdict: 'merged' }),
    ];
    const { container } = render(<VerdictTransitionPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="verdict-transition-panel"]');
    expect(panel?.textContent).toContain('3遷移');

    // 1→2: merged→failed = regressed, 2→3: failed→abandoned = shiftedFailure, 3→4: abandoned→merged = recovered
    const regressedCount = container.querySelector('[data-testid="verdict-transition-kind-count-regressed"]');
    const shiftedCount = container.querySelector('[data-testid="verdict-transition-kind-count-shiftedFailure"]');
    const recoveredCount = container.querySelector('[data-testid="verdict-transition-kind-count-recovered"]');
    expect(regressedCount?.textContent).toBe('1件 (33.3%)');
    expect(shiftedCount?.textContent).toBe('1件 (33.3%)');
    expect(recoveredCount?.textContent).toBe('1件 (33.3%)');

    // 出現しなかった種別(sustainedSuccess/repeatedFailure)は描画されない
    expect(container.querySelector('[data-testid="verdict-transition-kind-sustainedSuccess"]')).toBeNull();
    expect(container.querySelector('[data-testid="verdict-transition-kind-repeatedFailure"]')).toBeNull();
  });

  it('同じ非merged verdictが連続するとrepeatedFailureとして分類する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
    ];
    const { container } = render(<VerdictTransitionPanel runs={runs} />);
    expect(
      container.querySelector('[data-testid="verdict-transition-kind-count-repeatedFailure"]')?.textContent,
    ).toBe('1件 (100.0%)');
  });

  it('2回未満の非マージ連続は離脱パターンとして扱わず「データなし」を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'merged' }),
    ];
    const { container } = render(<VerdictTransitionPanel runs={runs} />);
    expect(container.querySelector('[data-testid="dropout-streak-count"]')?.textContent).toBe('0件');
    expect(container.querySelector('[data-testid^="dropout-streak-row-"]')).toBeNull();
  });

  it('非マージが2回以上連続しmergedで終わればrecovered、abandonedで終端に達すればdroppedOutと分類する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed', cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 } }),
      makeRun({ iteration: 2, verdict: 'needs-human', cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 } }),
      makeRun({ iteration: 3, verdict: 'merged' }),
      makeRun({ iteration: 4, verdict: 'abandoned', cost: { builderUsd: 2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 2 } }),
      makeRun({ iteration: 5, verdict: 'abandoned', cost: { builderUsd: 3, adversaryUsd: 0, ideationUsd: 0, totalUsd: 3 } }),
    ];
    const { container } = render(<VerdictTransitionPanel runs={runs} />);
    expect(container.querySelector('[data-testid="dropout-streak-count"]')?.textContent).toBe('2件');

    const recoveredRow = container.querySelector('[data-testid="dropout-streak-row-1"]');
    expect(recoveredRow?.getAttribute('data-outcome')).toBe('recovered');
    expect(
      container.querySelector('[data-testid="dropout-streak-outcome-1"]')?.textContent,
    ).toBe('回復済み');
    expect(recoveredRow?.textContent).toContain('iteration 1〜2（2反復連続）');
    expect(recoveredRow?.textContent).toContain('failed → needs-human');
    expect(recoveredRow?.textContent).toContain('浪費コスト $2.00');

    const droppedRow = container.querySelector('[data-testid="dropout-streak-row-4"]');
    expect(droppedRow?.getAttribute('data-outcome')).toBe('droppedOut');
    expect(
      container.querySelector('[data-testid="dropout-streak-outcome-4"]')?.textContent,
    ).toBe('離脱');
    expect(droppedRow?.textContent).toContain('浪費コスト $5.00');
  });

  it('データ終端まで非マージが連続し最後がabandonedでなければongoing(進行中)として扱う', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'paused' }),
    ];
    const { container } = render(<VerdictTransitionPanel runs={runs} />);
    const row = container.querySelector('[data-testid="dropout-streak-row-2"]');
    expect(row?.getAttribute('data-outcome')).toBe('ongoing');
    expect(container.querySelector('[data-testid="dropout-streak-outcome-2"]')?.textContent).toBe('進行中');
  });
});
