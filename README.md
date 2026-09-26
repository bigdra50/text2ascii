# text2ascii

English | [日本語](README.ja.md)

A CLI that turns a theme into ASCII art.
Claude decides what to draw.
Unlike tools that copy the shapes of text or images, the model reads the mood and metaphors of the theme and draws a picture from them.

```console
$ text2ascii "Monday morning blues"
      _  _  _                          ___________
     ( `( `( `)  rain...              |  MONDAY   |
    (_.(_.(_._)                       |    07:00  |
     / / / / /                        |  RING!!!  |
    / / / / /                         |___________|
                                         \  |  /
       .-------.
      /  -   -  \      "...five more minutes..."
     |   o   o   |
     |     ~     |        ___
      \  .---.  /        |   |~~
       '-------'         |cof|   (empty)
      ___|___|___        |___|
     /  zzz      \
    /  _________  \      TO DO: 47 emails
   |__|_________|__|            3 meetings
   ~~~~~~~~~~~~~~~~~~~~~~~~     1 sad soul
      ...week begins again...
```

## Requirements

- Bun 1.3 or later
- Claude Code's `claude` command, set up so that `claude -p` works

text2ascii calls Claude through `claude -p`, so it needs no API key of its own.
Usage is billed to the account `claude` is signed in with.
On a Claude subscription, it counts toward your plan's usage limits.

## Install

```sh
git clone https://github.com/bigdra50/text2ascii
cd text2ascii
bun install
bun run build                      # builds dist/text2ascii
cp dist/text2ascii ~/.local/bin/   # put it somewhere on your PATH
```

You can also run it without building: `bun src/cli/main.ts <theme>`.

## Usage

```sh
text2ascii "the night before a deadline"
echo "an engineer writing code with a cup of coffee" | text2ascii
text2ascii -e high --width 80 --height 24 "a rocket launching into space"
text2ascii -v "a cat sleeping under a crescent moon"  # print seconds and list-price cost per attempt to stderr
text2ascii "月曜日の朝の憂鬱"                         # themes can be in any language
text2ascii -- "--help, shouted by a robot"           # put a theme that starts with a hyphen after --
```

| Option | Default | Description |
| --- | --- | --- |
| `-m, --model <id>` | `claude-opus-5-5` | Model to use |
| `-e, --effort <level>` | `low` | `low`, `medium`, `high`, `xhigh`, or `max` |
| `--width <n>` | `60` | Maximum width of the art, in columns |
| `--height <n>` | `20` | Maximum height of the art, in lines |
| `--retries <n>` | `1` | How many redraws to ask for when the art breaks the size or character rules |
| `--json` | off | Print the art and per-attempt usage as JSON |
| `-v, --verbose` | off | Print the model, seconds, and list-price cost of each attempt to stderr |
| `-h, --help` | | Show usage |
| `--version` | | Show the version |

| Exit code | Meaning |
| --- | --- |
| 0 | Printed art that meets the rules |
| 1 | Calling Claude failed |
| 2 | Invalid arguments |
| 3 | The final art breaks the size or character rules (it is printed anyway) |

## Default model and effort

The default is Claude Opus 5.5 at effort `low`.
On 2026-09-27, Haiku 4.5, Sonnet 5, Opus 5, and Opus 5.5 were compared on five themes.
Each model drew at every effort level; for Haiku 4.5, thinking budgets took the place of effort levels.
Two judge models, Opus 5.5 and Sonnet 5, scored images of the art with the model names hidden.

| Model and setting | Mean score (out of 5) | Time per art | Cost per art (list price) |
| --- | --- | --- | --- |
| Opus 5.5 low | 4.0 | 6 s | $0.011 |
| Opus 5.5 xhigh | 4.05 | 94 s | $0.19 |
| Sonnet 5 low | 3.65 | 5 s | $0.006 |
| Sonnet 5 high | 4.05 | 29 s | $0.025 |
| Opus 5 xhigh | 4.0 | 42 s | $0.083 |
| Haiku 4.5 (all settings) | 2.1-2.7 | 2-43 s | $0.001-0.024 |

Raising the effort of Opus 5.5 did not raise its score; it only added time and cost.
If cost matters most, try `-m claude-sonnet-5`.
The two judges disagreed on Sonnet 5 low, though, giving it 3.1 and 4.2.

## How it works

- `claude -p` runs without tools, settings files, or MCP servers. A user's own CLAUDE.md in the prompt would pull the results away from what the comparison measured
- The theme reaches `claude` on stdin, not as an argument, so a theme that starts with a hyphen is never parsed as a `claude` option
- The art is taken from the code block in the reply and checked for width, height, and characters (printable ASCII only)
- If a check fails, the model is asked to redraw, with the violations and its previous art attached
- `claude` starts with `CLAUDE_CODE_EFFORT_LEVEL` and `CLAUDE_EFFORT` removed from its environment. Inside a Claude Code session, these variables carry the parent's effort, which would override `--effort`

## License

[MIT](LICENSE)
