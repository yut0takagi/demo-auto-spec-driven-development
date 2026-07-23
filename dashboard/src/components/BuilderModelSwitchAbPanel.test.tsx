import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BuilderModelSwitchAbPanel } from './BuilderModelSwitchAbPanel';
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

describe('BuilderModelSwitchAbPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<BuilderModelSwitchAbPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="builder-model-switch-ab-panel"]')).toBeNull();
  });

  it('builder モデルの切り替えが一度も無い場合も「データなし」を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, models: { builder: 'model-a', adversary: 'x', ideation: 'x' } }),
      makeRun({ iteration: 2, models: { builder: 'model-a', adversary: 'x', ideation: 'x' } }),
    ];
    const { container } = render(<BuilderModelSwitchAbPanel runs={runs} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="builder-model-switch-ab-panel"]')).toBeNull();
  });

  it('切り替え後に承認率・マージ率が改善した場合、差分がプラス表記で「改善」と表示される', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'needs-human',
        adversary: { approved: false, summary: '' },
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'model-b', adversary: 'x', ideation: 'x' },
      }),
    ];
    const { container } = render(<BuilderModelSwitchAbPanel runs={runs} />);

    expect(container.querySelector('[data-testid="builder-model-switch-ab-panel"]')).not.toBeNull();
    expect(container.textContent).toContain('1回の切り替え');

    const approvalValue = container.querySelector('[data-testid="builder-model-switch-approval-value-1"]');
    expect(approvalValue?.textContent).toBe('0.0% → 100.0%');
    const approvalVerdict = container.querySelector('[data-testid="builder-model-switch-approval-verdict-1"]');
    expect(approvalVerdict?.textContent).toBe('+100.0pt (改善)');

    const mergeValue = container.querySelector('[data-testid="builder-model-switch-merge-value-1"]');
    expect(mergeValue?.textContent).toBe('0.0% → 100.0%');
    const mergeVerdict = container.querySelector('[data-testid="builder-model-switch-merge-verdict-1"]');
    expect(mergeVerdict?.textContent).toBe('+100.0pt (改善)');
  });

  it('切り替え後に悪化した場合は符号+を付けず「悪化」と表示される', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'needs-human',
        adversary: { approved: false, summary: '' },
        models: { builder: 'model-b', adversary: 'x', ideation: 'x' },
      }),
    ];
    const { container } = render(<BuilderModelSwitchAbPanel runs={runs} />);
    const approvalVerdict = container.querySelector('[data-testid="builder-model-switch-approval-verdict-1"]');
    expect(approvalVerdict?.textContent).toBe('-100.0pt (悪化)');
    const mergeVerdict = container.querySelector('[data-testid="builder-model-switch-merge-verdict-1"]');
    expect(mergeVerdict?.textContent).toBe('-100.0pt (悪化)');
  });

  it('複数回切り替わった場合、各切り替えイベントを switchIndex 順に個別の行として表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'model-b', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'needs-human',
        adversary: { approved: false, summary: '' },
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
    ];
    const { container } = render(<BuilderModelSwitchAbPanel runs={runs} />);
    expect(container.textContent).toContain('2回の切り替え');

    const rows = Array.from(container.querySelectorAll('[data-testid^="builder-model-switch-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'builder-model-switch-row-1',
      'builder-model-switch-row-2',
    ]);

    // 1件目: model-a(iteration1) → model-b(iteration2)、両方とも承認率/マージ率100%で変化なし
    expect(rows[0].textContent).toContain('model-a (iteration 1〜1) → model-b (iteration 2〜2)');
    const verdict1 = container.querySelector('[data-testid="builder-model-switch-approval-verdict-1"]');
    expect(verdict1?.textContent).toBe('0.0pt (変化なし)');

    // 2件目: model-b(iteration2) → 再登板の model-a(iteration3) は前回のmodel-a区間と合算されない
    expect(rows[1].textContent).toContain('model-b (iteration 2〜2) → model-a (iteration 3〜3)');
    expect(rows[1].textContent).toContain('対象反復数: model-b 1件 / model-a 1件');
  });

  it('本文に NaN や undefined を出さない（0除算・空データを含む境界値でも）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'failed',
        adversary: { approved: false, summary: '' },
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'model-b', adversary: 'x', ideation: 'x' },
      }),
    ];
    const { container } = render(<BuilderModelSwitchAbPanel runs={runs} />);
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('undefined');
  });
});
