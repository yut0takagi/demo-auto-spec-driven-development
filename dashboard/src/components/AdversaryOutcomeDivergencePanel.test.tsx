import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AdversaryOutcomeDivergencePanel } from './AdversaryOutcomeDivergencePanel';
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

describe('AdversaryOutcomeDivergencePanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<AdversaryOutcomeDivergencePanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="adversary-outcome-divergence-panel"]')).toBeNull();
  });

  it('failed のみの場合はレビュー未到達のため対象0件となり「データなし」になる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'failed',
        adversary: { approved: false, summary: 'レビューに到達しなかった' },
      }),
    ];
    const { container } = render(<AdversaryOutcomeDivergencePanel runs={runs} />);
    expect(container.textContent).toContain('データなし');
  });

  it('承認したのに merged にならなかった反復を「見落とし」として計上し、乖離率を算出する', () => {
    // model-a: 承認2件（うち1件は abandoned=見落とし）、却下0件
    // → 乖離率 = 1/2 = 50.0%、見落とし率 = 1/2(承認中) = 50.0%
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
    ];
    const { container } = render(<AdversaryOutcomeDivergencePanel runs={runs} />);

    const rate = container.querySelector('[data-testid="adversary-outcome-divergence-rate-model-a"]');
    expect(rate?.textContent).toBe('50.0%');

    const falseApprove = container.querySelector('[data-testid="adversary-outcome-divergence-false-approve-model-a"]');
    expect(falseApprove?.textContent).toContain('見落とし（承認したのに非マージ）: 1件 / 承認2件中（50.0%）');

    expect(container.textContent).toContain('見落とし発生反復: #2');
  });

  it('承認判断と実結果が完全一致していれば乖離率0%になり、見落とし発生反復の行は表示されない', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-b', ideation: 'i' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
        models: { builder: 'b', adversary: 'model-b', ideation: 'i' },
      }),
    ];
    const { container } = render(<AdversaryOutcomeDivergencePanel runs={runs} />);

    const rate = container.querySelector('[data-testid="adversary-outcome-divergence-rate-model-b"]');
    expect(rate?.textContent).toBe('0.0%');
    expect(container.textContent).not.toContain('見落とし発生反復');

    const bar = container.querySelector('[data-testid="adversary-outcome-divergence-bar-model-b"]') as HTMLElement;
    expect(bar.className).toContain('bg-emerald-400');
  });

  it('却下したのに merged になった異常データは「誤却下」として分離集計し、見落とし件数には含めない', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: false, summary: '' },
        models: { builder: 'b', adversary: 'model-c', ideation: 'i' },
      }),
    ];
    const { container } = render(<AdversaryOutcomeDivergencePanel runs={runs} />);

    const falseApprove = container.querySelector('[data-testid="adversary-outcome-divergence-false-approve-model-c"]');
    // 承認0件中なので見落とし率は0%（分母がないため）
    expect(falseApprove?.textContent).toContain('見落とし（承認したのに非マージ）: 0件 / 承認0件中（0.0%）');

    const falseReject = container.querySelector('[data-testid="adversary-outcome-divergence-false-reject-model-c"]');
    expect(falseReject?.textContent).toContain('誤却下（却下したのにマージ）: 1件 / 却下1件中（100.0%）');

    const rate = container.querySelector('[data-testid="adversary-outcome-divergence-rate-model-c"]');
    expect(rate?.textContent).toBe('100.0%');
  });

  it('乖離率が高いモデルから順に並ぶ（同率ならモデル名昇順）', () => {
    const runs = [
      // model-zeta: 完全一致（乖離率0%）
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-zeta', ideation: 'i' },
      }),
      // model-alpha: 承認したのに abandoned（乖離率100%）
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-alpha', ideation: 'i' },
      }),
    ];
    const { container } = render(<AdversaryOutcomeDivergencePanel runs={runs} />);
    const rows = Array.from(container.querySelectorAll('[data-testid^="adversary-outcome-divergence-row-"]'));
    expect(rows[0].getAttribute('data-testid')).toBe('adversary-outcome-divergence-row-model-alpha');
    expect(rows[1].getAttribute('data-testid')).toBe('adversary-outcome-divergence-row-model-zeta');
  });

  it('paused/dry-run のように gateReasons が空でも merged でなければ見落としとして計上する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'paused',
        gateReasons: [],
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-d', ideation: 'i' },
      }),
    ];
    const { container } = render(<AdversaryOutcomeDivergencePanel runs={runs} />);
    const falseApprove = container.querySelector('[data-testid="adversary-outcome-divergence-false-approve-model-d"]');
    expect(falseApprove?.textContent).toContain('見落とし（承認したのに非マージ）: 1件 / 承認1件中（100.0%）');
  });
});
