import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MetricCards } from './MetricCards';
import type { Summary } from '@/lib/aggregate';

/** ラベルの祖先カード（.rounded-xl コンテナ）を取得する。テスト内スコープ限定のヘルパー。 */
function getCard(label: string): HTMLElement {
  const card = screen.getByText(label, { exact: true }).closest('.rounded-xl');
  if (!(card instanceof HTMLElement)) {
    throw new Error(`"${label}" の祖先に .rounded-xl カードが見つからない`);
  }
  return card;
}

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
  latestDurationSec: 545,
  latestDurationIteration: 12,
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

  it('直近反復の所要時間を分表記で表示し、どの iteration の値か明示する', () => {
    render(<MetricCards summary={summary} />);
    // 545秒 = 9.0833...分。平均サイクルタイムの "7.0分" と混同しないよう別値にしている。
    expect(screen.getByText('9.1分')).toBeInTheDocument();
    expect(screen.getByText('iteration 12')).toBeInTheDocument();
  });

  it('直近反復の所要時間が平均サイクルタイムと異なる値でも、それぞれ独立して表示する', () => {
    const differing: Summary = { ...summary, avgCycleTimeSec: 420, latestDurationSec: 60, latestDurationIteration: 3 };
    render(<MetricCards summary={differing} />);
    expect(screen.getByText('7.0分')).toBeInTheDocument();
    expect(screen.getByText('1.0分')).toBeInTheDocument();
    expect(screen.getByText('iteration 3')).toBeInTheDocument();
  });

  it('「直近の所要時間」カードは、そのラベルと値・iteration番号が同一カード内で共存する', () => {
    render(<MetricCards summary={summary} />);
    const latestDurationCard = getCard('直近の所要時間');
    // 545秒 = 9.1分（平均サイクルタイムの7.0分とは別の値）がラベルと同じカードにある
    expect(within(latestDurationCard).getByText('9.1分')).toBeInTheDocument();
    expect(within(latestDurationCard).getByText('iteration 12')).toBeInTheDocument();
    // 平均サイクルタイムの値が紛れ込んでいないこと（混同していないこと）の確認
    expect(within(latestDurationCard).queryByText('7.0分')).not.toBeInTheDocument();
  });

  it('「サイクルタイム」（平均）カードは、直近反復の所要時間の値を含まない', () => {
    render(<MetricCards summary={summary} />);
    const cycleTimeCard = getCard('サイクルタイム');
    expect(within(cycleTimeCard).getByText('7.0分')).toBeInTheDocument();
    // 直近反復の値(9.1分)や、そのiteration番号ラベルが紛れ込んでいないこと
    expect(within(cycleTimeCard).queryByText('9.1分')).not.toBeInTheDocument();
    expect(within(cycleTimeCard).queryByText('iteration 12')).not.toBeInTheDocument();
  });
});
