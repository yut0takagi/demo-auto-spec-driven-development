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
- **Issue生成からIssueクローズまでの解決時間トレンド**: issue番号が最初にどこかの反復の nextIssues に現れた時点（生成）から、その issue が merged/abandoned のいずれかに達した反復（クローズ）までの所要時間を分単位の折れ線で表示し、直近3件の平均と直前3件の平均を比較して「悪化傾向」「改善傾向」「横ばい」を判定する（変化率が±5%未満は横ばい扱い）。同一issue番号が複数回dispatchされている場合は生成後最初のクローズだけを1件として数える。生成元が特定できないissue（seed issue等）や解決済みissueが1件以下の場合は対象外・傾向判定なしとなる。
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
- **ゲート不通過理由の分類**: 全反復の gateReasons（ゲートを通過しなかった理由）を「verify失敗」「e2e失敗」「adversary未承認」「adversary出力解析不能」「変更行数超過」「保護パス変更」「変更なし」「例外クラッシュ」「その他」に分類し、出現件数の多い順に一覧表示したもの。変更行数超過や例外メッセージのように具体的な数値・文言が反復ごとに異なる理由も、共通のパターンで同じ分類にまとめる。「adversary未承認」は gateReasons 文字列だけでは区別できない2種類（具体的な欠陥を指摘した棄却／adversaryの応答を構造化できず安全側に倒した技術的棄却）を含むため、後者は run.adversary.summary を手がかりに「adversary出力解析不能」として分離する。
- **ゲート理由の時系列burden**: gateReasons を持つ反復ごとにカテゴリ別の出現件数を積み上げ棒グラフで表示し、いつ・どのカテゴリの負担が重かったかを時系列で見えるようにしたもの。
- **ゲート失敗別 reviseの実質コスト**: 他のゲート系パネルが出現件数（頻度）だけを見るのに対し、こちらはカテゴリごとに実際にかかったコスト(USD)・所要時間・revise回数を合算し、合計コストの多い順に一覧表示したもの。同じ出現件数でも、revise を繰り返してようやく解消するカテゴリと revise 前に即座に abandon するカテゴリとではループが払う実質コストの実態が異なるため、revise 1回あたりのUSD/所要時間も併記する。該当カテゴリの全反復が revise 0回（即abandon等）の場合は0除算を避けてその旨を表示する。gateReasonsを持つ反復が1件も無い場合は「データなし」。
- **ゲート不通過理由のカテゴリ別トレンド**: gateReasons のカテゴリ別出現件数を直近3反復と直前3反復のローリング窓で比較し、「悪化」「改善」「横ばい」を判定したもの。閾値（0.5件/反復）未満のブレは横ばい扱いとし、悪化・改善しているカテゴリだけを変化幅の大きい順に一覧表示する。比較対象の反復が不足している場合は判定不能である旨を表示する。
- **ゲート不通過理由の連鎖（パス別）**: 他のゲート系パネルが全反復・全カテゴリを1つの分布/時系列に集約するのに対し、こちらは gateReasons を持つ反復（パス）ごとに、その回でどのカテゴリがどの順で連鎖して発生したか（例: e2e失敗 → adversary未承認 → 変更行数超過）をそのまま新しい順に一覧表示する。adversaryの応答が構造化できず技術的に棄却された反復は「adversary出力解析不能」として区別され、「adversary未承認」（内容を読んで却下）と混同されない。gateReasonsを持つ反復が1件も無い場合は「データなし」。
- **ゲート不通過理由×モデル別 Adversary承認率**: 「ゲート不通過理由の分類」がカテゴリの出現件数だけを集計するのに対し、こちらはそのカテゴリの反復をレビューした adversary モデル別に分割し、各(カテゴリ, モデル)の組み合わせで adversary が実際に approve していた割合(%)を表示する。「adversary未承認」「adversary出力解析不能」は分類の定義上 adversary.approved が常に false のため承認率は常に0%になる（バグではない）。一方 verify失敗・e2e失敗等は adversary の判断とは独立した失敗要因なので、「approveしたのにverify/e2eで落ちた」というモデルごとの見落とし傾向が見える。gateReasonsを持つ反復が1件も無い場合は「データなし」。
- **Abandoned反復の追跡・分析**: `abandoned`（ゲートを再試行しても満たせず、人間に振らず自動で見送った）反復だけを他の非マージ類型（failed/needs-human/paused/dry-run）と混ぜずに集計したもの。累積見送り率・浪費コスト(USD)・平均revise回数・最多のゲート不通過理由カテゴリをサマリー表示し、各abandoned反復を新しい順に issue番号・タイトル・gateReasons込みで一覧表示する。abandoned が1件も無い場合は「データなし」。
- **Paused/Dryrun反復の停止理由・生存時間分析**: `paused`（人間がキルスイッチで停止）と`dry-run`（最初からマージしない設定）はどちらもゲート自体は通過済みで gateReasons が空のため、abandonedのようにゲート不通過理由では分類できない。代わりに停止理由（paused/dry-run）別に件数・PR開設件数・合計コストを集計し、「生存時間」として各反復の完了後runs全体の最新反復まで何反復が経過したか（survivalIterations）の平均・最大を表示する。経過時刻ではなく反復数で測るのは、ビルド時点で決定的に計算するため。最も長く放置されている反復と、各反復の詳細も新しい順に一覧表示する。該当反復が1件も無い場合は「データなし」。
- **revise 回数の分布**: 各反復の revise 回数を棒グラフで示し、中央値（実線）と外れ値の閾値（破線）を重ねたもの。閾値を超えるバーは赤色で強調される。
- **Model別 revise回数の分布**: verify に到達した反復を Builder に使われたモデル別にグルーピングし、平均・中央値・最小〜最大・件数を一覧表示したもの。平均revise回数が多いモデルほど上に表示され、どのモデルが revise を重ねやすいかを比較できる。
- **Verdict別 revise回数の分布**: 全反復を判定 (verdict) 別にグルーピングし、平均・中央値・最小〜最大・件数を一覧表示したもの。Model別の分布とは異なり failed（クラッシュ）反復も「クラッシュするまでのrevise回数」として独立したグループに含め、merged 等と並べて比較できるようにする。平均revise回数が多いverdictほど上に表示される。
- **revise回数とverdictの関連図**: revise回数を0/1/2/3回以上の4区分に分け、各区分内で反復がどの判定(verdict)に分岐したかを積み上げ帯グラフで示したもの。「Verdict別 revise回数の分布」が平均・中央値に集約するのに対し、こちらは「revise 0回はほぼ全部mergedだが、3回以上になるとabandonedの割合が増える」といった閾値付近の分岐傾向をそのまま見せる。各区分の帯の右上にmerged到達率(%)も表示する。
- **Verdict別 平均CI/ゲート通過時間の比較**: 全反復を判定 (verdict) 別にグルーピングし、所要時間(durationSec)の平均・中央値・最小〜最大・件数を分単位で一覧表示したもの。「CI/ゲート通過時間のトレンド観測」が全反復を通した時系列の悪化/改善しか見せないのに対し、こちらは「どの verdict に落ち着いた反復が時間を要しているか」を比較できる。Verdict別 revise回数の分布と同様、failed（クラッシュ）反復も「クラッシュするまでの経過時間」として独立したグループに含める。平均所要時間が長いverdictほど上に表示される。
- **E2E失敗とコード変更範囲(diff size)の相関**: verify に到達した反復を e2e成功/失敗の2群に分け、それぞれの平均変更行数(changedLines)と、e2e成功/失敗(0/1)と変更行数の Pearson 相関係数を表示したもの。失敗群の平均が成功群よりどれだけ大きい/小さいかを文章でも示し、diffが大きい反復ほどe2eが失敗しやすい傾向があるかを見る。e2e結果が全反復で同じ（分散0）の場合は相関係数を「算出不可」とする。e2e失敗した反復の番号も一覧表示する。verify に到達した反復が1件も無い場合は「データなし」。
- **モデル選択の効果測定**: Builder に使われたモデル（例: Sonnet vs Haiku）別に、マージ率・承認率・e2e失敗率・平均revise回数・平均カバレッジ・平均コストをまとめて比較したもの。revise回数のみを見る「Model別 revise回数の分布」とは異なり、実際にマージまで到達した効果とコストを合わせて見ることで、どのモデルを選ぶべきかの判断材料にする。マージ率の高いモデルほど上に表示される。
- **モデル別 承認率・マージ率比較**: Builder に使われたモデル別に、承認率とマージ率を同じスケールの横棒で並べて直接比較したもの。「モデル選択の効果測定」がマージ率降順で並ぶのに対し、こちらはモデル名の昇順で固定し、承認率とマージ率の差分（承認→マージのギャップ）を表示することで、承認はされたのにマージまで到達していないモデル（paused/dry-run 等で止まっている）を見つけやすくする。
- **Adversary 承認⇔実結果 乖離**: 「モデル別 承認率・マージ率比較」が builder モデル別に承認率とマージ率という2本の集計値のギャップ(pt)を見せるのに対し、こちらは adversary モデル別に「個々の反復で承認判断(adversary.approved)と実結果(verdict)が一致していたか」を件数ベースで突き合わせる。承認した(approved=true)のに実際は merged にならなかった反復を「見落とし」として件数・率・発生した反復番号つきで表示し、対称に却下したのにmergedになった「誤却下」も算出する。両者の合計が全判定件数に占める割合を「乖離率」として adversary モデルを乖離率の高い順に並べ、承認を出しても実際の結果を伴わない傾向が強いモデルを見つけやすくする。failed（レビュー未到達）反復は判定対象から除く。verify に到達した反復が1件も無い場合は「データなし」。
- **Builderモデル切り替えのA/B比較**: 「モデル選択の効果測定」「モデル別 承認率・マージ率比較」が期間全体でモデルごとに全反復を合算するのに対し、こちらは Builder に使われたモデルが iteration 順で実際に切り替わったタイミングだけを取り出し、切り替え直前の連続区間(A)と直後の連続区間(B)で承認率・マージ率を直接A/B比較する。同じモデルが後で再登板しても過去の区間とは合算せず、切り替えイベントごとに改善/悪化/変化なしを判定する。切り替えが一度も無い（builder が同一モデルのまま）場合は「データなし」を表示する。
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
