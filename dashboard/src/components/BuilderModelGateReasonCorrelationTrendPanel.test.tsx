import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BuilderModelGateReasonCorrelationTrendPanel } from './BuilderModelGateReasonCorrelationTrendPanel';
import { BUILDER_MODEL_GATE_REASON_TREND_WINDOW } from '@/lib/aggregate';
import type { RunRecord } from '@/lib/types';

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: '20260720T000000Z-1', iteration: 1, branch: 'loop/1-x', durationSec: 300, reviseCycles: 0,
    issue: { number: 1, title: 't', labels: [] }, verdict: 'merged', gateReasons: [], prNumber: 11,
    startedAt: '2026-07-20T00:00:00Z', finishedAt: '2026-07-20T00:05:00Z', changedLines: 10,
    adversary: { approved: true, summary: '' }, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 },
    cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.01, totalUsd: 0.12 },
    models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
    nextIssues: [],
    ...overrides,
  };
}

const VERIFY_REASON = 'verify(lint/typecheck/unit/build) が失敗している';
const E2E_REASON = 'e2e(Playwright) が失敗している';
const T = 'builder-model-gate-reason-correlation-trend';

function makeGateRuns(start: number, count: number, builder: string, reason: string): RunRecord[] {
  return Array.from({ length: count }, (_, i) =>
    makeRun({
      iteration: start + i,
      verdict: 'abandoned',
      gateReasons: [reason],
      models: { builder, adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
    }),
  );
}

describe('BuilderModelGateReasonCorrelationTrendPanel', () => {
  it('run が0件、またはgateReasons付き反復が窓幅未満なら「データなし」を表示しパネル本体を描画しない', () => {
    for (const runs of [[], makeGateRuns(1, BUILDER_MODEL_GATE_REASON_TREND_WINDOW - 1, 'claude-sonnet-5', VERIFY_REASON)]) {
      const { container } = render(<BuilderModelGateReasonCorrelationTrendPanel runs={runs} />);
      expect(container.textContent).toContain('データなし');
      expect(container.querySelector(`[data-testid="${T}-panel"]`)).toBeNull();
    }
  });

  it('単一モデルのみの窓では最大liftが常に1.00xで表示され、パネル・棒・行が1点分描画される', () => {
    const runs = makeGateRuns(1, BUILDER_MODEL_GATE_REASON_TREND_WINDOW, 'claude-sonnet-5', VERIFY_REASON);
    const { container } = render(<BuilderModelGateReasonCorrelationTrendPanel runs={runs} />);
    expect(container.querySelector(`[data-testid="${T}-panel"]`)).not.toBeNull();
    expect(container.querySelectorAll(`[data-testid^="${T}-row-"]`)).toHaveLength(1);
    expect(container.querySelectorAll(`[data-testid^="${T}-bar-"]`)).toHaveLength(1);

    const headline = container.querySelector(`[data-testid="${T}-value"]`)?.textContent ?? '';
    expect(headline).toContain('1.00x');
    expect(headline).toContain('claude-sonnet-5');
    expect(headline).toContain('verify失敗');

    const row = container.querySelector(`[data-testid="${T}-row-${BUILDER_MODEL_GATE_REASON_TREND_WINDOW}"]`);
    expect(row?.textContent).toContain('claude-sonnet-5');
    expect(row?.textContent).toContain('verify失敗');
    expect(row?.textContent).toContain('1.00x');
    expect(container.querySelector(`[data-testid="${T}-sparkline"]`)?.getAttribute('role')).toBe('img');
    // 過去点が無い(sampleSize不足)ためsignalはnullでdirectionバッジは出ない
    expect(container.querySelector(`[data-testid="${T}-direction"]`)).toBeNull();
  });

  it('複数モデルが窓をまたいで入れ替わると、方向ラベルとテーブル内容が各点ごとに正しく切り替わる', () => {
    const runs = [...makeGateRuns(1, 5, 'claude-sonnet-5', VERIFY_REASON), ...makeGateRuns(6, 1, 'claude-haiku-4-5', E2E_REASON)];
    const { container } = render(<BuilderModelGateReasonCorrelationTrendPanel runs={runs} />);

    // 反復5点(sonnetのみ, lift1.00x)と反復6点(sonnet4件, lift1.25x)の2点
    expect(container.querySelectorAll(`[data-testid^="${T}-row-"]`)).toHaveLength(2);
    expect(container.querySelector(`[data-testid="${T}-row-5"]`)?.textContent).toContain('1.00x');

    const row6 = container.querySelector(`[data-testid="${T}-row-6"]`);
    expect(row6?.textContent).toContain('claude-sonnet-5');
    expect(row6?.textContent).toContain('verify失敗');
    expect(row6?.textContent).toContain('1.25x');
    expect(row6?.textContent).toContain('4');

    // 直近(1.25x)が過去平均(1.00x)より+0.25強含み=閾値ちょうどなので「強まる」
    expect(container.querySelector(`[data-testid="${T}-direction"]`)?.textContent).toBe('強まる');

    const headline = container.querySelector(`[data-testid="${T}-value"]`)?.textContent ?? '';
    expect(headline).toContain('1.25x');
    expect(headline).toContain('反復6');
  });
});
