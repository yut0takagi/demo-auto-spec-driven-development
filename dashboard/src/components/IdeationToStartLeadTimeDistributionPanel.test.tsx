import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IdeationToStartLeadTimeDistributionPanel } from './IdeationToStartLeadTimeDistributionPanel';
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

function proposeAndStart(
  proposeIteration: number,
  startIteration: number,
  issueNumber: number,
  leadTimeSec: number,
): RunRecord[] {
  return [
    makeRun({
      iteration: proposeIteration,
      issue: { number: proposeIteration, title: 'gen', labels: [] },
      finishedAt: '2026-07-20T00:00:00Z',
      nextIssues: [issueNumber],
    }),
    makeRun({
      iteration: startIteration,
      issue: { number: issueNumber, title: 'x', labels: [] },
      startedAt: new Date(new Date('2026-07-20T00:00:00Z').getTime() + leadTimeSec * 1000).toISOString(),
    }),
  ];
}

describe('IdeationToStartLeadTimeDistributionPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体は描画しない', () => {
    const { container } = render(<IdeationToStartLeadTimeDistributionPanel runs={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-to-start-lead-time-distribution-panel"]')).toBeNull();
  });

  it('提案はあるが1件も着手されていない場合も「データなし」', () => {
    const runs = [makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] })];
    const { container } = render(<IdeationToStartLeadTimeDistributionPanel runs={runs} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-to-start-lead-time-distribution-panel"]')).toBeNull();
  });

  it('着手済みが1件だけなら最小・中央値・p90・最大が全て同じ値になり、ボトルネックは検出されない', () => {
    const runs = proposeAndStart(1, 2, 10, 300);
    const { container } = render(<IdeationToStartLeadTimeDistributionPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="ideation-to-start-lead-time-distribution-panel"]');
    expect(panel).not.toBeNull();

    expect(container.querySelector('[data-testid="ideation-to-start-distribution-sample-size"]')?.textContent).toContain(
      'サンプル 1件',
    );
    for (const testid of [
      'ideation-to-start-distribution-min',
      'ideation-to-start-distribution-median',
      'ideation-to-start-distribution-p90',
      'ideation-to-start-distribution-max',
    ]) {
      expect(container.querySelector(`[data-testid="${testid}"]`)?.textContent).toBe('5.0分');
    }

    expect(container.querySelector('[data-testid="ideation-to-start-bottleneck-count"]')?.textContent).toBe('0件');
    expect(screen.getByText(/検出されていません/)).toBeInTheDocument();
  });

  it('区間境界(600秒ちょうど)は「〜10分」ではなく「10〜30分」区間に計上される（境界値）', () => {
    const runs = proposeAndStart(1, 2, 10, 600);
    const { container } = render(<IdeationToStartLeadTimeDistributionPanel runs={runs} />);
    const under10 = container.querySelector('[data-testid="ideation-to-start-distribution-bucket-〜10分"]');
    const under30 = container.querySelector('[data-testid="ideation-to-start-distribution-bucket-10〜30分"]');
    expect(under10?.textContent).toContain('0件');
    expect(under30?.textContent).toContain('1件');
  });

  it('突出して遅い着手(started-late)を検知し、他の正常なissueは検知しない', () => {
    const runs = [
      ...proposeAndStart(1, 2, 101, 100),
      ...proposeAndStart(3, 4, 102, 100),
      ...proposeAndStart(5, 6, 103, 100),
      ...proposeAndStart(7, 8, 104, 1000),
    ];
    const { container } = render(<IdeationToStartLeadTimeDistributionPanel runs={runs} />);
    expect(container.querySelector('[data-testid="ideation-to-start-bottleneck-count"]')?.textContent).toBe('1件');

    const row = container.querySelector('[data-testid="ideation-to-start-bottleneck-row-started-late-104"]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('issue #104');
    expect(row?.textContent).toContain('提案 iteration 7');
    expect(row?.textContent).toContain('16.7分');
    expect(row?.textContent).toContain('着手済みだが突出して遅い');

    expect(container.querySelector('[data-testid="ideation-to-start-bottleneck-row-started-late-101"]')).toBeNull();
  });

  it('未着手のまま長期間放置(still-waiting)されている提案を検知する', () => {
    const runs = [
      ...proposeAndStart(1, 2, 101, 300),
      ...proposeAndStart(3, 4, 102, 300),
      // iteration5で提案、iteration8(最新)まで未着手 → 3反復放置
      makeRun({ iteration: 5, issue: { number: 5, title: 'gen2', labels: [] }, nextIssues: [201] }),
      makeRun({ iteration: 6, issue: { number: 6, title: 'gen3', labels: [] } }),
      makeRun({ iteration: 7, issue: { number: 7, title: 'gen4', labels: [] } }),
      makeRun({ iteration: 8, issue: { number: 8, title: 'gen5', labels: [] } }),
    ];
    const { container } = render(<IdeationToStartLeadTimeDistributionPanel runs={runs} />);
    const row = container.querySelector('[data-testid="ideation-to-start-bottleneck-row-still-waiting-201"]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('issue #201');
    expect(row?.textContent).toContain('提案 iteration 5');
    expect(row?.textContent).toContain('3反復 放置');
    expect(row?.textContent).toContain('未着手のまま滞留中');
  });

  it('複数のボトルネックは提案iteration昇順で描画される', () => {
    const runs = [
      ...proposeAndStart(1, 2, 101, 100),
      ...proposeAndStart(3, 4, 102, 100),
      ...proposeAndStart(5, 6, 103, 100),
      ...proposeAndStart(20, 21, 999, 5000),
      makeRun({ iteration: 7, issue: { number: 7, title: 'gen2', labels: [] }, nextIssues: [500] }),
      makeRun({ iteration: 22, issue: { number: 22, title: 'filler', labels: [] } }),
    ];
    const { container } = render(<IdeationToStartLeadTimeDistributionPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="ideation-to-start-bottleneck-row-"]'));
    const testids = rows.map((r) => r.getAttribute('data-testid'));
    expect(testids).toEqual([
      'ideation-to-start-bottleneck-row-still-waiting-500',
      'ideation-to-start-bottleneck-row-started-late-999',
    ]);
  });

  it('svg/DOMにNaNやundefinedが紛れ込まない（回帰防止）', () => {
    const runs = [
      ...proposeAndStart(1, 2, 101, 100),
      ...proposeAndStart(3, 4, 102, 200),
      ...proposeAndStart(5, 6, 103, 300),
      ...proposeAndStart(7, 8, 104, 400),
    ];
    const { container } = render(<IdeationToStartLeadTimeDistributionPanel runs={runs} />);
    expect(container.innerHTML).not.toMatch(/NaN/);
    expect(container.innerHTML).not.toMatch(/undefined/);
  });
});
