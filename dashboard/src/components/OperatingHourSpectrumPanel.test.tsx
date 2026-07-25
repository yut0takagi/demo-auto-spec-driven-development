import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OperatingHourSpectrumPanel } from './OperatingHourSpectrumPanel';
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

describe('OperatingHourSpectrumPanel', () => {
  it('runsが0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<OperatingHourSpectrumPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="operating-hour-spectrum-panel"]')).toBeNull();
  });

  it('startedAtが不正な反復しか無い場合も「データなし」を表示する', () => {
    const { container } = render(
      <OperatingHourSpectrumPanel runs={[makeRun({ startedAt: 'invalid-date' })]} />,
    );
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="operating-hour-spectrum-panel"]')).toBeNull();
  });

  it('business/nightそれぞれの件数・マージ率・平均コストを表示し、24時間分のバーを描画する', () => {
    const runs = [
      // business: 平日(2026-07-24 Fri) JST10:00, merged
      makeRun({
        iteration: 1,
        startedAt: '2026-07-24T01:00:00Z',
        verdict: 'merged',
        cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 },
      }),
      // night: 平日夜間(JST翌05:00), merged
      makeRun({
        iteration: 2,
        startedAt: '2026-07-24T20:00:00Z',
        verdict: 'merged',
        cost: { builderUsd: 2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 2 },
      }),
      // night: 土曜日中(JST10:00でも夜間), failed
      makeRun({
        iteration: 3,
        startedAt: '2026-07-25T01:00:00Z',
        verdict: 'failed',
        cost: { builderUsd: 4, adversaryUsd: 0, ideationUsd: 0, totalUsd: 4 },
      }),
    ];
    const { container } = render(<OperatingHourSpectrumPanel runs={runs} />);

    expect(container.querySelector('[data-testid="operating-hour-spectrum-panel"]')).not.toBeNull();

    const bars = container.querySelectorAll('[data-testid^="operating-hour-bar-"]');
    expect(bars).toHaveLength(24);

    const business = container.querySelector('[data-testid="operating-hour-category-stats-business"]');
    expect(business?.textContent).toContain('1反復');
    expect(business?.textContent).toContain('マージ率100.0%');
    expect(business?.textContent).toContain('平均$1.00');

    const night = container.querySelector('[data-testid="operating-hour-category-stats-night"]');
    expect(night?.textContent).toContain('2反復');
    expect(night?.textContent).toContain('マージ率50.0%');
    expect(night?.textContent).toContain('平均$3.00');
  });

  it('同じ時台にbusinessとnightの反復が混在する場合、その時台のバーはbusiness/nightの2区分に積み上げ表示される', () => {
    const runs = [
      // business: 平日(2026-07-24 Fri) JST10:00
      makeRun({ iteration: 1, startedAt: '2026-07-24T01:00:00Z' }),
      // night: 土曜(2026-07-25 Sat) JST10:00、時刻は同じでも曜日により夜間扱い
      makeRun({ iteration: 2, startedAt: '2026-07-25T01:00:00Z' }),
    ];
    const { container } = render(<OperatingHourSpectrumPanel runs={runs} />);

    const bar = container.querySelector('[data-testid="operating-hour-bar-10"]')!;
    expect(bar.getAttribute('title')).toContain('2反復');
    const segments = bar.querySelectorAll('div');
    expect(segments).toHaveLength(2);
    expect(segments[0].className).toContain('bg-indigo-400');
    expect(segments[1].className).toContain('bg-sky-400');
    // 唯一計上のある時台なのでmaxCount=2、業務/夜間それぞれ1件ずつなので両区分とも高さ50%
    expect(segments[0].getAttribute('style')).toContain('height: 50%');
    expect(segments[1].getAttribute('style')).toContain('height: 50%');
  });
});
