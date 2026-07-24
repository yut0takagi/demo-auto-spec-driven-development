import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelSkillStratificationPanel } from './ModelSkillStratificationPanel';
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

describe('ModelSkillStratificationPanel', () => {
  it('run が0件、またはfailedのみ（verify未到達）なら「データなし」を表示し、パネル本体を描画しない', () => {
    render(<ModelSkillStratificationPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();

    const runs = [makeRun({ iteration: 1, verdict: 'failed', reviseCycles: 0 })];
    const { container } = render(<ModelSkillStratificationPanel runs={runs} />);
    expect(screen.getAllByText('データなし').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="model-skill-stratification-panel"]')).toBeNull();
  });

  it('revise 0回帯から3+帯にかけて成功率が5pt以上下がったモデルを「負荷に弱い」と判定し、正確な成功率を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0 }),
      makeRun({ iteration: 3, verdict: 'abandoned', reviseCycles: 5 }),
      makeRun({ iteration: 4, verdict: 'abandoned', reviseCycles: 5 }),
    ];
    const { container } = render(<ModelSkillStratificationPanel runs={runs} />);

    const verdict = container.querySelector('[data-testid="model-skill-stratification-verdict-claude-sonnet-5"]');
    expect(verdict?.textContent).toBe('負荷に弱い (-100.0pt)');

    const zeroRate = container.querySelector('[data-testid="model-skill-stratification-rate-claude-sonnet-5-0"]');
    expect(zeroRate?.textContent).toBe('100% (2/2件)');
    const highRate = container.querySelector('[data-testid="model-skill-stratification-rate-claude-sonnet-5-3+"]');
    expect(highRate?.textContent).toBe('0% (0/2件)');
  });

  it('bucketが1種類しか観測できないモデルは「データ不足」と判定し、pt表記を出さない。複数モデルはデータ件数降順で並ぶ', () => {
    const models = (n: string) => ({ builder: n, adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' });
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0, models: models('low-volume') }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0, models: models('high-volume') }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 1, models: models('high-volume') }),
    ];
    const { container } = render(<ModelSkillStratificationPanel runs={runs} />);

    const lowVolumeVerdict = container.querySelector(
      '[data-testid="model-skill-stratification-verdict-low-volume"]',
    );
    expect(lowVolumeVerdict?.textContent).toBe('データ不足');

    const modelEls = Array.from(container.querySelectorAll('[data-testid^="model-skill-stratification-model-"]'));
    expect(modelEls.map((m) => m.getAttribute('data-testid'))).toEqual([
      'model-skill-stratification-model-high-volume',
      'model-skill-stratification-model-low-volume',
    ]);
  });
});
