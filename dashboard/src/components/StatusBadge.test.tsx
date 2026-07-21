import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';
import type { LoopStatus } from '@/lib/types';

const base: LoopStatus = {
  state: 'RUNNING',
  reason: '正常稼働中',
  actor: 'system',
  updatedAt: '2026-07-20T10:00:00Z',
  resumeHint: 'n/a',
};

describe('StatusBadge', () => {
  it('状態文字列を表示する', () => {
    render(<StatusBadge status={base} />);
    expect(screen.getByText('RUNNING')).toBeInTheDocument();
  });

  it('停止時は理由・停止主体・再開手順をすべて表示する', () => {
    render(
      <StatusBadge
        status={{
          state: 'HALTED',
          reason: '連続3回ゲート失敗',
          actor: 'breaker:consecutive-failures',
          updatedAt: '2026-07-20T10:00:00Z',
          resumeHint: 'gh variable set LOOP_ENABLED --body true',
        }}
      />
    );
    expect(screen.getByText('HALTED')).toBeInTheDocument();
    expect(screen.getByText(/連続3回ゲート失敗/)).toBeInTheDocument();
    expect(screen.getByText(/breaker:consecutive-failures/)).toBeInTheDocument();
    expect(screen.getByText(/LOOP_ENABLED --body true/)).toBeInTheDocument();
  });

  it('状態ごとに異なる data-state を持つ', () => {
    const { rerender } = render(<StatusBadge status={base} />);
    expect(screen.getByTestId('status-badge')).toHaveAttribute('data-state', 'RUNNING');
    rerender(<StatusBadge status={{ ...base, state: 'PAUSED' }} />);
    expect(screen.getByTestId('status-badge')).toHaveAttribute('data-state', 'PAUSED');
  });

  // `loadStatus` は updatedAt が string であることしか検証しない。壊れた Python 出力が
  // 不正な日付文字列を送ってきても `new Date(...).toISOString()` の RangeError で
  // static export のビルドごと落ちてはいけない（デビエーション: 仕様コードにガードを追加）。
  it('updatedAt が不正な日付文字列でもクラッシュしない', () => {
    expect(() =>
      render(<StatusBadge status={{ ...base, updatedAt: 'not-a-real-date' }} />)
    ).not.toThrow();
    expect(screen.getByTestId('status-badge')).toBeInTheDocument();
    expect(screen.getByText(/not-a-real-date/)).toBeInTheDocument();
  });
});
