"""プロンプトの一元管理。

`orchestrator/prompts/<name>.md` を読み、`{{var}}` を値で置換して返す。
プレースホルダは `{{var}}` のみ。JSON の例などに現れる素の `{ }` はそのまま残る
（従来の str.format 方式で必要だった `{{ }}` エスケープが不要になる）。

    from orchestrator import prompts
    text = prompts.render("adversary", task=task, diff=diff)
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

_PROMPT_DIR = Path(__file__).parent
_PLACEHOLDER = re.compile(r"\{\{(\w+)\}\}")


@lru_cache(maxsize=None)
def load(name: str) -> str:
    """`prompts/<name>.md` の生テキストを返す（キャッシュ）。無ければ FileNotFoundError。"""
    return (_PROMPT_DIR / f"{name}.md").read_text(encoding="utf-8")


def render(name: str, /, **values: object) -> str:
    """`{{var}}` を `values` で置換した文字列を返す。

    - `.md` に現れる `{{var}}` は `values` に必ず含めること（欠けていれば KeyError）。
    - 単一の `{ }`（JSON 例など）はそのまま残す。
    """
    text = load(name)

    def _sub(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in values:
            raise KeyError(
                f"prompt '{name}': プレースホルダ {{{{{key}}}}} に対する値がありません"
            )
        return str(values[key])

    return _PLACEHOLDER.sub(_sub, text)
