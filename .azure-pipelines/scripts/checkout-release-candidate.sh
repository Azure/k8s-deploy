#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_CANDIDATE_BRANCH:?releaseCandidateBranch must be set}"
: "${RELEASE_CANDIDATE_COMMIT:?releaseCandidateCommit must be set}"
: "${AGENT_TEMPDIRECTORY:?AGENT_TEMPDIRECTORY must be set}"

if [[ ! "$RELEASE_CANDIDATE_BRANCH" =~ ^releases/v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
   echo "##vso[task.logissue type=error]releaseCandidateBranch must match releases/vX.Y.Z"
   exit 1
fi

if [[ ! "$RELEASE_CANDIDATE_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
   echo "##vso[task.logissue type=error]releaseCandidateCommit must be a full lowercase commit SHA"
   exit 1
fi

# Keep candidate files separate from the trusted pipeline definition and scripts.
candidate_directory=$(mktemp -d "$AGENT_TEMPDIRECTORY/k8s-deploy-candidate.XXXXXX")
git -C "$candidate_directory" init --quiet
git -C "$candidate_directory" remote add origin https://github.com/Azure/k8s-deploy.git
git -C "$candidate_directory" fetch --no-tags --depth=1 origin "refs/heads/$RELEASE_CANDIDATE_BRANCH"

fetched_commit=$(git -C "$candidate_directory" rev-parse FETCH_HEAD)
if [[ "$fetched_commit" != "$RELEASE_CANDIDATE_COMMIT" ]]; then
   echo "##vso[task.logissue type=error]Release branch no longer matches the requested candidate commit"
   exit 1
fi

git -C "$candidate_directory" checkout --detach --quiet "$RELEASE_CANDIDATE_COMMIT"
checked_out_commit=$(git -C "$candidate_directory" rev-parse HEAD)
if [[ "$checked_out_commit" != "$RELEASE_CANDIDATE_COMMIT" ]]; then
   echo "##vso[task.logissue type=error]Checked-out commit does not match the requested candidate commit"
   exit 1
fi

expected_version="${RELEASE_CANDIDATE_BRANCH#releases/v}"
actual_version=$(node -p "require(process.argv[1]).version" "$candidate_directory/package.json")
if [[ "$actual_version" != "$expected_version" ]]; then
   echo "##vso[task.logissue type=error]Release branch version does not match package.json"
   exit 1
fi

echo "##vso[task.setvariable variable=releaseCandidateDirectory]$candidate_directory"
echo "##vso[task.setvariable variable=releaseCandidateValidated]true"
