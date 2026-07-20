import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadErrorBanner } from './LoadErrorBanner';
import type { LoadError } from '@/lib/loadData';

describe('LoadErrorBanner', () => {
  it('errors が空配列なら何も描画しない', () => {
    const { container } = render(<LoadErrorBanner errors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('errors があればファイルごとに一覧表示する', () => {
    const errors: LoadError[] = [
      { file: '0002.json', message: '0002.json: フィールド "verdict" が不正な値または欠落している' },
      { file: '0009.json', message: '0009.json: フィールド "cost.totalUsd" は number である必要がある' },
    ];
    render(<LoadErrorBanner errors={errors} />);
    expect(screen.getByTestId('load-error-banner')).toBeInTheDocument();
    expect(screen.getByText('2 件の実行記録を読み込めませんでした')).toBeInTheDocument();
    expect(screen.getByText(/0002\.json/)).toBeInTheDocument();
    expect(screen.getByText(/0009\.json/)).toBeInTheDocument();
  });
});
