# text2ascii

テーマの文章から、Claude に描く内容を考えさせて ASCII アートを出力する CLI。
文字や画像をそのまま変換するのではなく、テーマの雰囲気や比喩をモデルが解釈して絵にする。

```console
$ text2ascii "月曜日の朝の憂鬱"
      .-~~~-.            MONDAY            .-~~~-.
    .(  rain )  .---------------------.   (  gray  ).
   (___________)|  MON  07:00  ALARM  |  (__________)
    ' ' ' ' ' ' '---------------------'   ' ' ' ' ' '
     ' ' ' ' '     BRRRING! BRRRING!       ' ' ' '

            ___________________________
           /    zzz...     _____      /|
          /   .-----.     /     \    / |
         /   ( -  - )    |  ~~~  |  /  |
        /     \ ~~ /      \_____/  /   |
       /   ___/    \___   (coffee)/    /
      /___/  blanket   \_________/    /
      |__________________________|   /
      |                          |  /
      |__________________________|_/

        "...mou getsuyoubi ka..."   *sigh*
```

## 必要なもの

- Bun 1.3 以上
- Claude Code の `claude` コマンド（`claude -p` を使える状態）

Claude は `claude -p` 経由で呼ぶため、API キーは要らない。
費用は Claude Code のサブスクリプションの枠から出る。

## インストール

```sh
bun install
bun run build                      # dist/text2ascii を作る
cp dist/text2ascii ~/.local/bin/   # PATH の通った場所に置く
```

ビルドせずに `bun src/cli/main.ts <テーマ>` でも動く。

## 使い方

```sh
text2ascii "締切前夜"
echo "コーヒーを飲みながらコードを書くエンジニア" | text2ascii
text2ascii -e high --width 80 --height 24 "a rocket launching into space"
text2ascii -v "三日月の下で眠る猫"      # 試行ごとの秒数と定価換算の費用を標準エラーに出す
text2ascii -- "--help と叫ぶロボット"   # ハイフンで始まるテーマは -- の後ろに置く
```

| オプション | 既定 | 内容 |
| --- | --- | --- |
| `-m, --model <id>` | `claude-opus-5-5` | 使うモデル |
| `-e, --effort <level>` | `low` | `low` `medium` `high` `xhigh` `max` |
| `--width <n>` | `60` | 絵の幅の上限（列数） |
| `--height <n>` | `20` | 絵の高さの上限（行数） |
| `--retries <n>` | `1` | 規則に違反したとき、描き直させる回数 |
| `--json` | なし | 絵と試行ごとの使用量を JSON で出力する |
| `-v, --verbose` | なし | 試行ごとのモデル、秒数、費用を標準エラーに出す |

| 終了コード | 意味 |
| --- | --- |
| 0 | 条件を満たす絵を出力した |
| 1 | Claude の呼び出しに失敗した |
| 2 | 引数が正しくない |
| 3 | 描き直しても条件を満たさなかった（最後の絵は出力する） |

## 既定のモデルと effort

既定は Claude Opus 5.5 の effort low にしている。
2026-09-27 に、Haiku 4.5、Sonnet 5、Opus 5、Opus 5.5 を effort（Haiku は thinking の予算）ごとに 5 テーマで比べ、モデル名を伏せた画像を 2 つのモデルが採点した。

| モデルと条件 | 平均点（5 点満点） | 1 枚の時間 | 1 枚の費用（定価換算） |
| --- | --- | --- | --- |
| Opus 5.5 low | 4.0 | 6 秒 | $0.011 |
| Opus 5.5 xhigh | 4.05 | 94 秒 | $0.19 |
| Sonnet 5 low | 3.65 | 5 秒 | $0.006 |
| Sonnet 5 high | 4.05 | 29 秒 | $0.025 |
| Opus 5 xhigh | 4.0 | 42 秒 | $0.083 |
| Haiku 4.5（全条件） | 2.1〜2.7 | 2〜43 秒 | $0.001〜0.024 |

Opus 5.5 は effort を上げても点が伸びず、時間と費用だけが増えた。
費用を最も抑えたいときは `-m claude-sonnet-5` が候補になる。
ただし Sonnet 5 low の点は、採点者によって 3.1 と 4.2 に割れた。

## 仕組み

- `claude -p` は、ツール、設定ファイル、MCP を読み込まない形で呼ぶ。利用者ごとの CLAUDE.md がプロンプトに入ると、比較で測った出来から外れるため
- テーマは引数ではなく標準入力で `claude` に渡す。ハイフンで始まるテーマが `claude` のオプションとして読まれないようにするため
- 返答のコードブロックから絵を取り出し、幅、高さ、文字の種類（印字できる ASCII だけか）を検査する
- 違反があれば、違反の内容と前回の絵を添えて描き直させる
- `CLAUDE_CODE_EFFORT_LEVEL` と `CLAUDE_EFFORT` を外して `claude` を起動する。Claude Code のセッション内から実行すると、親の effort がこの環境変数で引き継がれ、`--effort` より優先されるため

## 開発

```sh
bun run check   # 型検査、lint（Biome）、テスト
```

| ディレクトリ | 役割 |
| --- | --- |
| `src/contract/` | モジュール間で受け渡す型と既定値。実装はこの型を満たす限り作り直してよい |
| `src/core/` | 絵の取り出しと検査、プロンプト、描き直しの流れ。副作用を持たない |
| `src/backends/` | `claude -p` の呼び出し。API 版を足すときは、同じ `Backend` の型で実装する |
| `src/cli/` | 引数の解釈、出力、終了コード |

エラーは throw せず、neverthrow の `Result` で返す。
`test/cli.test.ts` は、PATH の先頭に偽の `claude` を置き、モデルを呼ばずに CLI 全体を動かす。
