import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EarlyWarningCard } from './EarlyWarningCard';
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

describe('EarlyWarningCard', () => {
  it('run が0件なら「データなし」を表示し、カード本体を描画しない', () => {
    const { container } = render(<EarlyWarningCard runs={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="early-warning-card"]')).toBeNull();
  });

  it('高revise・低承認が揃うと critical レベルを表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 3, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 3, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 3, adversary: { approved: false, summary: '' } }),
    ];
    const { container } = render(<EarlyWarningCard runs={runs} />);
    const card = container.querySelector('[data-testid="early-warning-card"]');
    expect(card).not.toBeNull();
    expect(card?.getAttribute('data-level')).toBe('critical');

    const level = container.querySelector('[data-testid="early-warning-level"]');
    expect(level?.textContent).toContain('警戒');
    expect(level?.className).toContain('text-rose-400');

    const reviseValue = container.querySelector('[data-testid="early-warning-revise-value"]');
    expect(reviseValue?.textContent).toBe('3.0回');
    expect(reviseValue?.className).toContain('text-rose-400');

    const approvalValue = container.querySelector('[data-testid="early-warning-approval-value"]');
    expect(approvalValue?.textContent).toBe('0%');
    expect(approvalValue?.className).toContain('text-rose-400');
  });

  it('平常時は normal レベルを表示し、値は強調色を付けない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 1, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 0, adversary: { approved: true, summary: '' } }),
    ];
    const { container } = render(<EarlyWarningCard runs={runs} />);
    const card = container.querySelector('[data-testid="early-warning-card"]');
    expect(card?.getAttribute('data-level')).toBe('normal');

    const level = container.querySelector('[data-testid="early-warning-level"]');
    expect(level?.textContent).toContain('平常');
    expect(level?.className).toContain('text-emerald-400');

    const reviseValue = container.querySelector('[data-testid="early-warning-revise-value"]');
    expect(reviseValue?.className).not.toContain('text-rose-400');
    const approvalValue = container.querySelector('[data-testid="early-warning-approval-value"]');
    expect(approvalValue?.className).not.toContain('text-rose-400');
  });

  it('高reviseのみ該当する場合は watch レベルを、承認率側は強調しない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 3, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 3, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 3, adversary: { approved: true, summary: '' } }),
    ];
    const { container } = render(<EarlyWarningCard runs={runs} />);
    const card = container.querySelector('[data-testid="early-warning-card"]');
    expect(card?.getAttribute('data-level')).toBe('watch');
    expect(container.querySelector('[data-testid="early-warning-level"]')?.className).toContain('text-amber-400');

    const reviseValue = container.querySelector('[data-testid="early-warning-revise-value"]');
    expect(reviseValue?.className).toContain('text-rose-400');
    const approvalValue = container.querySelector('[data-testid="early-warning-approval-value"]');
    expect(approvalValue?.className).not.toContain('text-rose-400');
  });

  it('window に満たないデータ数では「データ不足」の注記を表示する', () => {
    const runs = [makeRun({ iteration: 7, verdict: 'merged', reviseCycles: 5, adversary: { approved: false, summary: '' } })];
    const { container } = render(<EarlyWarningCard runs={runs} />);
    const card = container.querySelector('[data-testid="early-warning-card"]');
    expect(card?.textContent).toContain('データ不足');
    expect(card?.textContent).toContain('対象iteration: 7');
  });

  it('failed run（sentinel）を含む場合、母集団から除外された正しい対象iterationを表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 3, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 3, adversary: { approved: false, summary: '' } }),
      makeRun({
        iteration: 3, verdict: 'failed', reviseCycles: 99,
        adversary: { approved: false, summary: 'レビューに到達しなかった。' },
      }),
      makeRun({ iteration: 4, verdict: 'merged', reviseCycles: 3, adversary: { approved: false, summary: '' } }),
    ];
    const { container } = render(<EarlyWarningCard runs={runs} />);
    const card = container.querySelector('[data-testid="early-warning-card"]');
    // failed(iteration 3) を除外した [1, 2, 4] が対象。99回が紛れ込んで平均が跳ね上がっていないことも確認。
    expect(card?.textContent).toContain('対象iteration: 1, 2, 4');
    const reviseValue = container.querySelector('[data-testid="early-warning-revise-value"]');
    expect(reviseValue?.textContent).toBe('3.0回');
  });
});
