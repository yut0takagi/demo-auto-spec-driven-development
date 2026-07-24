import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuilderVolumeApprovalCouplingPanel } from './BuilderVolumeApprovalCouplingPanel';
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

describe('BuilderVolumeApprovalCouplingPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<BuilderVolumeApprovalCouplingPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="builder-volume-approval-coupling-panel"]')).toBeNull();
  });

  it('verify に到達した run が1件だけなら「データなし」のまま（境界値）', () => {
    const runs = [makeRun({ iteration: 1, changedLines: 100 })];
    const { container } = render(<BuilderVolumeApprovalCouplingPanel runs={runs} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="builder-volume-approval-coupling-panel"]')).toBeNull();
  });

  it('生成量↑・承認率↓の逆連動を正確な値で表示する（部分一致に頼らない）', () => {
    const runs = [
      makeRun({ iteration: 1, changedLines: 100, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, changedLines: 200, adversary: { approved: false, summary: '' } }),
    ];
    const { container } = render(<BuilderVolumeApprovalCouplingPanel runs={runs} />);

    expect(container.querySelector('[data-testid="builder-volume-approval-coupling-coefficient"]')?.textContent).toBe(
      'r = -1.00',
    );
    expect(
      container.querySelector('[data-testid="builder-volume-approval-coupling-previous-volume"]')?.textContent,
    ).toBe('100.0行');
    expect(
      container.querySelector('[data-testid="builder-volume-approval-coupling-recent-volume"]')?.textContent,
    ).toBe('200.0行');
    expect(
      container.querySelector('[data-testid="builder-volume-approval-coupling-previous-approval"]')?.textContent,
    ).toBe('承認率 100.0%');
    expect(
      container.querySelector('[data-testid="builder-volume-approval-coupling-recent-approval"]')?.textContent,
    ).toBe('承認率 0.0%');

    const direction = container.querySelector('[data-testid="builder-volume-approval-coupling-direction"]');
    expect(direction).toHaveAttribute('data-direction', 'inverse');
    expect(direction?.textContent).toContain('逆連動');

    expect(screen.getByText(/生成量\(変更行数\)は直前ウィンドウ比 \+100\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/承認率は直前ウィンドウ比 -100\.0pt/)).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="builder-volume-approval-coupling-iterations"]')?.textContent,
    ).toBe('直近: 2 / 直前: 1（データ不足のため window 未満の反復数で計算）');
  });

  it('生成量↑・承認率↑がともに動くと direct 判定になる', () => {
    const runs = [
      makeRun({ iteration: 1, changedLines: 100, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 2, changedLines: 300, adversary: { approved: true, summary: '' } }),
    ];
    const { container } = render(<BuilderVolumeApprovalCouplingPanel runs={runs} />);
    const direction = container.querySelector('[data-testid="builder-volume-approval-coupling-direction"]');
    expect(direction).toHaveAttribute('data-direction', 'direct');
    expect(direction?.textContent).toContain('連動（生成量と承認率が同方向に変化）');
  });

  it('生成量の変化率が閾値未満だと flat 判定で表示される（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, changedLines: 100, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 2, changedLines: 104, adversary: { approved: true, summary: '' } }),
    ];
    const { container } = render(<BuilderVolumeApprovalCouplingPanel runs={runs} />);
    const direction = container.querySelector('[data-testid="builder-volume-approval-coupling-direction"]');
    expect(direction).toHaveAttribute('data-direction', 'flat');
    expect(direction?.textContent).toContain('横ばい');
  });

  it('直前ウィンドウの平均変更行数が0だと変化率算出不可の文言になる（0除算回避、境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, changedLines: 0, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, changedLines: 50, adversary: { approved: false, summary: '' } }),
    ];
    const { container } = render(<BuilderVolumeApprovalCouplingPanel runs={runs} />);
    expect(screen.getByText(/直前ウィンドウの変更行数平均が0のため変化率は算出不可/)).toBeInTheDocument();
    const direction = container.querySelector('[data-testid="builder-volume-approval-coupling-direction"]');
    expect(direction).toHaveAttribute('data-direction', 'flat');
  });

  it('changedLinesが全run同値（分散0）だと相関係数は「算出不可」になる（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, changedLines: 42, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, changedLines: 42, adversary: { approved: false, summary: '' } }),
    ];
    const { container } = render(<BuilderVolumeApprovalCouplingPanel runs={runs} />);
    expect(container.querySelector('[data-testid="builder-volume-approval-coupling-coefficient"]')?.textContent).toBe(
      '算出不可',
    );
  });
});
