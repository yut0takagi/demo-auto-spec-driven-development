This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## ダッシュボードの見方

トップページ (`src/app/page.tsx`) に並ぶ各グラフ・パネルの意味は以下の通りです。

- **直近の反復サマリー**: 最新反復の判定 (verdict) を吹き出し形式で表示したもの。merged/abandoned/needs-human/paused/dry-run/failed で見出し・色分けが切り替わり、Adversary のレビューコメント（またはゲート不通過理由）を本文に表示する。
- **Adversary承認コメントの要約・トレンド**: verify到達済み反復の Adversary レビューコメント(adversary.summary)の文字数推移を折れ線で示し、直近3反復と直前3反復の平均文字数を比較して「長文化傾向」「短文化傾向」「横ばい」を判定する（変化率が±10%未満は横ばい扱い）。あわせて承認時/却下時それぞれの平均文字数と、直近5反復分のコメント本文をそのまま読めるダイジェスト一覧を表示する。failed（クラッシュ）反復のコメントは「レビューに到達しなかった」等の定型文で実際のレビューではないため対象から除く。
- **高revise + 低承認率の前兆検知**: 直近3反復（verify到達済み）の平均revise回数と承認率をローリング集計し、平均revise回数が2回を超え、かつ承認率が50%未満のときに「警戒」、どちらか一方だけ該当するときに「注視」を表示する。サーキットブレーカのように非マージが連続してから発火する事後指標とは異なり、builderが迷走し始めている段階の前兆を捉えるためのもの。
- **CI/ゲート通過時間のトレンド観測**: 各反復の所要時間(durationSec)を分単位の折れ線で表示し、直近3反復の平均と直前3反復の平均を比較して「悪化傾向」「改善傾向」「横ばい」を判定する（変化率が±5%未満は横ばい扱い）。verdict に関係なく全反復（failed も含む）が対象。反復が1件しか無い場合は比較対象が無いため傾向判定を表示しない。
- **Issue開始から初PR作成までの時間トレンド観測**: 実際にPRが作られた反復（prNumber が null でない）に限定して所要時間(durationSec)を分単位の折れ線で表示し、直近3反復の平均と直前3反復の平均を比較して「悪化傾向」「改善傾向」「横ばい」を判定する（変化率が±5%未満は横ばい扱い）。「CI/ゲート通過時間のトレンド観測」が全反復（PRを開けなかった failed/abandoned 含む）を対象にするのに対し、こちらは PR に到達した反復だけを比較することで、issue着手から最初の成果物(PR)が出るまでの速さの傾向を見る。PRが作られた反復が1件以下の場合は比較対象が無いため傾向判定を表示しない。
- **カバレッジ推移**: 各反復のユニットテストカバレッジ(%)の時系列推移。
- **累計コスト**: 各反復にかかった Builder/Adversary/Ideation 合計費用(USD)の推移。
- **承認率推移**: Adversary レビューが承認 (approved) した割合(%)の推移。
- **マージ率推移**: 反復した PR が実際にマージされた割合(%)の推移。
- **E2E失敗率推移**: verify に到達した反復のうち `npm run test:e2e` が失敗した割合(%)の累積推移。failed（クラッシュ）反復は verify に到達しておらず未測定のため含めない。
- **変更行数推移**: 各反復でコミットされた diff の変更行数(changedLines)の時系列推移。failed（クラッシュ）反復はコミット前に終了しており未測定のため含めない。
- **Builder改善の前反復比較**: 直近2件の測定済み(verify到達済み)反復について、revise回数・変更行数・カバレッジ・builderコストを前反復と比較し、各指標が改善/悪化/変化なしのいずれかを表示する。測定済み反復が2件未満の場合は「データなし」を表示する。
- **モデルコストの内訳**: 全反復の累計コストを Builder/Adversary/Ideation の役割別、および実際に使われたモデル名別に集計した内訳。failed（クラッシュ）反復も実際に費用が発生しているため含める。
- **Cost効率（USD per 承認PR）**: 全反復の累計コストを「承認PR」（adversary が approve し、かつ実際に PR が開かれた反復）の件数で割った実効コスト。失敗・見送り反復のコストも分子に含めることで、単純なマージ済みPRのコストより実態に近い効率を示す。承認PRが1件も無い場合は「データなし」。
- **Ideation 失敗率**: バックログ補充のために ideation が実際に実行された反復（cost.ideationUsd > 0）のうち、次の issue を1件も生成できなかった割合。ready が既に足りていて ideation 自体がスキップされた反復は分母に含めない。ideation が1件も実行されていない場合は「データなし」。
- **Ideationコスト効率と生成品質の関連性**: ideation が提案した issue 1件あたりのコスト単価（cost.ideationUsd ÷ 提案件数）と、その提案 issue が実際に後続反復として着手されたときの承認率・マージ率の Pearson 相関係数。反復ごとの単価・着手件数・承認率・マージ率も一覧表示する。着手前の提案（まだ後続反復が無い）は「未着手」と表示し、相関算出の母集団から除く。ideation が1件も提案を行っていない場合は「データなし」。
- **ゲート不通過理由の分類**: 全反復の gateReasons（ゲートを通過しなかった理由）を「verify失敗」「e2e失敗」「adversary未承認」「変更行数超過」「保護パス変更」「変更なし」「例外クラッシュ」「その他」に分類し、出現件数の多い順に一覧表示したもの。変更行数超過や例外メッセージのように具体的な数値・文言が反復ごとに異なる理由も、共通のパターンで同じ分類にまとめる。
- **ゲート理由の時系列burden**: gateReasons を持つ反復ごとにカテゴリ別の出現件数を積み上げ棒グラフで表示し、いつ・どのカテゴリの負担が重かったかを時系列で見えるようにしたもの。
- **ゲート不通過理由のカテゴリ別トレンド**: gateReasons のカテゴリ別出現件数を直近3反復と直前3反復のローリング窓で比較し、「悪化」「改善」「横ばい」を判定したもの。閾値（0.5件/反復）未満のブレは横ばい扱いとし、悪化・改善しているカテゴリだけを変化幅の大きい順に一覧表示する。比較対象の反復が不足している場合は判定不能である旨を表示する。
- **Abandoned反復の追跡・分析**: `abandoned`（ゲートを再試行しても満たせず、人間に振らず自動で見送った）反復だけを他の非マージ類型（failed/needs-human/paused/dry-run）と混ぜずに集計したもの。累積見送り率・浪費コスト(USD)・平均revise回数・最多のゲート不通過理由カテゴリをサマリー表示し、各abandoned反復を新しい順に issue番号・タイトル・gateReasons込みで一覧表示する。abandoned が1件も無い場合は「データなし」。
- **revise 回数の分布**: 各反復の revise 回数を棒グラフで示し、中央値（実線）と外れ値の閾値（破線）を重ねたもの。閾値を超えるバーは赤色で強調される。
- **Model別 revise回数の分布**: verify に到達した反復を Builder に使われたモデル別にグルーピングし、平均・中央値・最小〜最大・件数を一覧表示したもの。平均revise回数が多いモデルほど上に表示され、どのモデルが revise を重ねやすいかを比較できる。
- **Verdict別 revise回数の分布**: 全反復を判定 (verdict) 別にグルーピングし、平均・中央値・最小〜最大・件数を一覧表示したもの。Model別の分布とは異なり failed（クラッシュ）反復も「クラッシュするまでのrevise回数」として独立したグループに含め、merged 等と並べて比較できるようにする。平均revise回数が多いverdictほど上に表示される。
- **revise回数とverdictの関連図**: revise回数を0/1/2/3回以上の4区分に分け、各区分内で反復がどの判定(verdict)に分岐したかを積み上げ帯グラフで示したもの。「Verdict別 revise回数の分布」が平均・中央値に集約するのに対し、こちらは「revise 0回はほぼ全部mergedだが、3回以上になるとabandonedの割合が増える」といった閾値付近の分岐傾向をそのまま見せる。各区分の帯の右上にmerged到達率(%)も表示する。
- **Verdict別 平均CI/ゲート通過時間の比較**: 全反復を判定 (verdict) 別にグルーピングし、所要時間(durationSec)の平均・中央値・最小〜最大・件数を分単位で一覧表示したもの。「CI/ゲート通過時間のトレンド観測」が全反復を通した時系列の悪化/改善しか見せないのに対し、こちらは「どの verdict に落ち着いた反復が時間を要しているか」を比較できる。Verdict別 revise回数の分布と同様、failed（クラッシュ）反復も「クラッシュするまでの経過時間」として独立したグループに含める。平均所要時間が長いverdictほど上に表示される。
- **モデル選択の効果測定**: Builder に使われたモデル（例: Sonnet vs Haiku）別に、マージ率・承認率・e2e失敗率・平均revise回数・平均カバレッジ・平均コストをまとめて比較したもの。revise回数のみを見る「Model別 revise回数の分布」とは異なり、実際にマージまで到達した効果とコストを合わせて見ることで、どのモデルを選ぶべきかの判断材料にする。マージ率の高いモデルほど上に表示される。
- **モデル別 承認率・マージ率比較**: Builder に使われたモデル別に、承認率とマージ率を同じスケールの横棒で並べて直接比較したもの。「モデル選択の効果測定」がマージ率降順で並ぶのに対し、こちらはモデル名の昇順で固定し、承認率とマージ率の差分（承認→マージのギャップ）を表示することで、承認はされたのにマージまで到達していないモデル（paused/dry-run 等で止まっている）を見つけやすくする。
- **Model別 承認率トレンド観測**: Builder に使われたモデル別に、累積承認率(%)の推移を折れ線で並べて表示したもの。「モデル選択の効果測定」「モデル別 承認率・マージ率比較」が期間全体を1点のサマリーに集約するのに対し、こちらはモデルごとに独立した時系列で承認率を追い、モデルを切り替えた後に承認率が実際に改善/悪化しているかを比較できるようにする。verify に到達した反復が無いモデルは「データなし」と表示される。
- **直近の反復**: 直近 20 件の反復を新しい順に並べ、判定 (verdict)・revise 回数・コストを一覧表示したもの。
- **ループが生成した改善バックログ**: 各反復の完了時にループが自動生成した次の issue 候補の一覧。

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
