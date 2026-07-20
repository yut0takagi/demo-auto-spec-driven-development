import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricCards } from './MetricCards';
import type { Summary } from '@/lib/aggregate';

const summary: Summary = {
  totalRuns: 12,
  mergedRuns: 9,
  approvalRate: 0.75,
  mergeRate: 0.75,
  avgCycleTimeSec: 420,
  avgReviseCycles: 1.5,
  totalCostUsd: 1.234,
  latestCoveragePct: 87.5,
  latestCoverageIteration: 12,
  latestCoverageStale: false,
};

describe('MetricCards', () => {
  it('反復数を表示する', () => {
    render(<MetricCards summary={summary} />);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('割合をパーセント表記にする', () => {
    render(<MetricCards summary={summary} />);
    // approvalRate と mergeRate がどちらも 0.75 の fixture なので "75%" は
    // 承認率カードとマージ率カードの2箇所に出る（getByText だと単一要素の
    // 前提が崩れて "Found multiple elements" で失敗するため getAllByText を使う）。
    expect(screen.getAllByText('75%')).toHaveLength(2);
  });

  it('コストをドル2桁で表示する', () => {
    render(<MetricCards summary={summary} />);
    expect(screen.getByText('$1.23')).toBeInTheDocument();
  });

  it('サイクルタイムを分表記にする', () => {
    render(<MetricCards summary={summary} />);
    expect(screen.getByText('7.0分')).toBeInTheDocument();
  });

  it('カバレッジが最新反復のものであれば「最新反復」とだけ表示する', () => {
    render(<MetricCards summary={summary} />);
    expect(screen.getByText('最新反復')).toBeInTheDocument();
  });

  // Summary に latestCoverageIteration / latestCoverageStale が追加された理由:
  // クラッシュした最新 iteration の代わりに古い iteration の値を出す際、
  // どの iteration の値なのかを明示しないと「最新の値」として誤解される
  // （実際に過去、クラッシュ run がカバレッジ 0% への急落と誤読された事故があった）。
  it('カバレッジが古い iteration の値なら、その iteration 番号を明示する', () => {
    const stale: Summary = {
      ...summary,
      latestCoveragePct: 62.3,
      latestCoverageIteration: 9,
      latestCoverageStale: true,
    };
    render(<MetricCards summary={stale} />);
    expect(screen.getByText('62.3%')).toBeInTheDocument();
    expect(screen.getByText(/iteration 9/)).toBeInTheDocument();
    // 「最新反復」という誤解を招く表示のままにしてはいけない
    expect(screen.queryByText('最新反復')).not.toBeInTheDocument();
  });

  it('コストが浮動小数点誤差を含んでいても丸めて表示する（生の float を DOM に出さない）', () => {
    const messy: Summary = { ...summary, totalCostUsd: 1.1099999999999999 };
    render(<MetricCards summary={messy} />);
    expect(screen.getByText('$1.11')).toBeInTheDocument();
    expect(screen.queryByText(/1\.1099999999999999/)).not.toBeInTheDocument();
  });
});
