import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApprovedButBuilderFailedPanel } from './ApprovedButBuilderFailedPanel';
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

describe('ApprovedButBuilderFailedPanel', () => {
  it('run が0件、または該当反復が1件も無ければ「データなし」を表示し、パネル本体を描画しない', () => {
    const first = render(<ApprovedButBuilderFailedPanel runs={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    first.unmount();

    // approve済みだが merged（成功）なので対象外、却下されたので対象外
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', adversary: { approved: true, summary: '' } }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: '' },
      }),
    ];
    const { container } = render(<ApprovedButBuilderFailedPanel runs={runs} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="approved-builder-failed-panel"]')).toBeNull();
  });

  it('サマリー指標（件数・検知率・浪費コスト・最多の原因カテゴリ）を正確な値で表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', adversary: { approved: true, summary: '' } }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        issue: { number: 20, title: 'issue A', labels: [] },
        gateReasons: ['builder が変更を生成しなかった'],
        adversary: { approved: true, summary: '' },
        cost: { builderUsd: 0.1, adversaryUsd: 0.02, ideationUsd: 0, totalUsd: 0.12 },
      }),
      makeRun({
        iteration: 3,
        verdict: 'needs-human',
        issue: { number: 21, title: 'issue B', labels: [] },
        gateReasons: ['builder が変更を生成しなかった'],
        adversary: { approved: true, summary: '' },
        cost: { builderUsd: 0.2, adversaryUsd: 0.03, ideationUsd: 0, totalUsd: 0.23 },
      }),
    ];
    const { container } = render(<ApprovedButBuilderFailedPanel runs={runs} />);

    // approve済み3件中2件が該当 → 検知率 2/3*100
    expect(container.querySelector('[data-testid="approved-builder-failed-count"]')?.textContent).toBe('2件');
    expect(container.querySelector('[data-testid="approved-builder-failed-rate"]')?.textContent).toBe('66.7%');
    expect(container.querySelector('[data-testid="approved-builder-failed-cost"]')?.textContent).toBe('$0.35');
    expect(container.querySelector('[data-testid="approved-builder-failed-top-category"]')?.textContent).toBe(
      '変更なし (2件)',
    );
  });

  it('該当反復ごとの行を新しい反復から順に表示し、issue番号・タイトル・原因カテゴリ・gateReasonsを含む', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        issue: { number: 10, title: '古い失敗', labels: [] },
        gateReasons: ['builder が変更を生成しなかった'],
        adversary: { approved: true, summary: '' },
      }),
      makeRun({
        iteration: 4,
        verdict: 'needs-human',
        issue: { number: 13, title: '新しい失敗', labels: [] },
        gateReasons: ['e2e(Playwright) が失敗している'],
        adversary: { approved: true, summary: '' },
      }),
    ];
    const { container } = render(<ApprovedButBuilderFailedPanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="approved-builder-failed-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'approved-builder-failed-row-4',
      'approved-builder-failed-row-1',
    ]);

    const newestRow = container.querySelector('[data-testid="approved-builder-failed-row-4"]');
    expect(newestRow?.textContent).toContain('issue #13');
    expect(newestRow?.textContent).toContain('新しい失敗');
    expect(newestRow?.textContent).toContain('e2e失敗');
    expect(newestRow?.textContent).toContain('e2e(Playwright) が失敗している');

    const oldestRow = container.querySelector('[data-testid="approved-builder-failed-row-1"]');
    expect(oldestRow?.textContent).toContain('issue #10');
    expect(oldestRow?.textContent).toContain('変更なし');
    expect(oldestRow?.textContent).toContain('builder が変更を生成しなかった');
  });

  it('paused/dry-run のようにゲート通過済みで gateReasons が空の反復は一覧・件数に含めない', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'paused',
        gateReasons: [],
        adversary: { approved: true, summary: '' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['builder が変更を生成しなかった'],
        adversary: { approved: true, summary: '' },
      }),
    ];
    const { container } = render(<ApprovedButBuilderFailedPanel runs={runs} />);
    expect(container.querySelector('[data-testid="approved-builder-failed-count"]')?.textContent).toBe('1件');
    expect(container.querySelector('[data-testid="approved-builder-failed-row-1"]')).toBeNull();
  });
});
