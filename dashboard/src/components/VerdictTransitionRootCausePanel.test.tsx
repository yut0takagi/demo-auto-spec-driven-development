import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VerdictTransitionRootCausePanel } from './VerdictTransitionRootCausePanel';
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

describe('VerdictTransitionRootCausePanel', () => {
  it('run が0/1件、またはrecovered/sustainedSuccessのみの遷移集合では「データなし」', () => {
    const cases: RunRecord[][] = [
      [],
      [makeRun({ iteration: 1 })],
      [
        makeRun({ iteration: 1, verdict: 'failed', gateReasons: ['e2e(Playwright) が失敗している'] }),
        makeRun({ iteration: 2, verdict: 'merged', gateReasons: [] }), // recovered
        makeRun({ iteration: 3, verdict: 'merged', gateReasons: [] }), // sustainedSuccess
      ],
    ];
    for (const runs of cases) {
      const { container, unmount } = render(<VerdictTransitionRootCausePanel runs={runs} />);
      expect(screen.getByText(/データなし/)).toBeInTheDocument();
      expect(container.querySelector('[data-testid="verdict-transition-root-cause-panel"]')).toBeNull();
      unmount();
    }
  });

  it('悪化系kindのみが行として現れ、count/lift/シェア%の表示がaggregate側の計算結果と数値一致する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'] }),
      // merged→abandoned: regressed, to=run2 (verifyFailed×1) total=1
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している', 'e2e(Playwright) が失敗している'],
      }),
      // abandoned→abandoned: repeatedFailure, to=run3 (verifyFailed×1, e2eFailed×1) total=2
      makeRun({ iteration: 4, verdict: 'failed', gateReasons: ['e2e(Playwright) が失敗している'] }),
      // abandoned→failed: shiftedFailure, to=run4 (e2eFailed×1) total=1
    ];
    const { container } = render(<VerdictTransitionRootCausePanel runs={runs} />);

    expect(container.querySelector('[data-testid="verdict-transition-root-cause-panel"]')).not.toBeNull();
    // 悪化系(regressed/repeatedFailure/shiftedFailure)のみ3行。recovered/sustainedSuccessは無い
    expect(container.querySelectorAll('[data-testid^="verdict-transition-root-cause-row-"]')).toHaveLength(3);
    expect(container.querySelector('[data-testid="verdict-transition-root-cause-row-recovered"]')).toBeNull();
    expect(container.querySelector('[data-testid="verdict-transition-root-cause-row-sustainedSuccess"]')).toBeNull();

    // repeatedFailure行: total=2, verifyFailed/e2eFailedともにcount=1・自シェア50%・全体シェア50%・lift=1.0
    expect(
      container.querySelector('[data-testid="verdict-transition-root-cause-total-repeatedFailure"]')?.textContent,
    ).toContain('理由出現 2件');
    expect(
      container.querySelector('[data-testid="verdict-transition-root-cause-lift-repeatedFailure-verifyFailed"]')
        ?.textContent,
    ).toBe('lift 1.00x（1件, 自50% / 全50%）');

    // regressed行: total=1, verifyFailedがcount=1・自シェア100%・全体シェア50%・lift=2.0
    expect(
      container.querySelector('[data-testid="verdict-transition-root-cause-total-regressed"]')?.textContent,
    ).toContain('理由出現 1件');
    expect(
      container.querySelector('[data-testid="verdict-transition-root-cause-lift-regressed-verifyFailed"]')
        ?.textContent,
    ).toBe('lift 2.00x（1件, 自100% / 全50%）');
    expect(
      (container.querySelector(
        '[data-testid="verdict-transition-root-cause-bar-regressed-verifyFailed"]',
      ) as HTMLElement).className,
    ).toContain('bg-rose-400');

    // shiftedFailure行: total=1, e2eFailedがcount=1・自シェア100%・全体シェア50%・lift=2.0
    expect(
      container.querySelector('[data-testid="verdict-transition-root-cause-lift-shiftedFailure-e2eFailed"]')
        ?.textContent,
    ).toBe('lift 2.00x（1件, 自100% / 全50%）');
  });

  it('1kind内に複数カテゴリが共存するとき、lift降順（同値はcount降順→カテゴリ固定順）で行内に並ぶ', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: [
          'verify(lint/typecheck/unit/build) が失敗している',
          'verify(lint/typecheck/unit/build) が失敗している',
          'e2e(Playwright) が失敗している',
        ],
      }), // merged→abandoned: regressed, to=run2 (verifyFailed×2, e2eFailed×1)
    ];
    const { container } = render(<VerdictTransitionRootCausePanel runs={runs} />);
    const cells = container.querySelectorAll('[data-testid^="verdict-transition-root-cause-cell-regressed-"]');
    // verifyFailedの方が出現数が多い(count大)ので先に並ぶ
    expect(cells).toHaveLength(2);
    expect(cells[0].getAttribute('data-testid')).toBe('verdict-transition-root-cause-cell-regressed-verifyFailed');
    expect(cells[1].getAttribute('data-testid')).toBe('verdict-transition-root-cause-cell-regressed-e2eFailed');
  });
});
