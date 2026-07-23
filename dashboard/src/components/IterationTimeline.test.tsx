import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IterationTimeline } from './IterationTimeline';
import type { RunRecord, Verdict } from '@/lib/types';

function makeRun(overrides: Partial<RunRecord> & { iteration: number; verdict: Verdict }): RunRecord {
  return {
    id: `run-${overrides.iteration}`,
    issue: { number: overrides.iteration, title: `issue ${overrides.iteration}`, labels: [] },
    branch: `feature/${overrides.iteration}`,
    startedAt: '2026-07-20T00:00:00Z',
    finishedAt: '2026-07-20T00:10:00Z',
    durationSec: 600,
    reviseCycles: 0,
    gateReasons: [],
    prNumber: null,
    adversary: { approved: true, summary: 'ok' },
    verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 },
    changedLines: 10,
    cost: { builderUsd: 0.1, adversaryUsd: 0.1, ideationUsd: 0.1, totalUsd: 0.3 },
    models: { builder: 'x', adversary: 'y', ideation: 'z' },
    nextIssues: [],
    ...overrides,
  };
}

describe('IterationTimeline', () => {
  it('反復がなければ「まだ反復がありません」と表示する', () => {
    render(<IterationTimeline runs={[]} />);
    expect(screen.getByText('まだ反復がありません')).toBeInTheDocument();
  });

  it('iteration 降順で並べる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 3, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'merged' }),
    ];
    render(<IterationTimeline runs={runs} />);
    const items = screen.getAllByText(/^#\d+$/);
    expect(items.map((el) => el.textContent)).toEqual(['#3', '#2', '#1']);
  });

  // Verdict の全メンバー (merged/abandoned/needs-human/paused/dry-run/failed) を描画できる
  // ことを保証する。verdict が増えたのにここへ足さないと Record<Verdict, string> の
  // typecheck が落ちる（別の落とし穴として仕様に明記あり）。
  it.each<Verdict>(['merged', 'abandoned', 'needs-human', 'paused', 'dry-run', 'failed'])(
    'verdict "%s" を持つ反復を表示できる',
    (verdict) => {
      const runs = [makeRun({ iteration: 1, verdict })];
      render(<IterationTimeline runs={runs} />);
      expect(screen.getByText(verdict)).toBeInTheDocument();
    }
  );

  it('コストの浮動小数点誤差を丸めて表示する（生の float を DOM に出さない）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        cost: { builderUsd: 0.5, adversaryUsd: 0.5, ideationUsd: 0.1099999999999999, totalUsd: 1.1099999999999999 },
      }),
    ];
    const { container } = render(<IterationTimeline runs={runs} />);
    expect(container.textContent).toMatch(/\$1\.11/);
    expect(container.textContent).not.toMatch(/1\.1099999999999999/);
  });

  it('直近20件を超える反復は切り詰める', () => {
    const runs = Array.from({ length: 25 }, (_, i) => makeRun({ iteration: i + 1, verdict: 'merged' }));
    render(<IterationTimeline runs={runs} />);
    const items = screen.getAllByText(/^#\d+$/);
    expect(items).toHaveLength(20);
    expect(items[0].textContent).toBe('#25');
    expect(items[19].textContent).toBe('#6');
  });
});
