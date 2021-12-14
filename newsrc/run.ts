import * as core from "@actions/core";
import * as io from "@actions/io";
import { Action, parseAction } from "./types/action";

export async function run() {
  if (!process.env["KUBECONFIG"]) {
    core.warning(
      "KUBECONFIG env is not explicitly set. Ensure cluster context is set by using k8s-set-context action."
    );
  }

  const action: Action | undefined = parseAction(
    core.getInput("action", { required: true })
  );
  switch (action) {
    case Action.DEPLOY: {
      const strategy = core.getInput("strategy");
      const manifestsInput = core.getInput("manifests", { required: true });
      const manifestFilePaths = manifestsInput
        .split(/[\n,;]+/) // split into each individual manifest
        .map((manifest) => manifest.trim()) // remove surrounding whitespace
        .filter((manifest) => manifest.length > 0); // remove any blanks
      const namespace = core.getInput("namespace") || "default";

      // run deploy
      break;
    }
    case Action.PROMOTE: {
      // run promote
      break;
    }
    case Action.REJECT: {
      // run reject
      break;
    }
    default: {
      throw Error(
        'Not a valid action. The allowed actions are "deploy", "promote", and "reject".'
      );
    }
  }
}

run().catch(core.setFailed);
