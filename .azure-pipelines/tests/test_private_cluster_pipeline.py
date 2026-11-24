import json
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/cleanup-private-cluster.sh"
CHECKOUT_SCRIPT = SCRIPT.with_name("checkout-release-candidate.sh")


class CandidateCheckoutTests(unittest.TestCase):
    def run_checkout(
        self, branch="releases/v7.0.2", commit="2" * 40,
        fetched_commit="2" * 40, checked_out_commit="2" * 40,
        version="7.0.2", fetch_exit=0,
    ):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            log = root / "calls.jsonl"
            stub = root / "git"
            stub.write_text(
                "#!/usr/bin/env python3\n"
                "import json, os, sys\n"
                "args = sys.argv[3:]\n"
                "with open(os.environ['CHECKOUT_TEST_LOG'], 'a') as log:\n"
                "    log.write(json.dumps(['git', *args]) + '\\n')\n"
                "if args[0] == 'fetch':\n"
                "    sys.exit(int(os.environ['FETCH_EXIT']))\n"
                "if args == ['rev-parse', 'FETCH_HEAD']:\n"
                "    print(os.environ['FETCHED_COMMIT'])\n"
                "elif args == ['rev-parse', 'HEAD']:\n"
                "    print(os.environ['CHECKED_OUT_COMMIT'])\n"
                "elif args[0] not in ['init', 'remote', 'checkout']:\n"
                "    sys.exit(99)\n"
            )
            stub.chmod(0o755)
            node = root / "node"
            node.write_text(
                "#!/usr/bin/env python3\n"
                "import json, os\n"
                "with open(os.environ['CHECKOUT_TEST_LOG'], 'a') as log:\n"
                "    log.write(json.dumps(['node']) + '\\n')\n"
                "print(os.environ['CANDIDATE_VERSION'])\n"
            )
            node.chmod(0o755)
            result = subprocess.run(
                ["bash", str(CHECKOUT_SCRIPT)], cwd=root,
                env={
                    **os.environ,
                    "PATH": str(root) + os.pathsep + os.environ["PATH"],
                    "AGENT_TEMPDIRECTORY": str(root),
                    "BUILD_SOURCEBRANCH": "refs/heads/main",
                    "BUILD_SOURCEVERSION": "1" * 40,
                    "RELEASE_CANDIDATE_BRANCH": branch,
                    "RELEASE_CANDIDATE_COMMIT": commit,
                    "CHECKOUT_TEST_LOG": str(log),
                    "FETCHED_COMMIT": fetched_commit,
                    "CHECKED_OUT_COMMIT": checked_out_commit,
                    "CANDIDATE_VERSION": version,
                    "FETCH_EXIT": str(fetch_exit),
                },
                capture_output=True, text=True, timeout=10,
            )
            calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
            return result, calls

    def test_trusted_definition_can_test_a_different_release_commit(self):
        result, calls = self.run_checkout()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("variable=releaseCandidateDirectory]", result.stdout)
        self.assertIn("variable=releaseCandidateValidated]true", result.stdout)
        self.assertIn(
            ["git", "remote", "add", "origin", "https://github.com/Azure/k8s-deploy.git"],
            calls,
        )
        self.assertIn(
            ["git", "fetch", "--no-tags", "--depth=1", "origin", "refs/heads/releases/v7.0.2"],
            calls,
        )
        self.assertIn(["git", "checkout", "--detach", "--quiet", "2" * 40], calls)

    def test_invalid_candidate_is_rejected_before_fetch(self):
        for kwargs in [{"branch": ""}, {"branch": "refs/pull/549/merge"}, {"commit": "2222222"}]:
            with self.subTest(kwargs=kwargs):
                result, calls = self.run_checkout(**kwargs)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(calls, [])
                self.assertNotIn("variable=releaseCandidateValidated]true", result.stdout)

    def test_moved_branch_is_rejected_before_checkout(self):
        result, calls = self.run_checkout(fetched_commit="3" * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(call[:2] == ["git", "checkout"] for call in calls))
        self.assertNotIn(["node"], calls)
        self.assertNotIn("variable=releaseCandidateValidated]true", result.stdout)

    def test_checked_out_commit_must_match_candidate(self):
        result, calls = self.run_checkout(checked_out_commit="3" * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(["node"], calls)
        self.assertNotIn("variable=releaseCandidateValidated]true", result.stdout)

    def test_candidate_package_version_must_match_branch(self):
        result, _ = self.run_checkout(version="7.0.1")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("variable=releaseCandidateValidated]true", result.stdout)

    def test_fetch_failure_is_reported(self):
        result, calls = self.run_checkout(fetch_exit=1)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(["node"], calls)
        self.assertNotIn("variable=releaseCandidateValidated]true", result.stdout)


class CleanupTests(unittest.TestCase):
    def run_cleanup(self, listing="", lookup_exit=0, delete_exit=0):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stub = root / "az"
            log = root / "calls.jsonl"
            stub.write_text(
                "#!/usr/bin/env python3\n"
                "import json, os, sys\n"
                "with open(os.environ['AZ_TEST_LOG'], 'a') as log:\n"
                "    log.write(json.dumps(sys.argv[1:]) + '\\n')\n"
                "if sys.argv[1:3] == ['aks', 'list']:\n"
                "    print(os.environ['AZ_TEST_LISTING'])\n"
                "    if os.environ['AZ_TEST_LOOKUP_EXIT'] != '0':\n"
                "        print('AuthorizationFailed', file=sys.stderr)\n"
                "    sys.exit(int(os.environ['AZ_TEST_LOOKUP_EXIT']))\n"
                "if sys.argv[1:3] == ['aks', 'delete']:\n"
                "    sys.exit(int(os.environ['AZ_TEST_DELETE_EXIT']))\n"
                "sys.exit(99)\n"
            )
            stub.chmod(0o755)
            env = {
                **os.environ,
                "PATH": str(root) + os.pathsep + os.environ["PATH"],
                "RESOURCE_GROUP": "shared-integration-rg",
                "CLUSTER_NAME": "test-123",
                "AZ_TEST_LOG": str(log),
                "AZ_TEST_LISTING": listing,
                "AZ_TEST_LOOKUP_EXIT": str(lookup_exit),
                "AZ_TEST_DELETE_EXIT": str(delete_exit),
            }
            result = subprocess.run(
                ["bash", str(SCRIPT)], env=env, capture_output=True, text=True, timeout=10
            )
            return result, [json.loads(line) for line in log.read_text().splitlines()]

    def test_absent_cluster_is_not_deleted(self):
        result, calls = self.run_cleanup()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 1)
        self.assertIn("nothing to delete", result.stdout)

    def test_lookup_failure_is_not_treated_as_absence(self):
        result, calls = self.run_cleanup(lookup_exit=1)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("AuthorizationFailed", result.stderr)
        self.assertNotIn("nothing to delete", result.stdout)
        self.assertEqual(len(calls), 1)

    def test_only_the_per_build_cluster_is_deleted(self):
        result, calls = self.run_cleanup(listing="test-123")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            calls[1],
            [
                "aks", "delete", "--yes", "--resource-group", "shared-integration-rg",
                "--name", "test-123",
            ],
        )
        self.assertEqual(len(calls), 2)

    def test_deletion_failure_is_reported(self):
        result, _ = self.run_cleanup(listing="test-123", delete_exit=1)
        self.assertNotEqual(result.returncode, 0)


class PreparedBundleTests(unittest.TestCase):
    def verify_bundle(self, tracked=True, modified=False):
        pipeline = (SCRIPT.parents[1] / "1es-integration-tests-private.yml").read_text()
        script = pipeline.split("displayName: Verify prepared release bundle", 1)[0]
        script = textwrap.dedent(script.rsplit("- script: |\n", 1)[1])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "lib").mkdir()
            (root / "lib/index.js").write_text("fixture bundle\n")
            git = root / "git"
            git.write_text(
                "#!/bin/sh\n"
                "if [ \"$1\" = ls-files ]; then exit \"$TRACKED_EXIT\"; fi\n"
                "if [ \"$1\" = diff ]; then exit \"$MODIFIED_EXIT\"; fi\n"
                "exit 99\n"
            )
            git.chmod(0o755)
            return subprocess.run(
                ["bash", "-c", script], cwd=root,
                env={
                    **os.environ,
                    "PATH": str(root) + os.pathsep + os.environ["PATH"],
                    "TRACKED_EXIT": "0" if tracked else "1",
                    "MODIFIED_EXIT": "1" if modified else "0",
                },
                capture_output=True, text=True, timeout=10,
            )

    def test_committed_unchanged_bundle_is_accepted(self):
        result = self.verify_bundle()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_untracked_or_modified_bundle_is_rejected(self):
        for kwargs in [{"tracked": False}, {"modified": True}]:
            with self.subTest(kwargs=kwargs):
                self.assertNotEqual(self.verify_bundle(**kwargs).returncode, 0)


if __name__ == "__main__":
    unittest.main()
