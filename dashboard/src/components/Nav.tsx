'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: '概要', slug: 'overview' },
  { href: '/ideation', label: 'Ideation', slug: 'ideation' },
  { href: '/gate', label: 'ゲート・離脱', slug: 'gate' },
  { href: '/revise', label: 'Revise', slug: 'revise' },
  { href: '/model', label: 'モデル比較', slug: 'model' },
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <nav data-testid="nav" aria-label="ダッシュボードナビゲーション" className="mb-8 flex flex-wrap gap-2">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            data-testid={`nav-link-${item.slug}`}
            aria-current={isActive ? 'page' : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? 'border-foreground bg-foreground text-background'
                : 'border-transparent opacity-60 hover:opacity-100'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
