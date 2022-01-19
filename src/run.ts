import * as core from "@actions/core";
import * as io from "@actions/io";
import * as toolCache from "@actions/tool-cache";
import { Kubectl } from "./types/kubectl";
import { deploy } from "./actions/deploy";
import { promote } from "./actions/promote";
import { reject } from "./actions/reject";
import { Action, parseAction } from "./types/action";
import { parseDeploymentStrategy } from "./types/deploymentStrategy";

export async function run() {
  // verify kubeconfig is set
  if (!process.env["KUBECONFIG"]) {
    core.warning(
      "KUBECONFIG env is not explicitly set. Ensure cluster context is set by using k8s-set-context action."
    );

    // get inputs
    const action: Action | undefined = parseAction(
      core.getInput("action", { required: true })
    );
    const manifestsInput = core.getInput("manifests", { required: true });
    const manifestFilePaths = manifestsInput
      .split(/[\n,;]+/) // split into each individual manifest
      .map((manifest) => manifest.trim()) // remove surrounding whitespace
      .filter((manifest) => manifest.length > 0); // remove any blanks

    // create kubectl
    const kubectlPath = await getKubectlPath();
    const namespace = core.getInput("namespace") || "default";
    const kubectl = new Kubectl(kubectlPath, namespace, true);

    // run action
    switch (action) {
      case Action.DEPLOY: {
        const strategy = parseDeploymentStrategy(core.getInput("strategy"));

        await deploy(kubectl, manifestFilePaths, strategy);
        break;
      }
      case Action.PROMOTE: {
        await promote(kubectl, manifestFilePaths);
        break;
      }
      case Action.REJECT: {
        await reject(kubectl, manifestFilePaths);
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
    try {
      const kubectlPath = version
        ? toolCache.find("kubectl", version)
        : await io.which("kubectl", true);

      if (!kubectlPath)
        throw Error(
          "kubectl not found. You must install it before running this action"
        );
      return kubectlPath;
    } catch (ex) {
      throw Error(
        "kubectl not found. You must install it before running this action"
      );
    }
  }
}

run().catch(core.setFailed);
