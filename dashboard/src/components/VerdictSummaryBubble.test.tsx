import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VerdictSummaryBubble } from './VerdictSummaryBubble';
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

describe('VerdictSummaryBubble', () => {
  it('反復がなければ「まだ反復がありません」と表示する', () => {
    render(<VerdictSummaryBubble runs={[]} />);
    expect(screen.getByText('まだ反復がありません')).toBeInTheDocument();
    expect(screen.getByTestId('verdict-summary-bubble')).toBeInTheDocument();
  });

  it('iteration が最大の run を選び、その adversary.summary を吹き出しに表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', adversary: { approved: true, summary: '古い反復のサマリー' } }),
      makeRun({ iteration: 3, verdict: 'abandoned', adversary: { approved: false, summary: '最新反復の却下理由' } }),
      makeRun({ iteration: 2, verdict: 'merged', adversary: { approved: true, summary: '中間の反復のサマリー' } }),
    ];
    render(<VerdictSummaryBubble runs={runs} />);
    expect(screen.getByText('最新反復の却下理由')).toBeInTheDocument();
    expect(screen.queryByText('古い反復のサマリー')).not.toBeInTheDocument();
    expect(screen.queryByText('中間の反復のサマリー')).not.toBeInTheDocument();
  });

  // verdict ごとに data-verdict とラベルが分岐すること。Record<Verdict, ...> の
  // 全メンバーを描画できることを保証する（IterationTimeline と同じ落とし穴の回避）。
  it.each<[Verdict, string]>([
    ['merged', 'マージ成功'],
    ['abandoned', '見送り（自動）'],
    ['needs-human', '人間対応が必要'],
    ['paused', '一時停止'],
    ['dry-run', 'ドライラン'],
    ['failed', '異常終了'],
  ])('verdict "%s" のとき見出し "%s" と data-verdict 属性を出し分ける', (verdict, label) => {
    const runs = [makeRun({ iteration: 1, verdict })];
    render(<VerdictSummaryBubble runs={runs} />);
    expect(screen.getByTestId('verdict-summary-bubble')).toHaveAttribute('data-verdict', verdict);
    expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
  });

  it('merged と failed で見出し・色付けクラスが異なる（verdict 別分岐の核心）', () => {
    const merged = makeRun({ iteration: 1, verdict: 'merged' });
    const failed = makeRun({ iteration: 1, verdict: 'failed' });

    const mergedRender = render(<VerdictSummaryBubble runs={[merged]} />);
    const mergedBadge = screen.getByText(/マージ成功/);
    expect(mergedBadge.className).toContain('emerald');
    mergedRender.unmount();

    render(<VerdictSummaryBubble runs={[failed]} />);
    const failedBadge = screen.getByText(/異常終了/);
    expect(failedBadge.className).toContain('rose');
    expect(failedBadge.className).not.toContain('emerald');
  });

  it('adversary.summary が空文字のときは gateReasons にフォールバックする', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'failed',
        adversary: { approved: false, summary: '' },
        gateReasons: ['反復が例外で異常終了した: boom'],
      }),
    ];
    render(<VerdictSummaryBubble runs={runs} />);
    expect(screen.getByText('反復が例外で異常終了した: boom')).toBeInTheDocument();
  });

  it('adversary.summary も gateReasons も空のときはプレースホルダを表示する（空白の吹き出しを出さない）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'failed',
        adversary: { approved: false, summary: '   ' },
        gateReasons: [],
      }),
    ];
    render(<VerdictSummaryBubble runs={runs} />);
    expect(screen.getByText('（この反復にはサマリーが記録されていません）')).toBeInTheDocument();
  });

  it('gateReasons が複数あるときは全件を箇条書きで表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['理由A', '理由B', '理由C'],
      }),
    ];
    render(<VerdictSummaryBubble runs={runs} />);
    expect(screen.getByText('・理由A')).toBeInTheDocument();
    expect(screen.getByText('・理由B')).toBeInTheDocument();
    expect(screen.getByText('・理由C')).toBeInTheDocument();
  });

  it('gateReasons が空のときは箇条書きを描画しない', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] })];
    const { container } = render(<VerdictSummaryBubble runs={runs} />);
    expect(container.querySelector('ul')).not.toBeInTheDocument();
  });

  it('issue 番号と iteration 番号を表示する', () => {
    const runs = [makeRun({ iteration: 7, verdict: 'merged', issue: { number: 42, title: 't', labels: [] } })];
    render(<VerdictSummaryBubble runs={runs} />);
    expect(screen.getByText('#7 · issue #42')).toBeInTheDocument();
  });
});
