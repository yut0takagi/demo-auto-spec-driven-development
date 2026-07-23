import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelCostBreakdown } from './ModelCostBreakdown';
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

describe('ModelCostBreakdown', () => {
  it('データが空なら「データなし」を表示し、内訳バーを描画しない', () => {
    const { container } = render(<ModelCostBreakdown runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="model-cost-breakdown"]')).toBeNull();
  });

  it('合計コストが0でも「データなし」を表示する（全run合計0の境界値）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0 },
      }),
    ];
    const { container } = render(<ModelCostBreakdown runs={runs} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="model-cost-breakdown"]')).toBeNull();
  });

  it('ロール別内訳を builder/adversary/ideation の順でラベル表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0.6, adversaryUsd: 0.3, ideationUsd: 0.1, totalUsd: 1.0 },
        models: { builder: 'model-a', adversary: 'model-b', ideation: 'model-c' },
      }),
    ];
    render(<ModelCostBreakdown runs={runs} />);
    expect(screen.getByText(/Builder: \$0\.60 \(60\.0%\)/)).toBeInTheDocument();
    expect(screen.getByText(/Adversary: \$0\.30 \(30\.0%\)/)).toBeInTheDocument();
    expect(screen.getByText(/Ideation: \$0\.10 \(10\.0%\)/)).toBeInTheDocument();
  });

  it('役割別コスト内訳の帯の各セグメント幅がその役割のパーセンテージと一致する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0.6, adversaryUsd: 0.3, ideationUsd: 0.1, totalUsd: 1.0 },
        models: { builder: 'model-a', adversary: 'model-b', ideation: 'model-c' },
      }),
    ];
    const { container } = render(<ModelCostBreakdown runs={runs} />);
    const builderSeg = container.querySelector('[data-testid="role-cost-segment-builder"]') as HTMLElement;
    const adversarySeg = container.querySelector('[data-testid="role-cost-segment-adversary"]') as HTMLElement;
    // jsdom の CSSOM は width の数値を parseFloat して再直列化するため、
    // '60.00%' のような末尾ゼロ付き文字列は必ず '60%' に正規化される。
    // そのため文字列完全一致ではなく数値として比較する。
    expect(parseFloat(builderSeg.style.width)).toBeCloseTo(60, 2);
    expect(parseFloat(adversarySeg.style.width)).toBeCloseTo(30, 2);
  });

  it('コストが0の役割はセグメントを描画しない（幅0の帯を残さない）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 },
        models: { builder: 'model-a', adversary: 'model-b', ideation: 'model-c' },
      }),
    ];
    const { container } = render(<ModelCostBreakdown runs={runs} />);
    expect(container.querySelector('[data-testid="role-cost-segment-builder"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="role-cost-segment-adversary"]')).toBeNull();
    expect(container.querySelector('[data-testid="role-cost-segment-ideation"]')).toBeNull();
  });

  it('同じモデルが複数ロールで使われている場合は1行に合算して表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0.5, adversaryUsd: 0.2, ideationUsd: 0.1, totalUsd: 0.8 },
        models: { builder: 'model-a', adversary: 'model-b', ideation: 'model-b' },
      }),
    ];
    const { container } = render(<ModelCostBreakdown runs={runs} />);
    const rows = container.querySelectorAll('[data-testid^="model-cost-row-"]');
    // model-a と model-b の2行のみ（合算されているので3行にはならない）
    expect(rows).toHaveLength(2);
    const modelBRow = container.querySelector('[data-testid="model-cost-row-model-b"]');
    expect(modelBRow?.textContent).toContain('$0.30');
    expect(modelBRow?.textContent).toContain('37.5%');
  });

  it('モデル別内訳は totalUsd 降順で表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0.1, adversaryUsd: 0.05, ideationUsd: 0, totalUsd: 0.15 },
        models: { builder: 'small-model', adversary: 'big-model', ideation: 'big-model' },
      }),
      makeRun({
        iteration: 2,
        cost: { builderUsd: 0.05, adversaryUsd: 0.5, ideationUsd: 0, totalUsd: 0.55 },
        models: { builder: 'small-model', adversary: 'big-model', ideation: 'big-model' },
      }),
    ];
    const { container } = render(<ModelCostBreakdown runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="model-cost-row-"]'));
    // big-model: 0.05+0.5=0.55, small-model: 0.1+0.05=0.15 → big-model が先
    expect(rows[0].getAttribute('data-testid')).toBe('model-cost-row-big-model');
    expect(rows[1].getAttribute('data-testid')).toBe('model-cost-row-small-model');
  });

  it('failed run のコストも合算に含める（金は実際に消費されている）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', cost: { builderUsd: 0.1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.1 } }),
      makeRun({ iteration: 2, verdict: 'failed', cost: { builderUsd: 0.02, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.02 } }),
    ];
    render(<ModelCostBreakdown runs={runs} />);
    expect(screen.getByText('$0.12')).toBeInTheDocument();
  });
});
