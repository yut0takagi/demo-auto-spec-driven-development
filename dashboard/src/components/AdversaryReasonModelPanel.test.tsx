import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdversaryReasonModelPanel } from './AdversaryReasonModelPanel';
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
    verdict: 'abandoned',
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

describe('AdversaryReasonModelPanel', () => {
  it('gateReasonsを持つrunが1件も無ければ「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<AdversaryReasonModelPanel runs={[makeRun({ verdict: 'merged', gateReasons: [] })]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="adversary-reason-model-panel"]')).toBeNull();
  });

  it('カテゴリ×モデルごとに承認率(%)と件数を実際の内訳どおりに表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        gateReasons: ['e2e(Playwright) が失敗している'],
        adversary: { approved: true, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-sonnet-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        gateReasons: ['e2e(Playwright) が失敗している'],
        adversary: { approved: false, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 3,
        gateReasons: ['e2e(Playwright) が失敗している'],
        adversary: { approved: true, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const { container } = render(<AdversaryReasonModelPanel runs={runs} />);

    const panel = container.querySelector('[data-testid="adversary-reason-model-panel"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('1区分');

    const row = container.querySelector('[data-testid="adversary-reason-model-row-e2eFailed"]');
    expect(row?.textContent).toContain('3件');

    // claude-sonnet-5: 1/1 = 100%
    const sonnetRate = container.querySelector(
      '[data-testid="adversary-reason-model-rate-e2eFailed-claude-sonnet-5"]',
    );
    expect(sonnetRate?.textContent).toBe('承認100% (1/1)');
    const sonnetBar = container.querySelector(
      '[data-testid="adversary-reason-model-bar-e2eFailed-claude-sonnet-5"]',
    ) as HTMLElement;
    expect(parseFloat(sonnetBar.style.width)).toBeCloseTo(100, 2);

    // claude-haiku-4-5: 1/2 = 50%
    const haikuRate = container.querySelector(
      '[data-testid="adversary-reason-model-rate-e2eFailed-claude-haiku-4-5"]',
    );
    expect(haikuRate?.textContent).toBe('承認50% (1/2)');
    const haikuBar = container.querySelector(
      '[data-testid="adversary-reason-model-bar-e2eFailed-claude-haiku-4-5"]',
    ) as HTMLElement;
    expect(parseFloat(haikuBar.style.width)).toBeCloseTo(50, 2);
  });

  it('adversaryNotApproved はその定義上、承認率が常に0%として表示される', () => {
    const runs = [
      makeRun({
        iteration: 1,
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: '既存の挙動を壊している' },
      }),
    ];
    const { container } = render(<AdversaryReasonModelPanel runs={runs} />);
    const rate = container.querySelector(
      '[data-testid="adversary-reason-model-rate-adversaryNotApproved-claude-haiku-4-5"]',
    );
    expect(rate?.textContent).toBe('承認0% (0/1)');
  });

  it('セルはcount降順で描画され、対象iterationがカテゴリ内で昇順にまとまる', () => {
    const runs = [
      makeRun({
        iteration: 5,
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
        models: { builder: 'claude-sonnet-5', adversary: 'claude-sonnet-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 3,
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const { container } = render(<AdversaryReasonModelPanel runs={runs} />);
    const cells = Array.from(
      container.querySelectorAll('[data-testid^="adversary-reason-model-cell-verifyFailed-"]'),
    );
    expect(cells.map((c) => c.getAttribute('data-testid'))).toEqual([
      'adversary-reason-model-cell-verifyFailed-claude-haiku-4-5',
      'adversary-reason-model-cell-verifyFailed-claude-sonnet-5',
    ]);

    const row = container.querySelector('[data-testid="adversary-reason-model-row-verifyFailed"]');
    expect(row?.textContent).toContain('対象iteration: 2, 3, 5');
  });
});
