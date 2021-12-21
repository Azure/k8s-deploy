import * as core from "@actions/core";
import * as io from "@actions/io";
import * as path from "path";
import * as toolCache from "@actions/tool-cache";

import {
  downloadKubectl,
  getStableKubectlVersion,
} from "./utilities/kubectl-util";
import { getExecutableExtension, isEqual } from "./utilities/utility";

import { Kubectl } from "./kubectl-object-model";
import { deploy } from "./deploy/deploy";
import { promote } from "./actions/promote";
import { reject } from "./actions/reject";
import { Action, parseAction } from "./types/action";
import { parseDeploymentStrategy } from "./types/deploymentStrategy";

let kubectlPath = "";

export async function run() {
  if (!process.env["KUBECONFIG"]) {
    core.warning(
      "KUBECONFIG env is not explicitly set. Ensure cluster context is set by using k8s-set-context action."
    );

    await setKubectlPath(); // todo: remove

    const action: Action | undefined = parseAction(
      core.getInput("action", { required: true })
    );

    switch (action) {
      case Action.DEPLOY: {
        // get inputs
        const strategy = parseDeploymentStrategy(core.getInput("strategy"));
        const manifestsInput = core.getInput("manifests", { required: true });
        const manifestFilePaths = manifestsInput
          .split(/[\n,;]+/) // split into each individual manifest
          .map((manifest) => manifest.trim()) // remove surrounding whitespace
          .filter((manifest) => manifest.length > 0); // remove any blanks
        const namespace = core.getInput("namespace") || "default";

        await deploy(manifestFilePaths, strategy);
        break;
      }
      case Action.PROMOTE: {
        await promote();
        break;
      }
      case Action.REJECT: {
        await reject();
        break;
      }
      default: {
        throw Error(
          'Not a valid action. The allowed actions are "deploy", "promote", and "reject".'
        );
      }
    }
  }

  async function setKubectlPath() {
    if (core.getInput("kubectl-version")) {
      const version = core.getInput("kubectl-version");
      kubectlPath = toolCache.find("kubectl", version);
      if (!kubectlPath) {
        kubectlPath = await installKubectl(version);
      }
    } else {
      kubectlPath = await io.which("kubectl", false);
      if (!kubectlPath) {
        const allVersions = toolCache.findAllVersions("kubectl");
        kubectlPath =
          allVersions.length > 0
            ? toolCache.find("kubectl", allVersions[0])
            : "";
        if (!kubectlPath) {
          throw new Error(
            'Kubectl is not installed, either add install-kubectl action or provide "kubectl-version" input to download kubectl'
          );
        }
        kubectlPath = path.join(
          kubectlPath,
          `kubectl${getExecutableExtension()}`
        );
      }
    }
  }

  async function installKubectl(version: string) {
    if (isEqual(version, "latest")) {
      version = await getStableKubectlVersion();
    }
    return await downloadKubectl(version);
  }
}

run().catch(core.setFailed);
