import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * README の「ダッシュボードの見方」が実際の画面表示から乖離していないかを検証する。
 * タイトル文字列はハードコードせず、コンポーネントのソースから抽出する。
 * これにより、タイトルを変更/削除したのに README を更新し忘れた場合にテストが落ちる。
 */

const README_PATH = path.join(process.cwd(), 'README.md');
const PAGE_PATH = path.join(process.cwd(), 'src/app/page.tsx');
const REVISE_CHART_PATH = path.join(process.cwd(), 'src/components/ReviseCyclesChart.tsx');
const TIMELINE_PATH = path.join(process.cwd(), 'src/components/IterationTimeline.tsx');
const BACKLOG_PATH = path.join(process.cwd(), 'src/components/BacklogPanel.tsx');

function readSource(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

/** page.tsx で `<TrendChart title="...">` として渡されているタイトルを抽出する */
function extractTrendChartTitles(pageSource: string): string[] {
  const titles: string[] = [];
  const re = /<TrendChart\s+title="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pageSource)) !== null) {
    titles.push(m[1]);
  }
  return titles;
}

describe('README のダッシュボード解説と実際の画面表示の整合性', () => {
  const readme = readSource(README_PATH);
  const pageSource = readSource(PAGE_PATH);

  it('page.tsx には TrendChart が 4 つ（カバレッジ/コスト/承認率/マージ率）ある前提が崩れていない', () => {
    // このテスト自体が前提を検証しつつ、以降のアサーションが空リストで
    // 無意味に成功してしまう（=何もチェックしない）事態を防ぐ。
    const titles = extractTrendChartTitles(pageSource);
    expect(titles).toEqual(['カバレッジ推移', '累計コスト', '承認率推移', 'マージ率推移']);
  });

  it.each([
    ...extractTrendChartTitles(pageSource),
    'revise 回数の分布',
    '直近の反復',
    'ループが生成した改善バックログ',
  ])('「%s」が README のダッシュボード解説セクションに説明付きで載っている', (title) => {
    const section = readme.slice(readme.indexOf('## ダッシュボードの見方'), readme.indexOf('## Learn More'));
    const lineRe = new RegExp(`^-.*${title}.*$`, 'm');
    const match = lineRe.exec(section);
    expect(match, `README にタイトル「${title}」の行が見つからない`).not.toBeNull();
    if (!match) return;

    // タイトルをそのまま繰り返すだけ（説明なし）の行は不合格にする。
    const line = match[0];
    const afterTitle = line.slice(line.indexOf(title) + title.length);
    const explanation = afterTitle.replace(/^[\s:*：]+/, '');
    expect(explanation.length, `「${title}」の行に説明文がない: ${line}`).toBeGreaterThan(10);
  });

  it('各グラフのソースに実在するタイトル文字列と README の見出しが一致する（片方だけの改名を検知）', () => {
    expect(readSource(REVISE_CHART_PATH)).toContain('revise 回数の分布');
    expect(readSource(TIMELINE_PATH)).toContain('直近の反復');
    expect(readSource(BACKLOG_PATH)).toContain('ループが生成した改善バックログ');
  });

  it('ダッシュボードの見方セクションが Getting Started より後、Learn More より前に存在する', () => {
    const gettingStartedIdx = readme.indexOf('## Getting Started');
    const sectionIdx = readme.indexOf('## ダッシュボードの見方');
    const learnMoreIdx = readme.indexOf('## Learn More');
    expect(gettingStartedIdx).toBeGreaterThan(-1);
    expect(sectionIdx).toBeGreaterThan(gettingStartedIdx);
    expect(learnMoreIdx).toBeGreaterThan(sectionIdx);
  });
});
