import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GateReasonsPanel } from './GateReasonsPanel';
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

describe('GateReasonsPanel', () => {
  it('needs-human の反復が無ければ、その旨のメッセージを表示する', () => {
    render(<GateReasonsPanel runs={[makeRun({ iteration: 1, verdict: 'merged' })]} />);
    expect(screen.getByText('現在、ゲート不通過で保留中の反復はありません')).toBeInTheDocument();
  });

  it('反復が0件でも落ちずに未表示メッセージを出す', () => {
    render(<GateReasonsPanel runs={[]} />);
    expect(screen.getByText('現在、ゲート不通過で保留中の反復はありません')).toBeInTheDocument();
  });

  it('最新 iteration が needs-human なら、その iteration・issue タイトル・gateReasons を全て表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({
        iteration: 3,
        verdict: 'needs-human',
        issue: { number: 3, title: 'コスト推移グラフに移動平均線を重ねる', labels: [] },
        gateReasons: [
          'e2e(Playwright) が失敗している',
          'adversary が approve していない',
          '変更行数 512 が上限 400 を超えている',
        ],
      }),
    ];
    render(<GateReasonsPanel runs={runs} />);
    expect(screen.getByText(/iteration #3/)).toBeInTheDocument();
    expect(screen.getByText(/コスト推移グラフに移動平均線を重ねる/)).toBeInTheDocument();
    expect(screen.getByText('e2e(Playwright) が失敗している')).toBeInTheDocument();
    expect(screen.getByText('adversary が approve していない')).toBeInTheDocument();
    expect(screen.getByText('変更行数 512 が上限 400 を超えている')).toBeInTheDocument();
  });

  it('needs-human より後に merged 反復があれば、未解決ではないため保留中メッセージを表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'needs-human', gateReasons: ['カバレッジ不足'] }),
      makeRun({ iteration: 2, verdict: 'merged' }),
    ];
    render(<GateReasonsPanel runs={runs} />);
    expect(screen.getByText('現在、ゲート不通過で保留中の反復はありません')).toBeInTheDocument();
    expect(screen.queryByText(/iteration #1/)).not.toBeInTheDocument();
    expect(screen.queryByText('カバレッジ不足')).not.toBeInTheDocument();
  });

  it('needs-human より後に failed 反復があっても、未解決ではないため保留中メッセージを表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'needs-human', gateReasons: ['カバレッジ不足'] }),
      makeRun({ iteration: 2, verdict: 'failed' }),
    ];
    render(<GateReasonsPanel runs={runs} />);
    expect(screen.getByText('現在、ゲート不通過で保留中の反復はありません')).toBeInTheDocument();
  });

  it('needs-human が複数あれば、iteration が最大のものだけを表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'needs-human', gateReasons: ['古い理由'] }),
      makeRun({ iteration: 4, verdict: 'needs-human', gateReasons: ['新しい理由'] }),
    ];
    render(<GateReasonsPanel runs={runs} />);
    expect(screen.getByText(/iteration #4/)).toBeInTheDocument();
    expect(screen.getByText('新しい理由')).toBeInTheDocument();
    expect(screen.queryByText('古い理由')).not.toBeInTheDocument();
  });

  it('gateReasons が空配列(データ欠損)なら、欠損している旨を表示する', () => {
    render(<GateReasonsPanel runs={[makeRun({ iteration: 1, verdict: 'needs-human', gateReasons: [] })]} />);
    expect(screen.getByText('理由が記録されていません')).toBeInTheDocument();
  });

  it('gateReasons に重複した文言があっても、重複キー警告を出さず全件表示する（key生成の頑健性）', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'needs-human',
        gateReasons: ['adversary が approve していない', 'adversary が approve していない'],
      }),
    ];
    render(<GateReasonsPanel runs={runs} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('adversary が approve していない');
    expect(items[1]).toHaveTextContent('adversary が approve していない');
    const keyWarning = errorSpy.mock.calls.some((args) =>
      args.some((a) => typeof a === 'string' && a.includes('key')),
    );
    expect(keyWarning).toBe(false);
    errorSpy.mockRestore();
  });
});
