import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BacklogPanel } from './BacklogPanel';
import type { RunRecord, Verdict } from '@/lib/types';

function makeRun(overrides: Partial<RunRecord> & { iteration: number }): RunRecord {
  return {
    id: `run-${overrides.iteration}`,
    issue: { number: overrides.iteration, title: `issue ${overrides.iteration}`, labels: [] },
    branch: `feature/${overrides.iteration}`,
    startedAt: '2026-07-20T00:00:00Z',
    finishedAt: '2026-07-20T00:10:00Z',
    durationSec: 600,
    reviseCycles: 0,
    verdict: 'merged' as Verdict,
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

describe('BacklogPanel', () => {
  it('nextIssues を持つ反復がなければフォールバック文言を表示する', () => {
    const runs = [makeRun({ iteration: 1, nextIssues: [] })];
    render(<BacklogPanel runs={runs} repoUrl="https://github.com/acme/loop" />);
    expect(screen.getByText('まだ改善 issue が生成されていません')).toBeInTheDocument();
  });

  it('nextIssues をリポジトリへのリンクとして表示する', () => {
    const runs = [makeRun({ iteration: 1, nextIssues: [42, 43] })];
    render(<BacklogPanel runs={runs} repoUrl="https://github.com/acme/loop" />);
    const link = screen.getByText('#42').closest('a');
    expect(link).toHaveAttribute('href', 'https://github.com/acme/loop/issues/42');
    expect(screen.getByText('#43').closest('a')).toHaveAttribute(
      'href',
      'https://github.com/acme/loop/issues/43'
    );
  });

  it('iteration 降順で並べ、10件を超える分は切り詰める', () => {
    const runs = Array.from({ length: 12 }, (_, i) =>
      makeRun({ iteration: i + 1, nextIssues: [100 + i] })
    );
    render(<BacklogPanel runs={runs} repoUrl="https://github.com/acme/loop" />);
    const entries = screen.getAllByText(/^#\d+ から$/);
    expect(entries).toHaveLength(10);
    expect(entries[0].textContent).toBe('#12 から');
    expect(entries[9].textContent).toBe('#3 から');
  });
});
