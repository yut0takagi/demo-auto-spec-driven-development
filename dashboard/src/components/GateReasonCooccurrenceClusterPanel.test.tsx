import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { GateReasonCooccurrenceClusterPanel } from './GateReasonCooccurrenceClusterPanel';
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

describe('GateReasonCooccurrenceClusterPanel', () => {
  function clusterRows(container: HTMLElement) {
    return [...container.querySelectorAll('[data-testid^="gate-reason-cooccurrence-cluster-"]')].filter((el) =>
      /^gate-reason-cooccurrence-cluster-\d+$/.test(el.getAttribute('data-testid') ?? ''),
    );
  }

  it('runが0件なら「データなし」を表示し、クラスタ行を描画しない', () => {
    const { container } = render(<GateReasonCooccurrenceClusterPanel runs={[]} />);
    expect(
      screen.getByText('データなし（閾値以上で共起するカテゴリの組はありません）'),
    ).toBeInTheDocument();
    expect(clusterRows(container)).toHaveLength(0);
  });

  it('gateReasonsが常に単一カテゴリのrunsのみでは共起が発生せず「データなし」を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
    ];
    const { container } = render(<GateReasonCooccurrenceClusterPanel runs={runs} />);
    expect(
      screen.getByText('データなし（閾値以上で共起するカテゴリの組はありません）'),
    ).toBeInTheDocument();
    expect(clusterRows(container)).toHaveLength(0);
  });

  it('閾値を満たす2カテゴリ共起データでクラスタ行と両カテゴリラベルを描画する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['e2e(Playwright) が失敗している', 'adversary が approve していない'],
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない', 'e2e(Playwright) が失敗している'],
      }),
    ];
    const { container } = render(<GateReasonCooccurrenceClusterPanel runs={runs} />);

    const panel = container.querySelector('[data-testid="gate-reason-cooccurrence-cluster-panel"]');
    expect(panel?.textContent).toContain('1クラスタ');

    const row = container.querySelector('[data-testid="gate-reason-cooccurrence-cluster-0"]');
    expect(row).not.toBeNull();
    expect(
      within(row as HTMLElement).getByTestId('gate-reason-cooccurrence-cluster-0-category-e2eFailed'),
    ).toHaveTextContent('e2e失敗');
    expect(
      within(row as HTMLElement).getByTestId('gate-reason-cooccurrence-cluster-0-category-adversaryNotApproved'),
    ).toHaveTextContent('adversary未承認');
    expect(row?.textContent).toContain('共起2件');
    expect(row?.textContent).toContain('2反復');
  });

  it('3カテゴリが相互に共起するデータは単一クラスタとしてまとまり、3つに分裂しない', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: [
          'verify(lint/typecheck/unit/build) が失敗している',
          'e2e(Playwright) が失敗している',
          'adversary が approve していない',
        ],
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: [
          'verify(lint/typecheck/unit/build) が失敗している',
          'e2e(Playwright) が失敗している',
          'adversary が approve していない',
        ],
      }),
    ];
    const { container } = render(<GateReasonCooccurrenceClusterPanel runs={runs} />);

    const panel = container.querySelector('[data-testid="gate-reason-cooccurrence-cluster-panel"]');
    expect(panel?.textContent).toContain('1クラスタ');
    // 3つの独立クラスタに分裂していれば行(gate-reason-cooccurrence-cluster-N)が複数出るはず
    expect(clusterRows(container)).toHaveLength(1);

    const row = container.querySelector('[data-testid="gate-reason-cooccurrence-cluster-0"]');
    expect(row).not.toBeNull();
    expect(
      within(row as HTMLElement).getByTestId('gate-reason-cooccurrence-cluster-0-category-verifyFailed'),
    ).toBeInTheDocument();
    expect(
      within(row as HTMLElement).getByTestId('gate-reason-cooccurrence-cluster-0-category-e2eFailed'),
    ).toBeInTheDocument();
    expect(
      within(row as HTMLElement).getByTestId('gate-reason-cooccurrence-cluster-0-category-adversaryNotApproved'),
    ).toBeInTheDocument();
    // 3ペア分の内訳がすべて1つのクラスタの中に収まっている
    expect(row?.textContent).toContain('共起6件');
  });
});
