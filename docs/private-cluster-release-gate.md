# Private-cluster release gate

## Migration state

The existing release entry point and its pinned automatic publisher remain
unchanged. The pipeline and companion hooks are local migration work, not an
operational release gate. Keep the current publisher until the complete gated
replacement is ready, then switch the caller in one coordinated update. Do not
deploy an intermediate preparation-only workflow.

The companion adds optional preparation outputs and a new gated publisher for
stable `vX.Y.Z` releases. Existing callers keep their current publication, tag,
and prerelease behavior unless they explicitly adopt the new flow. The stricter
commit/check validation and guarded tag replacement belong to that opt-in path.

The 1ES test definition keeps `trigger: none` and `pr: none`. The bridge must load
an approved pipeline-definition revision, not the candidate's pipeline YAML.
That definition checks out the candidate separately from the canonical
`Azure/k8s-deploy` repository. It validates the release ref, full candidate SHA,
checked-out commit, and package version before Azure-authenticated tasks. These
are consistency checks, not authorization to execute arbitrary GitHub code with
the service connection. The test verifies that `lib/index.js` is committed and
unchanged, then executes that prepared bundle without rebuilding it.

## Definition and candidate revisions

The pipeline uses two independent revisions:

| Revision                         | Purpose                                                                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approved definition revision     | Supplies the pipeline YAML and its checkout/cleanup scripts through `checkout: self`. Azure DevOps must enforce the approved source and queue permissions outside this YAML. |
| Built release-candidate revision | Supplies the action bundle and integration fixtures in a separate temporary directory. Its pipeline YAML and cleanup script are not used.                                    |

`Build.SourceBranch` and `Build.SourceVersion` identify the definition revision,
not the candidate. Pass `releaseCandidateBranch`, such as `releases/v7.0.2`, and
the full `releaseCandidateCommit` separately. The candidate checkout must match
both inputs. Action execution, bundle verification, and test fixtures use that
checkout; cleanup stays in the trusted definition checkout. `GITHUB_SHA`,
`GITHUB_REF`, and `GITHUB_WORKSPACE` describe the candidate being tested.

For example, the trusted bridge's
[Run Pipeline request](https://learn.microsoft.com/en-us/rest/api/azure/devops/pipelines/runs/run-pipeline?view=azure-devops-rest-7.1)
must select the reviewed definition revision independently:

```json
{
   "resources": {
      "repositories": {
         "self": {
            "refName": "refs/heads/main",
            "version": "<reviewed-definition-sha>"
         }
      }
   },
   "templateParameters": {
      "releaseCandidateBranch": "releases/v7.0.2",
      "releaseCandidateCommit": "<built-candidate-sha>"
   }
}
```

This is a request-shape example, not an installed bridge or authorization policy.
The approved definition must include the pipeline and both scripts under
`.azure-pipelines/scripts/`. Do not select the release branch as `self`.

## Required activation flow

```text
Approved release change
        |
Prepare built release commit
        |
Trusted bridge queues a reviewed definition with that candidate
        |
Private-cluster test and cleanup
        |
Bridge reports its result to GitHub for the same SHA
        |
Gated publisher checks App, result, SHA, and refs
        |
Publish version and major tags at the tested SHA
```

1. Review and publish the companion changes to `Azure/action-release-workflows`.
   Pin the reviewed commit, not a mutable branch, when enabling the caller.
2. Prepare the coordinated caller update using `release_js_project.yaml` with
   `prepareOnly: true`. Consume its `commit` output, which identifies the final
   build commit rather than the original commit on `main`. Do not activate this
   preparation step without the automatic test trigger and gated publisher.
3. Assign an owner to the trusted bridge. It must verify the approved preparation
   run and source revision, select a governed definition revision, and pass the
   preparation outputs as `releaseCandidateBranch` and `releaseCandidateCommit`.
   The definition revision and the candidate SHA need not be the same commit.
4. Configure the bridge's GitHub App to report a check named
   `1ES private-cluster release gate` on that commit. Restrict its repository
   access and permissions to the intended integration. Configure the trusted
   numeric App ID outside candidate-controlled code.
5. Connect preparation, automatic bridge notification, and a caller of
   `publish_js_project.yaml` in the same cutover. Pass the returned branch,
   commit, version, and release notes, plus the check name and App ID. Grant the
   publishing job `contents: write` and `checks: read`. Missing App configuration,
   failed/cancelled tests, missing results, and changed refs must prevent
   publication. The shared README contains the repository-hook example; the
   approved bridge supplies the automatic test-trigger integration.
6. Confirm Azure DevOps UI CI/PR overrides are disabled and the privileged
   pipeline is not attached to PR validation. Restrict queue permissions and
   enforce the trusted definition/service-connection checks outside this YAML.
   Authorize the service connection only for the approved pipeline, not all
   pipelines. Confirm the pool, images, and 1ES template are authorized.
7. Have the Azure owners verify the pre-created shared resource group and the
   least-privilege role/identity assignments needed by the service connection.
   Do not grant subscription-wide Contributor or Owner simply to bypass a
   provisioning failure.
8. Run an approved candidate end to end. Demonstrate that wrong-commit,
   failed-test, cancelled-test, missing-result, and moved-ref cases cannot
   publish. Confirm the temporary cluster is deleted and the shared resource
   group remains. Only then replace the existing publisher with the complete
   automatic flow.

Bridge ownership, Azure DevOps configuration, the trusted reporting App, and a
live gated run are still pending. No bridge or privileged trigger is installed
by this repository change. The intended result is automatic preparation, a
successful private-cluster test, and automatic publication of that same commit,
without a temporary shutdown of publishing.

## Cleanup

The cleanup task lists the named cluster within the shared resource group. Only
a successful empty result means there is nothing to delete. Lookup and deletion
errors remain failures, so authorization or network problems cannot be reported
as successful cleanup. It deletes only the per-build cluster, never the resource
group. The existing candidate-validation condition still applies.

Run the checkout, bundle, and cleanup tests without network access, Azure
credentials, or cluster operations:

```bash
python3 -B -m unittest discover -s .azure-pipelines/tests -v
```
