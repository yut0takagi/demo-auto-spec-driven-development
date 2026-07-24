import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IdeationProposalConsumptionPanel } from './IdeationProposalConsumptionPanel';
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
    cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: 0.11 },
    models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
    nextIssues: [],
    ...overrides,
  };
}

function cellsOf(row: Element | null): (string | null)[] {
  return Array.from(row?.querySelectorAll('td') ?? []).map((td) => td.textContent);
}

describe('IdeationProposalConsumptionPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<IdeationProposalConsumptionPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-proposal-consumption-panel"]')).toBeNull();
  });

  it('ideation が1件も提案していない（全て nextIssues 空）場合も「データなし」（境界値）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        nextIssues: [],
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.05, totalUsd: 0.16 },
      }),
    ];
    const { container } = render(<IdeationProposalConsumptionPanel runs={runs} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-proposal-consumption-panel"]')).toBeNull();
  });

  it('未着手の提案issueは「未着手」「-」を表示し、倍率は算出不可', () => {
    const runs = [
      makeRun({
        iteration: 1,
        issue: { number: 1, title: 'a', labels: [] },
        nextIssues: [2, 3],
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.1, totalUsd: 0.21 },
      }),
    ];
    const { container } = render(<IdeationProposalConsumptionPanel runs={runs} />);
    expect(container.querySelector('[data-testid="ideation-proposal-consumption-panel"]')).not.toBeNull();

    expect(
      container.querySelector('[data-testid="ideation-proposal-consumption-proposed-count"]')?.textContent,
    ).toBe('2');
    expect(container.querySelector('[data-testid="ideation-proposal-consumption-started-count"]')?.textContent).toBe(
      '0',
    );
    expect(
      container.querySelector('[data-testid="ideation-proposal-consumption-proposed-total"]')?.textContent,
    ).toBe('$0.100');
    expect(container.querySelector('[data-testid="ideation-proposal-consumption-actual-total"]')?.textContent).toBe(
      '$0.000',
    );
    expect(container.querySelector('[data-testid="ideation-proposal-consumption-ratio"]')?.textContent).toBe(
      '算出不可',
    );

    const row = container.querySelector('[data-testid="ideation-proposal-consumption-row-2"]');
    expect(cellsOf(row)).toEqual(['#2', '1', '$0.050', '未着手', '-', '-']);
  });

  it('着手済みの提案issueは着手反復の実消費コストと結果を対応付けて表示し、倍率を算出する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        issue: { number: 1, title: 'a', labels: [] },
        nextIssues: [2],
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.02, totalUsd: 0.13 },
      }),
      makeRun({
        iteration: 2,
        issue: { number: 2, title: 'child', labels: [] },
        verdict: 'merged',
        cost: { builderUsd: 0.3, adversaryUsd: 0.05, ideationUsd: 0, totalUsd: 0.35 },
      }),
    ];
    const { container } = render(<IdeationProposalConsumptionPanel runs={runs} />);

    expect(container.querySelector('[data-testid="ideation-proposal-consumption-started-count"]')?.textContent).toBe(
      '1',
    );
    expect(container.querySelector('[data-testid="ideation-proposal-consumption-actual-total"]')?.textContent).toBe(
      '$0.350',
    );
    // 実消費(0.35) / 提案時点コスト(0.02) = 17.5倍
    expect(container.querySelector('[data-testid="ideation-proposal-consumption-ratio"]')?.textContent).toBe(
      '17.5倍',
    );

    const row = container.querySelector('[data-testid="ideation-proposal-consumption-row-2"]');
    expect(cellsOf(row)).toEqual(['#2', '1', '$0.020', '2', '$0.350', 'マージ成功']);
  });

  it('提案元自身の issue番号が nextIssues に含まれていても自分自身を着手済みとして表示しない（自己参照の境界値）', () => {
    const runs = [
      makeRun({
        iteration: 5,
        issue: { number: 10, title: 'self', labels: [] },
        nextIssues: [10, 11],
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.1, totalUsd: 0.21 },
      }),
      makeRun({
        iteration: 6,
        issue: { number: 11, title: 'child', labels: [] },
        verdict: 'abandoned',
        cost: { builderUsd: 0.2, adversaryUsd: 0.02, ideationUsd: 0, totalUsd: 0.22 },
      }),
    ];
    const { container } = render(<IdeationProposalConsumptionPanel runs={runs} />);

    const selfRow = container.querySelector('[data-testid="ideation-proposal-consumption-row-10"]');
    expect(cellsOf(selfRow)).toEqual(['#10', '5', '$0.050', '未着手', '-', '-']);

    const childRow = container.querySelector('[data-testid="ideation-proposal-consumption-row-11"]');
    expect(cellsOf(childRow)).toEqual(['#11', '5', '$0.050', '6', '$0.220', '見送り（自動）']);
  });
});
