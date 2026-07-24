import json

from orchestrator.github_ops import GitHubOps
from orchestrator.shell import CommandResult, FakeRunner


def ops(results):
    runner = FakeRunner(results)
    return GitHubOps(cwd="/repo", runner=runner), runner


class TestListReadyIssues:
    def test_parses_issue_list(self):
        payload = json.dumps(
            [
                {"number": 7, "title": "add chart", "labels": [{"name": "loop:ready"}]},
                {"number": 9, "title": "fix flake", "labels": [{"name": "loop:ready"}]},
            ]
        )
        gh, _ = ops([CommandResult(0, payload, "")])
        issues = gh.list_ready_issues("loop:ready")
        assert [i.number for i in issues] == [7, 9]
        assert issues[0].labels == ["loop:ready"]

    def test_empty_list_returns_empty(self):
        gh, _ = ops([CommandResult(0, "[]", "")])
        assert gh.list_ready_issues("loop:ready") == []


class TestChangedFiles:
    def test_parses_name_only_diff(self):
        gh, _ = ops([CommandResult(0, "dashboard/a.ts\ndashboard/b.ts\n", "")])
        assert gh.changed_files("develop") == ["dashboard/a.ts", "dashboard/b.ts"]

    def test_ignores_blank_lines(self):
        gh, _ = ops([CommandResult(0, "a.ts\n\n\n", "")])
        assert gh.changed_files("develop") == ["a.ts"]


class TestChangedLines:
    def test_sums_added_and_deleted(self):
        gh, _ = ops([CommandResult(0, "10\t5\ta.ts\n3\t2\tb.ts\n", "")])
        assert gh.changed_lines("develop") == 20

    def test_treats_binary_dashes_as_zero(self):
        gh, _ = ops([CommandResult(0, "-\t-\timage.png\n4\t1\ta.ts\n", "")])
        assert gh.changed_lines("develop") == 5


class TestMutations:
    def test_open_pr_returns_number_from_url(self):
        gh, runner = ops([CommandResult(0, "https://github.com/o/r/pull/123\n", "")])
        assert gh.open_pr(title="t", body="b", base="develop", head="loop/1-x") == 123
        assert runner.calls[0][0][:3] == ["gh", "pr", "create"]

    def test_merge_pr_uses_squash_and_deletes_branch(self):
        gh, runner = ops([CommandResult(0, "", "")])
        gh.merge_pr(123)
        cmd = runner.calls[0][0]
        assert cmd[:3] == ["gh", "pr", "merge"]
        assert "--squash" in cmd
        assert "--delete-branch" in cmd

    def test_add_label(self):
        gh, runner = ops([CommandResult(0, "", "")])
        gh.add_label(123, "loop:needs-human")
        assert "loop:needs-human" in runner.calls[0][0]

    def test_remove_label(self):
        gh, runner = ops([CommandResult(0, "", "")])
        gh.remove_label(123, "loop:ready")
        cmd = runner.calls[0][0]
        assert cmd[:3] == ["gh", "issue", "edit"]
        assert "--remove-label" in cmd
        assert "loop:ready" in cmd

    def test_close_issue_with_comment(self):
        gh, runner = ops([CommandResult(0, "", "")])
        gh.close_issue(42, "自動見送り")
        cmd = runner.calls[0][0]
        assert cmd[:3] == ["gh", "issue", "close"]
        assert "42" in cmd
        assert "--comment" in cmd
        assert "自動見送り" in cmd

    def test_create_issue_returns_number(self):
        gh, _ = ops([CommandResult(0, "https://github.com/o/r/issues/45\n", "")])
        assert gh.create_issue(title="t", body="b", labels=["loop:ready"]) == 45

    def test_create_branch_is_idempotent(self):
        # 連続バッチ（1 ジョブで複数周）だと前周が作った loop/* ローカルブランチが残る。
        # `git checkout -b`（既存だと "already exists" で fatal）ではなく、冪等な `-B`
        # （無ければ作る／有れば base に作り直す）を使い、同名再作成でクラッシュしないこと。
        gh, runner = ops([CommandResult(0, "", "")])
        gh.create_branch("loop/46-model", "develop")
        cmd = runner.calls[0][0]
        assert cmd == ["git", "checkout", "-B", "loop/46-model", "develop"]


class TestCommitAll:
    def test_commits_when_there_are_changes(self):
        gh, runner = ops([
            CommandResult(0, "", ""),   # git add -A
            CommandResult(1, "", ""),   # git diff --cached --quiet -> returncode 1 = 差分あり
            CommandResult(0, "", ""),   # git commit
        ])
        assert gh.commit_all("実装した") is True
        assert runner.calls[0][0][:2] == ["git", "add"]
        assert runner.calls[-1][0][:2] == ["git", "commit"]
        assert "実装した" in runner.calls[-1][0]

    def test_returns_false_and_does_not_commit_when_no_changes(self):
        gh, runner = ops([
            CommandResult(0, "", ""),   # git add -A
            CommandResult(0, "", ""),   # git diff --cached --quiet -> returncode 0 = 差分なし
        ])
        assert gh.commit_all("なにもなし") is False
        assert all(call[0][:2] != ["git", "commit"] for call in runner.calls)
