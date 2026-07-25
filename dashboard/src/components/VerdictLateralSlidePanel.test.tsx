import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VerdictLateralSlidePanel } from './VerdictLateralSlidePanel';
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

describe('VerdictLateralSlidePanel', () => {
  it('横滑り区間が無い場合は理由付きの空状態メッセージを表示し、パネル本体を描画しない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'merged' }),
    ];
    const { container } = render(<VerdictLateralSlidePanel runs={runs} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(screen.getByText(/2回以上連続/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="verdict-lateral-slide-panel"]')).toBeNull();
  });

  it('shiftedFailureが2連続(3反復)する実データ系列を1件の横滑りとして描画する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed', cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 } }),
      makeRun({ iteration: 2, verdict: 'needs-human', cost: { builderUsd: 2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 2 } }),
      makeRun({ iteration: 3, verdict: 'paused', cost: { builderUsd: 3, adversaryUsd: 0, ideationUsd: 0, totalUsd: 3 } }),
    ];
    const { container } = render(<VerdictLateralSlidePanel runs={runs} />);
    const panel = container.querySelector('[data-testid="verdict-lateral-slide-panel"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('1件');

    const row = container.querySelector('[data-testid="lateral-slide-row-1"]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('iteration 1〜3');
    expect(row?.textContent).toContain('failed → needs-human → paused');
    expect(row?.textContent).toContain('型の振れ幅 3');
    expect(row?.textContent).toContain('$6.00');

    // データ終端まで続き最後がabandonedではないので進行中
    expect(container.querySelector('[data-testid="lateral-slide-outcome-1"]')?.textContent).toBe('進行中');
    expect(row?.getAttribute('data-outcome')).toBe('ongoing');
  });

  it('区間直後にmergedへ到達するとoutcomeが「回復済み」になる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'needs-human' }),
      makeRun({ iteration: 3, verdict: 'paused' }),
      makeRun({ iteration: 4, verdict: 'merged' }),
    ];
    const { container } = render(<VerdictLateralSlidePanel runs={runs} />);
    expect(container.querySelector('[data-testid="lateral-slide-outcome-1"]')?.textContent).toBe('回復済み');
    expect(container.querySelector('[data-testid="lateral-slide-row-1"]')?.getAttribute('data-outcome')).toBe(
      'recovered',
    );
  });

  it('区間がデータ終端まで続き最後がabandonedならoutcomeが「離脱」になる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'needs-human' }),
      makeRun({ iteration: 3, verdict: 'abandoned' }),
    ];
    const { container } = render(<VerdictLateralSlidePanel runs={runs} />);
    expect(container.querySelector('[data-testid="lateral-slide-outcome-1"]')?.textContent).toBe('離脱');
    expect(container.querySelector('[data-testid="lateral-slide-row-1"]')?.getAttribute('data-outcome')).toBe(
      'droppedOut',
    );
  });

  it('複数の独立した横滑り区間をそれぞれ別の行として描画する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'needs-human' }),
      makeRun({ iteration: 3, verdict: 'paused' }),
      makeRun({ iteration: 4, verdict: 'merged' }),
      makeRun({ iteration: 5, verdict: 'merged' }),
      makeRun({ iteration: 6, verdict: 'failed' }),
      makeRun({ iteration: 7, verdict: 'needs-human' }),
      makeRun({ iteration: 8, verdict: 'paused' }),
    ];
    const { container } = render(<VerdictLateralSlidePanel runs={runs} />);
    const panel = container.querySelector('[data-testid="verdict-lateral-slide-panel"]');
    expect(panel?.textContent).toContain('2件');
    expect(container.querySelector('[data-testid="lateral-slide-row-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="lateral-slide-row-6"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="lateral-slide-outcome-1"]')?.textContent).toBe('回復済み');
    expect(container.querySelector('[data-testid="lateral-slide-outcome-6"]')?.textContent).toBe('進行中');
  });
});
