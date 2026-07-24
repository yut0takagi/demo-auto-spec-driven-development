import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdversaryCommentTrendPanel } from './AdversaryCommentTrendPanel';
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
    adversary: { approved: true, summary: 'ok' },
    verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 },
    changedLines: 10,
    cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.01, totalUsd: 0.12 },
    models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
    nextIssues: [],
    ...overrides,
  };
}

describe('AdversaryCommentTrendPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体もsvgも描画しない', () => {
    const { container } = render(<AdversaryCommentTrendPanel runs={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="adversary-comment-trend-panel"]')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('全runがfailedなら（サマリーが実測ではないため）データなし扱いになる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed', adversary: { approved: false, summary: '到達せず' } }),
    ];
    render(<AdversaryCommentTrendPanel runs={runs} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
  });

  it('run が1件だけなら折れ線とcircleは描画するが、比較対象が無いため傾向は判定不可の注記を出す', () => {
    const runs = [makeRun({ iteration: 5, adversary: { approved: true, summary: 'x'.repeat(12) } })];
    const { container } = render(<AdversaryCommentTrendPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="adversary-comment-trend-panel"]');
    expect(panel).not.toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('circle')).not.toBeNull();
    expect(container.querySelector('[data-testid="adversary-comment-trend-signal"]')).toBeNull();
    expect(panel?.textContent).toContain('傾向');
    expect(panel?.textContent).toContain('まだ判定できません');
    // ヘッダに最新値(12文字)が表示されている
    // 承認時平均も同じ run 1件から計算され偶然同じ文字数になるため、
    // data-testid で一意に絞り込む（曖昧なテキスト一致だと両方に
    // マッチして getByText が複数要素エラーを出す）。
    const latest = container.querySelector('[data-testid="adversary-comment-trend-latest"]');
    expect(latest?.textContent).toBe('12.0文字');
  });

  it('直近コメントが直前より明確に長文化していると「長文化傾向」を amber で表示する', () => {
    const runs = [
      makeRun({ iteration: 1, adversary: { approved: true, summary: 'x'.repeat(20) } }),
      makeRun({ iteration: 2, adversary: { approved: true, summary: 'x'.repeat(20) } }),
      makeRun({ iteration: 3, adversary: { approved: true, summary: 'x'.repeat(20) } }),
      makeRun({ iteration: 4, adversary: { approved: true, summary: 'x'.repeat(80) } }),
      makeRun({ iteration: 5, adversary: { approved: true, summary: 'x'.repeat(80) } }),
      makeRun({ iteration: 6, adversary: { approved: true, summary: 'x'.repeat(80) } }),
    ];
    const { container } = render(<AdversaryCommentTrendPanel runs={runs} />);
    const signalBlock = container.querySelector('[data-testid="adversary-comment-trend-signal"]');
    expect(signalBlock).not.toBeNull();
    expect(signalBlock?.getAttribute('data-direction')).toBe('lengthening');

    const direction = container.querySelector('[data-testid="adversary-comment-trend-direction"]');
    expect(direction?.textContent).toContain('長文化傾向');
    expect(direction?.className).toContain('text-amber-400');

    const recentAvg = container.querySelector('[data-testid="adversary-comment-trend-recent-avg"]');
    expect(recentAvg?.textContent).toBe('80.0文字');
    const previousAvg = container.querySelector('[data-testid="adversary-comment-trend-previous-avg"]');
    expect(previousAvg?.textContent).toBe('20.0文字');

    expect(signalBlock?.textContent).toContain('直近: 4, 5, 6');
    expect(signalBlock?.textContent).toContain('直前: 1, 2, 3');
  });

  it('直近コメントが直前より短文化していると「短文化傾向」を sky で表示する', () => {
    const runs = [
      makeRun({ iteration: 1, adversary: { approved: true, summary: 'x'.repeat(80) } }),
      makeRun({ iteration: 2, adversary: { approved: true, summary: 'x'.repeat(80) } }),
      makeRun({ iteration: 3, adversary: { approved: true, summary: 'x'.repeat(80) } }),
      makeRun({ iteration: 4, adversary: { approved: true, summary: 'x'.repeat(20) } }),
      makeRun({ iteration: 5, adversary: { approved: true, summary: 'x'.repeat(20) } }),
      makeRun({ iteration: 6, adversary: { approved: true, summary: 'x'.repeat(20) } }),
    ];
    const { container } = render(<AdversaryCommentTrendPanel runs={runs} />);
    const direction = container.querySelector('[data-testid="adversary-comment-trend-direction"]');
    expect(direction?.textContent).toContain('短文化傾向');
    expect(direction?.className).toContain('text-sky-400');
  });

  it('変化がわずか（閾値未満）なら「横ばい」を emerald で表示する', () => {
    const runs = [
      makeRun({ iteration: 1, adversary: { approved: true, summary: 'x'.repeat(100) } }),
      makeRun({ iteration: 2, adversary: { approved: true, summary: 'x'.repeat(100) } }),
      makeRun({ iteration: 3, adversary: { approved: true, summary: 'x'.repeat(100) } }),
      makeRun({ iteration: 4, adversary: { approved: true, summary: 'x'.repeat(102) } }),
      makeRun({ iteration: 5, adversary: { approved: true, summary: 'x'.repeat(102) } }),
      makeRun({ iteration: 6, adversary: { approved: true, summary: 'x'.repeat(102) } }),
    ];
    const { container } = render(<AdversaryCommentTrendPanel runs={runs} />);
    const direction = container.querySelector('[data-testid="adversary-comment-trend-direction"]');
    expect(direction?.textContent).toContain('横ばい');
    expect(direction?.className).toContain('text-emerald-400');
  });

  it('window に満たないデータ数では partial 注記を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, adversary: { approved: true, summary: 'a' } }),
      makeRun({ iteration: 2, adversary: { approved: true, summary: 'bb' } }),
    ];
    const { container } = render(<AdversaryCommentTrendPanel runs={runs} />);
    const signalBlock = container.querySelector('[data-testid="adversary-comment-trend-signal"]');
    expect(signalBlock?.textContent).toContain('データ不足のため window 未満の反復数で計算');
  });

  it('承認時/却下時の平均文字数を分けて表示する', () => {
    const runs = [
      makeRun({ iteration: 1, adversary: { approved: true, summary: 'x'.repeat(10) } }),
      makeRun({ iteration: 2, adversary: { approved: false, summary: 'x'.repeat(50) } }),
    ];
    const { container } = render(<AdversaryCommentTrendPanel runs={runs} />);
    const approved = container.querySelector('[data-testid="adversary-comment-approved-avg"]');
    const rejected = container.querySelector('[data-testid="adversary-comment-rejected-avg"]');
    expect(approved?.textContent).toBe('10.0文字 (1件)');
    expect(rejected?.textContent).toBe('50.0文字 (1件)');
  });

  it('直近コメントのダイジェストを新しい順に、承認/未承認バッジ付きで表示する', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 10, title: 'issue-a', labels: [] }, adversary: { approved: true, summary: '最初のコメント' } }),
      makeRun({ iteration: 2, issue: { number: 11, title: 'issue-b', labels: [] }, adversary: { approved: false, summary: '却下理由の説明' } }),
    ];
    const { container } = render(<AdversaryCommentTrendPanel runs={runs} />);

    const first = container.querySelector('[data-testid="adversary-comment-digest-2"]');
    expect(first).not.toBeNull();
    expect(first?.getAttribute('data-approved')).toBe('false');
    expect(first?.textContent).toContain('issue #11');
    expect(first?.textContent).toContain('未承認');
    expect(first?.textContent).toContain('却下理由の説明');

    const second = container.querySelector('[data-testid="adversary-comment-digest-1"]');
    expect(second?.getAttribute('data-approved')).toBe('true');
    expect(second?.textContent).toContain('承認');
    expect(second?.textContent).toContain('最初のコメント');

    // 新しい順（iteration 2 が iteration 1 より DOM 上で先）
    const items = Array.from(container.querySelectorAll('[data-testid^="adversary-comment-digest-"]'));
    expect(items.map((el) => el.getAttribute('data-testid'))).toEqual([
      'adversary-comment-digest-2',
      'adversary-comment-digest-1',
    ]);
  });

  it('failed run のsummaryはグラフ・ダイジェストいずれの母集団にも含めない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', adversary: { approved: true, summary: '通常のレビュー' } }),
      makeRun({ iteration: 2, verdict: 'failed', adversary: { approved: false, summary: '到達しなかった' } }),
    ];
    const { container } = render(<AdversaryCommentTrendPanel runs={runs} />);
    expect(container.querySelector('[data-testid="adversary-comment-digest-2"]')).toBeNull();
    expect(container.querySelector('[data-testid="adversary-comment-digest-1"]')).not.toBeNull();
    // NaN が座標に紛れ込んでいない
    expect(container.querySelector('svg')?.innerHTML).not.toMatch(/NaN/);
  });
});
