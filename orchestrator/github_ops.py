"""gh / git CLI のラッパ。すべて runner 経由なのでテストで差し替えられる。"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from orchestrator.models import Issue
from orchestrator.shell import CommandResult, Runner, real_runner

_TRAILING_NUMBER = re.compile(r"/(\d+)\s*$")


class GitHubError(RuntimeError):
    """gh / git コマンドが失敗した。"""


@dataclass
class GitHubOps:
    cwd: str
    runner: Runner = real_runner

    def _run(self, cmd: list[str]) -> CommandResult:
        result = self.runner(cmd, cwd=self.cwd)
        if not result.ok:
            raise GitHubError(f"{' '.join(cmd)} failed: {result.stderr.strip()}")
        return result

    # --- 読み取り ---

    def list_ready_issues(self, label: str) -> list[Issue]:
        result = self._run(
            [
                "gh", "issue", "list",
                "--label", label,
                "--state", "open",
                "--json", "number,title,labels",
                "--limit", "50",
            ]
        )
        return [
            Issue(
                number=item["number"],
                title=item["title"],
                labels=[lb["name"] for lb in item.get("labels", [])],
            )
            for item in json.loads(result.stdout or "[]")
        ]

    def changed_files(self, base: str) -> list[str]:
        result = self._run(["git", "diff", "--name-only", f"{base}...HEAD"])
        return [line for line in result.stdout.splitlines() if line.strip()]

    def changed_lines(self, base: str) -> int:
        result = self._run(["git", "diff", "--numstat", f"{base}...HEAD"])
        total = 0
        for line in result.stdout.splitlines():
            parts = line.split("\t")
            if len(parts) < 3:
                continue
            added, deleted = parts[0], parts[1]
            total += (0 if added == "-" else int(added))
            total += (0 if deleted == "-" else int(deleted))
        return total

    def diff(self, base: str, max_chars: int = 60_000) -> str:
        result = self._run(["git", "diff", f"{base}...HEAD"])
        return result.stdout[:max_chars]

    # --- 変更 ---

    def create_branch(self, name: str, base: str) -> None:
        self._run(["git", "checkout", "-b", name, base])

    def commit_all(self, message: str) -> bool:
        """builder が作業ツリーに加えた全変更を1コミットにする。

        変更が無ければコミットせず False を返す（builder が何も生成しなかった場合、
        空の PR を作ってしまうのを防ぐ）。gate は commit 済みの diff を見るため、
        ここで commit しないと changed_lines が常に 0・保護パス検出も空になり判定が形骸化する。
        """
        self._run(["git", "add", "-A"])
        staged = self.runner(["git", "diff", "--cached", "--quiet"], cwd=self.cwd)
        if staged.ok:  # returncode 0 = ステージに差分なし
            return False
        self._run(["git", "commit", "-m", message])
        return True

    def push_branch(self, name: str) -> None:
        self._run(["git", "push", "-u", "origin", name])

    def open_pr(self, *, title: str, body: str, base: str, head: str) -> int:
        result = self._run(
            ["gh", "pr", "create", "--title", title, "--body", body,
             "--base", base, "--head", head]
        )
        return _number_from_url(result.stdout)

    def comment_pr(self, number: int, body: str) -> None:
        self._run(["gh", "pr", "comment", str(number), "--body", body])

    def merge_pr(self, number: int) -> None:
        self._run(["gh", "pr", "merge", str(number), "--squash", "--delete-branch"])

    def add_label(self, number: int, label: str) -> None:
        self._run(["gh", "issue", "edit", str(number), "--add-label", label])

    def remove_label(self, number: int, label: str) -> None:
        self._run(["gh", "issue", "edit", str(number), "--remove-label", label])

    def create_issue(self, *, title: str, body: str, labels: list[str]) -> int:
        cmd = ["gh", "issue", "create", "--title", title, "--body", body]
        for label in labels:
            cmd += ["--label", label]
        return _number_from_url(self._run(cmd).stdout)


def _number_from_url(stdout: str) -> int:
    match = _TRAILING_NUMBER.search(stdout.strip())
    if not match:
        raise GitHubError(f"URL から番号を取り出せない: {stdout!r}")
    return int(match.group(1))
