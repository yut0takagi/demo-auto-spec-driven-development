import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AdversaryModelVerdictMissMatrixPanel } from './AdversaryModelVerdictMissMatrixPanel';
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

describe('AdversaryModelVerdictMissMatrixPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<AdversaryModelVerdictMissMatrixPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="adversary-model-verdict-miss-matrix-panel"]')).toBeNull();
  });

  it('failed のみの場合はレビュー未到達のため対象0件となり「データなし」になる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'failed',
        adversary: { approved: false, summary: 'レビューに到達しなかった' },
      }),
    ];
    const { container } = render(<AdversaryModelVerdictMissMatrixPanel runs={runs} />);
    expect(container.textContent).toContain('データなし');
  });

  it('mergedのみの場合は行は出るが非マージ反復が無い旨を表示し、セルを描画しない', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
    ];
    const { container } = render(<AdversaryModelVerdictMissMatrixPanel runs={runs} />);
    const row = container.querySelector('[data-testid="adversary-model-verdict-miss-row-model-a"]');
    expect(row?.textContent).toContain('非マージ反復なし');
    expect(container.querySelector('[data-testid^="adversary-model-verdict-miss-cell-model-a-"]')).toBeNull();
  });

  it('verdict別セルに見落とし件数・率・発生反復を表示し、見落とし0件のセルは緑バーになる', () => {
    const runs = [
      // abandoned: 承認2件のうち1件が見落とし
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
      // needs-human: 見落とし0件
      makeRun({
        iteration: 3,
        verdict: 'needs-human',
        adversary: { approved: false, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
    ];
    const { container } = render(<AdversaryModelVerdictMissMatrixPanel runs={runs} />);

    const overall = container.querySelector('[data-testid="adversary-model-verdict-miss-overall-model-a"]');
    expect(overall?.textContent).toContain('非マージ3件中 見落とし1件（33.3%）');

    const abandonedRate = container.querySelector('[data-testid="adversary-model-verdict-miss-rate-model-a-abandoned"]');
    expect(abandonedRate?.textContent).toBe('見落とし50% (1/2)');
    expect(container.textContent).toContain('見落とし発生反復: #1');

    const needsHumanRate = container.querySelector(
      '[data-testid="adversary-model-verdict-miss-rate-model-a-needs-human"]',
    );
    expect(needsHumanRate?.textContent).toBe('見落とし0% (0/1)');
    const needsHumanBar = container.querySelector(
      '[data-testid="adversary-model-verdict-miss-bar-model-a-needs-human"]',
    ) as HTMLElement;
    expect(needsHumanBar.className).toContain('bg-emerald-400');

    const abandonedBar = container.querySelector(
      '[data-testid="adversary-model-verdict-miss-bar-model-a-abandoned"]',
    ) as HTMLElement;
    expect(abandonedBar.className).toContain('bg-rose-400');
  });

  it('cellsは固定順(dry-run→paused→needs-human→abandoned)で描画され、出現していないverdictは省く', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'dry-run',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
    ];
    const { container } = render(<AdversaryModelVerdictMissMatrixPanel runs={runs} />);
    const cells = Array.from(
      container.querySelectorAll('[data-testid^="adversary-model-verdict-miss-cell-model-a-"]'),
    );
    const renderedVerdicts = cells.map((c) => c.getAttribute('data-testid')!.replace('adversary-model-verdict-miss-cell-model-a-', ''));
    expect(renderedVerdicts).toEqual(['dry-run', 'abandoned']);
    expect(
      container.querySelector('[data-testid="adversary-model-verdict-miss-cell-model-a-needs-human"]'),
    ).toBeNull();
  });

  it('overallMissRatePctが高いモデルから順に並ぶ（同率ならモデル名昇順）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
        models: { builder: 'b', adversary: 'model-zeta', ideation: 'i' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-alpha', ideation: 'i' },
      }),
    ];
    const { container } = render(<AdversaryModelVerdictMissMatrixPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="adversary-model-verdict-miss-row-"]'));
    expect(rows[0].getAttribute('data-testid')).toBe('adversary-model-verdict-miss-row-model-alpha');
    expect(rows[1].getAttribute('data-testid')).toBe('adversary-model-verdict-miss-row-model-zeta');
  });
});
