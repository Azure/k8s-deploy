import * as os from "os";
import * as core from "@actions/core";
import { Kubectl } from "../types/kubectl";
import { GitHubClient, OkStatusCode } from "../githubClient";
import { DockerExec } from "../types/docker";
import * as io from "@actions/io";
import { DeploymentConfig } from "../types/deploymentConfig";
import { ExecOutput } from "@actions/exec";

export function getExecutableExtension(): string {
  if (os.type().match(/^Win/)) {
    return ".exe";
  }

  return "";
}

export function checkForErrors(
  execResults: ExecOutput[],
  warnIfError?: boolean
) {
  if (execResults.length !== 0) {
    let stderr = "";
    execResults.forEach((result) => {
      if (result?.stderr) {
        if (result?.exitCode !== 0) {
          stderr += result.stderr + "\n";
        } else {
          core.warning(result.stderr);
        }
      }
    });

    if (stderr.length > 0) {
      if (warnIfError) {
        core.warning(stderr.trim());
      } else {
        throw new Error(stderr.trim());
      }
    }
  }
}

export async function getLastSuccessfulRunSha(
  kubectl: Kubectl,
  namespaceName: string,
  annotationKey: string
): Promise<string> {
  try {
    const result = await kubectl.getResource("namespace", namespaceName);
    if (result?.stderr) {
      core.warning(result.stderr);
      return process.env.GITHUB_SHA;
    } else if (result?.stdout) {
      const annotationsSet = JSON.parse(result.stdout).metadata.annotations;
      if (annotationsSet && annotationsSet[annotationKey]) {
        return JSON.parse(annotationsSet[annotationKey].replace(/'/g, '"'))
          .commit;
      } else {
        return "NA";
      }
    }
  } catch (ex) {
    core.warning(`Failed to get commits from cluster. ${JSON.stringify(ex)}`);
    return "";
  }
}

export async function getWorkflowFilePath(
  githubToken: string
): Promise<string> {
  let workflowFilePath = process.env.GITHUB_WORKFLOW;
  if (!workflowFilePath.startsWith(".github/workflows/")) {
    const githubClient = new GitHubClient(
      process.env.GITHUB_REPOSITORY,
      githubToken
    );
    const response = await githubClient.getWorkflows();
    if (response) {
      if (response.status === OkStatusCode && response.data.total_count) {
        if (response.data.total_count > 0) {
          for (const workflow of response.data.workflows) {
            if (process.env.GITHUB_WORKFLOW === workflow.name) {
              workflowFilePath = workflow.path;
              break;
            }
          }
        }
      } else if (response.status != OkStatusCode) {
        core.error(
          `An error occured while getting list of workflows on the repo. Status code: ${response.status}`
        );
      }
    } else {
      core.error(`Failed to get response from workflow list API`);
    }
  }
  return Promise.resolve(workflowFilePath);
}

export async function annotateChildPods(
  kubectl: Kubectl,
  resourceType: string,
  resourceName: string,
  annotationKeyValStr: string,
  allPods
): Promise<ExecOutput[]> {
  let owner = resourceName;
  if (resourceType.toLowerCase().indexOf("deployment") > -1) {
    owner = await kubectl.getNewReplicaSet(resourceName);
  }

  const commandExecutionResults = [];
  if (allPods?.items && allPods.items?.length > 0) {
    allPods.items.forEach((pod) => {
      const owners = pod?.metadata?.ownerReferences;
      if (owners) {
        for (const ownerRef of owners) {
          if (ownerRef.name === owner) {
            commandExecutionResults.push(
              kubectl.annotate("pod", pod.metadata.name, annotationKeyValStr)
            );
            break;
          }
        }
      }
    });
  }

  return await Promise.all(commandExecutionResults);
}

export async function getDeploymentConfig(): Promise<DeploymentConfig> {
  let helmChartPaths: string[] =
    process.env?.HELM_CHART_PATHS?.split(";").filter((path) => path != "") ||
    [];
  helmChartPaths = helmChartPaths.map((helmchart) =>
    getNormalizedPath(helmchart.trim())
  );

  let inputManifestFiles: string[] =
    core
      .getInput("manifests")
      .split(/[\n,;]+/)
      .filter((manifest) => manifest.trim().length > 0) || [];
  if (helmChartPaths?.length == 0) {
    inputManifestFiles = inputManifestFiles.map((manifestFile) =>
      getNormalizedPath(manifestFile)
    );
  }

  const imageNames = core.getInput("images").split("\n") || [];
  const imageDockerfilePathMap: { [id: string]: string } = {};

  //Fetching from image label if available
  for (const image of imageNames) {
    try {
      imageDockerfilePathMap[image] = await getDockerfilePath(image);
    } catch (ex) {
      core.warning(
        `Failed to get dockerfile path for image ${image.toString()}: ${ex} `
      );
    }
  }

  return Promise.resolve(<DeploymentConfig>{
    manifestFilePaths: inputManifestFiles,
    helmChartFilePaths: helmChartPaths,
    dockerfilePaths: imageDockerfilePathMap,
  });
}

export function normaliseWorkflowStrLabel(workflowName: string): string {
  const workflowsPath = ".github/workflows/";
  workflowName = workflowName.startsWith(workflowsPath)
    ? workflowName.replace(workflowsPath, "")
    : workflowName;
  return workflowName.replace(/ /g, "_");
}

export function sleep(timeout: number) {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

export function getRandomInt(max: number) {
  return Math.floor(Math.random() * Math.floor(max));
}

export function getCurrentTime(): number {
  return new Date().getTime();
}

async function checkDockerPath() {
  const dockerPath = await io.which("docker", false);
  if (!dockerPath) {
    throw new Error("Docker is not installed.");
  }
}

async function getDockerfilePath(image: any): Promise<string> {
  await checkDockerPath();
  const dockerExec: DockerExec = new DockerExec("docker");
  dockerExec.pull(image, [], true);

  const imageInspectResult: string = await dockerExec.inspect(image, [], true);
  const imageConfig = JSON.parse(imageInspectResult)[0];
  const DOCKERFILE_PATH_LABEL_KEY = "dockerfile-path";

  let pathValue: string = "";
  if (
    imageConfig?.Config &&
    imageConfig.Config?.Labels &&
    imageConfig.Config.Labels[DOCKERFILE_PATH_LABEL_KEY]
  ) {
    const pathLabel = imageConfig.Config.Labels[DOCKERFILE_PATH_LABEL_KEY];
    pathValue = getNormalizedPath(pathLabel);
  }
  return Promise.resolve(pathValue);
}

export function isHttpUrl(url: string) {
  return /^https?:\/\/.*$/.test(url);
}

export function getNormalizedPath(pathValue: string) {
  if (!isHttpUrl(pathValue)) {
    //if it is not an http url then convert to link from current repo and commit
    return `https://github.com/${process.env.GITHUB_REPOSITORY}/blob/${process.env.GITHUB_SHA}/${pathValue}`;
  }
  return pathValue;
}
