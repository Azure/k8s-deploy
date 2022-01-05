import * as core from "@actions/core";
import * as io from "@actions/io";
import * as toolCache from "@actions/tool-cache";
import { Kubectl } from "./types/kubectl";
import { deploy } from "./deploy/deploy";
import { promote } from "./actions/promote";
import { reject } from "./actions/reject";
import { Action, parseAction } from "./types/action";
import { parseDeploymentStrategy } from "./types/deploymentStrategy";

export async function run() {
  if (!process.env["KUBECONFIG"]) {
    core.warning(
      "KUBECONFIG env is not explicitly set. Ensure cluster context is set by using k8s-set-context action."
    );

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
        const kubectlPath = await getKubectlPath();
        const namespace = core.getInput("namespace") || "default";
        const kubectl = new Kubectl(kubectlPath, namespace);

        await deploy(manifestFilePaths, strategy, kubectl);
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

  async function getKubectlPath() {
    const version = core.getInput("kubectl-version");
    const kubectlPath = version
      ? toolCache.find("kubectl", version)
      : await io.which("kubectl", false);

    if (!kubectlPath)
      throw Error(
        "kubectl not found. You must install it before running this action"
      );

    return kubectlPath;
  }
}

run().catch(core.setFailed);
