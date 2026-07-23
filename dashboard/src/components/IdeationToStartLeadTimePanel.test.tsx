import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IdeationToStartLeadTimePanel } from './IdeationToStartLeadTimePanel';
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

describe('IdeationToStartLeadTimePanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体は描画しない', () => {
    const { container } = render(<IdeationToStartLeadTimePanel runs={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-to-start-lead-time-panel"]')).toBeNull();
  });

  it('nextIssuesを一度も出していない場合も「データなし」（提案自体が無い）', () => {
    const runs = [makeRun({ iteration: 1, nextIssues: [] })];
    const { container } = render(<IdeationToStartLeadTimePanel runs={runs} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-to-start-lead-time-panel"]')).toBeNull();
  });

  it('提案のうち一部だけ着手済みの場合、着手成功率・件数・未着手issue一覧を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10, 20, 30] }),
      makeRun({ iteration: 2, issue: { number: 10, title: 'a', labels: [] } }),
    ];
    const { container } = render(<IdeationToStartLeadTimePanel runs={runs} />);
    const panel = container.querySelector('[data-testid="ideation-to-start-lead-time-panel"]');
    expect(panel).not.toBeNull();

    expect(container.querySelector('[data-testid="ideation-to-start-success-rate"]')?.textContent).toBe('33.3%');
    expect(container.querySelector('[data-testid="ideation-to-start-success-counts"]')?.textContent).toContain(
      '提案 3件中 1件が着手済み',
    );
    const bar = container.querySelector('[data-testid="ideation-to-start-success-bar"]') as HTMLElement;
    expect(bar.style.width).toBe('33.33%');

    const notStarted = container.querySelector('[data-testid="ideation-to-start-not-started-issues"]');
    expect(notStarted?.textContent).toContain('#20');
    expect(notStarted?.textContent).toContain('#30');
    expect(notStarted?.textContent).not.toContain('#10');
  });

  it('全ての提案issueが着手済みなら着手率100%で未着手一覧は表示しない', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] }),
      makeRun({ iteration: 2, issue: { number: 10, title: 'a', labels: [] } }),
    ];
    const { container } = render(<IdeationToStartLeadTimePanel runs={runs} />);
    expect(container.querySelector('[data-testid="ideation-to-start-success-rate"]')?.textContent).toBe('100.0%');
    expect(container.querySelector('[data-testid="ideation-to-start-not-started-issues"]')).toBeNull();
  });

  it('未着手issueが11件を超える場合は先頭10件だけ列挙し、残りは「他N件」とまとめる（表示上限の境界値）', () => {
    const proposer = makeRun({
      iteration: 1,
      issue: { number: 1, title: 'gen', labels: [] },
      nextIssues: Array.from({ length: 11 }, (_, i) => 100 + i),
    });
    const runs = [proposer];
    const { container } = render(<IdeationToStartLeadTimePanel runs={runs} />);
    const notStarted = container.querySelector('[data-testid="ideation-to-start-not-started-issues"]');
    expect(notStarted?.textContent).toContain('#100');
    expect(notStarted?.textContent).toContain('#109');
    expect(notStarted?.textContent).not.toContain('#110');
    expect(notStarted?.textContent).toContain('他1件');
  });

  it('提案はあるが1件も着手されていない場合、リードタイムはまだ計測できない旨を表示しsvgは描画しない', () => {
    const runs = [makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] })];
    const { container } = render(<IdeationToStartLeadTimePanel runs={runs} />);
    expect(container.querySelector('[data-testid="ideation-to-start-success-rate"]')?.textContent).toBe('0.0%');
    expect(screen.getByText(/リードタイムはまだ計測できません/)).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('着手が1件だけなら折れ線とcircleは描画するが、比較対象が無いため傾向は判定不可の注記を出す', () => {
    const runs = [
      makeRun({
        iteration: 1,
        issue: { number: 1, title: 't', labels: [] },
        finishedAt: '2026-07-20T00:00:00Z',
        nextIssues: [2],
      }),
      makeRun({
        iteration: 2,
        issue: { number: 2, title: 't2', labels: [] },
        startedAt: '2026-07-20T00:15:00Z',
      }),
    ];
    const { container } = render(<IdeationToStartLeadTimePanel runs={runs} />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('circle')).not.toBeNull();
    expect(container.querySelector('[data-testid="ideation-to-start-lead-time-signal"]')).toBeNull();
    expect(screen.getByText(/まだ判定できません/)).toBeInTheDocument();
    // 提案(00:00) → 着手(00:15) = 15分
    expect(screen.getByText(/15\.0分/)).toBeInTheDocument();
    const latest = container.querySelector('[data-testid="ideation-to-start-lead-time-latest"]');
    expect(latest?.textContent).toContain('issue #2');
    expect(latest?.textContent).toContain('提案 iteration 1');
    expect(latest?.textContent).toContain('着手 iteration 2');
  });

  it('リードタイムが直近ほど明確に長くなっていると「悪化傾向」を rose で表示する', () => {
    const runs: RunRecord[] = [];
    for (let i = 0; i < 6; i++) {
      const proposeIter = i * 2 + 1;
      const startIter = i * 2 + 2;
      const leadTimeSec = i < 3 ? 60 : 600;
      runs.push(
        makeRun({
          iteration: proposeIter,
          issue: { number: 100 + proposeIter, title: 'g', labels: [] },
          finishedAt: '2026-07-20T00:00:00Z',
          nextIssues: [200 + proposeIter],
        }),
      );
      runs.push(
        makeRun({
          iteration: startIter,
          issue: { number: 200 + proposeIter, title: 'c', labels: [] },
          startedAt: new Date(new Date('2026-07-20T00:00:00Z').getTime() + leadTimeSec * 1000).toISOString(),
        }),
      );
    }
    const { container } = render(<IdeationToStartLeadTimePanel runs={runs} />);
    const signalBlock = container.querySelector('[data-testid="ideation-to-start-lead-time-signal"]');
    expect(signalBlock).not.toBeNull();
    expect(signalBlock?.getAttribute('data-direction')).toBe('increasing');

    const direction = container.querySelector('[data-testid="ideation-to-start-lead-time-direction"]');
    expect(direction?.textContent).toContain('悪化傾向');
    expect(direction?.className).toContain('text-rose-400');

    const recentAvg = container.querySelector('[data-testid="ideation-to-start-lead-time-recent-avg"]');
    expect(recentAvg?.textContent).toBe('10.0分');
    const previousAvg = container.querySelector('[data-testid="ideation-to-start-lead-time-previous-avg"]');
    expect(previousAvg?.textContent).toBe('1.0分');
  });

  it('window に満たないデータ数では partial 注記を表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        issue: { number: 1, title: 't', labels: [] },
        finishedAt: '2026-07-20T00:00:00Z',
        nextIssues: [11, 12],
      }),
      makeRun({ iteration: 2, issue: { number: 11, title: 'a', labels: [] }, startedAt: '2026-07-20T00:01:00Z' }),
      makeRun({ iteration: 3, issue: { number: 12, title: 'b', labels: [] }, startedAt: '2026-07-20T00:02:00Z' }),
    ];
    const { container } = render(<IdeationToStartLeadTimePanel runs={runs} />);
    const signalBlock = container.querySelector('[data-testid="ideation-to-start-lead-time-signal"]');
    expect(signalBlock?.textContent).toContain('データ不足のため window 未満の件数で計算');
  });

  it('svg に NaN が紛れ込まない（座標計算の回帰防止）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        issue: { number: 1, title: 't', labels: [] },
        finishedAt: '2026-07-20T00:00:00Z',
        nextIssues: [2],
      }),
      makeRun({ iteration: 2, issue: { number: 2, title: 't2', labels: [] }, startedAt: '2026-07-20T00:05:00Z' }),
    ];
    const { container } = render(<IdeationToStartLeadTimePanel runs={runs} />);
    expect(container.querySelector('svg')?.innerHTML).not.toMatch(/NaN/);
  });
});
