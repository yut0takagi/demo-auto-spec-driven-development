import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { Nav } from './Nav';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

function mockPathname(pathname: string) {
  vi.mocked(usePathname).mockReturnValue(pathname);
}

describe('Nav', () => {
  it('5つのページへのリンクをすべて表示する', () => {
    mockPathname('/');
    render(<Nav />);
    expect(screen.getByTestId('nav-link-overview')).toHaveAttribute('href', '/');
    expect(screen.getByTestId('nav-link-ideation')).toHaveAttribute('href', '/ideation');
    expect(screen.getByTestId('nav-link-gate')).toHaveAttribute('href', '/gate');
    expect(screen.getByTestId('nav-link-revise')).toHaveAttribute('href', '/revise');
    expect(screen.getByTestId('nav-link-model')).toHaveAttribute('href', '/model');
  });

  // 現在地のリンクだけに aria-current="page" が付く（一致判定を1件だけ通すことで
  // 「常に true/false を返す」ような壊れた実装を検知する）。
  it('現在のパスに一致するリンクだけに aria-current="page" が付く', () => {
    mockPathname('/gate');
    render(<Nav />);
    expect(screen.getByTestId('nav-link-gate')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('nav-link-overview')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('nav-link-ideation')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('nav-link-revise')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('nav-link-model')).not.toHaveAttribute('aria-current');
  });

  it('ルートパス "/" では概要リンクだけがアクティブになる', () => {
    mockPathname('/');
    render(<Nav />);
    expect(screen.getByTestId('nav-link-overview')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('nav-link-model')).not.toHaveAttribute('aria-current');
  });

  it('どのナビ項目とも一致しないパスでは、いずれのリンクもアクティブにならない', () => {
    mockPathname('/unknown-page');
    render(<Nav />);
    for (const slug of ['overview', 'ideation', 'gate', 'revise', 'model']) {
      expect(screen.getByTestId(`nav-link-${slug}`)).not.toHaveAttribute('aria-current');
    }
  });
});
