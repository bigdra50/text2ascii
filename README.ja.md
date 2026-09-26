# text2ascii

[English](README.md) | 日本語

テーマの文章を ASCII アートにする CLI。
何を描くかは Claude が考える。
文字や画像の形をそのまま写すツールとは違う。
モデルがテーマの雰囲気や比喩を読み取り、絵に起こす。

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

text2ascii は `claude -p` で Claude を呼ぶので、専用の API キーが要らない。
費用は `claude` がログインしているアカウントに計上される。
サブスクリプションなら、text2ascii で使った分もプランの利用量として数えられる。

## インストール

```sh
git clone https://github.com/bigdra50/text2ascii
cd text2ascii
bun install
bun run build                      # dist/text2ascii を作る
cp dist/text2ascii ~/.local/bin/   # PATH の通った場所に置く
```

ビルドしなくても、`bun src/cli/main.ts <テーマ>` で動かせる。

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
| `--retries <n>` | `1` | 大きさや文字の規則に違反したとき、描き直させる回数 |
| `--json` | なし | 絵と試行ごとの使用量を JSON で出力する |
| `-v, --verbose` | なし | 試行ごとのモデル、秒数、定価換算の費用を標準エラーに出す |
| `-h, --help` | | 使い方を表示する |
| `--version` | | 版を表示する |

| 終了コード | 意味 |
| --- | --- |
| 0 | 条件を満たす絵を出力した |
| 1 | Claude の呼び出しに失敗した |
| 2 | 引数が正しくない |
| 3 | 最後の絵が大きさや文字の規則を満たさなかった（その絵も出力する） |

## 既定のモデルと effort

既定は Claude Opus 5.5 の effort low にしている。
2026-09-27 に、Haiku 4.5、Sonnet 5、Opus 5、Opus 5.5 を 5 つのテーマで比べた。
effort の段階ごとに描かせ、Haiku 4.5 だけは thinking の予算で段階を作った。
採点は Opus 5.5 と Sonnet 5 の 2 モデルが、モデル名を伏せた画像で行った。

| モデルと条件 | 平均点（5 点満点） | 1 枚の時間 | 1 枚の費用（定価換算） |
| --- | --- | --- | --- |
| Opus 5.5 low | 4.0 | 6 秒 | $0.011 |
| Opus 5.5 xhigh | 4.05 | 94 秒 | $0.19 |
| Sonnet 5 low | 3.65 | 5 秒 | $0.006 |
| Sonnet 5 high | 4.05 | 29 秒 | $0.025 |
| Opus 5 xhigh | 4.0 | 42 秒 | $0.083 |
| Haiku 4.5（全条件） | 2.1〜2.7 | 2〜43 秒 | $0.001〜0.024 |

Opus 5.5 の effort を上げても点数は伸びず、時間と費用が増えただけだった。
費用を最も抑えたいときは `-m claude-sonnet-5` が候補になる。
ただし Sonnet 5 low の点数は、採点者ごとに 3.1 と 4.2 で割れた。

## 仕組み

- `claude -p` は、ツール、設定ファイル、MCP を読み込まない形で呼ぶ。利用者ごとの CLAUDE.md がプロンプトに入ると、比較で測った出来から外れるため
- `claude` へのテーマの受け渡しには、引数でなく標準入力を使う。ハイフンで始まるテーマが `claude` のオプションとして読まれるのを防ぐため
- 返答のコードブロックから取り出した絵について、幅、高さ、文字の種類（印字できる ASCII だけか）を検査する
- 違反があれば、違反の内容と前回の絵を添えて描き直させる
- `claude` は、`CLAUDE_CODE_EFFORT_LEVEL` と `CLAUDE_EFFORT` を外した環境で起動する。Claude Code のセッション内から実行すると、親の effort がこれらの変数で引き継がれ、`--effort` より優先されるため

## ライセンス

[MIT](LICENSE)
