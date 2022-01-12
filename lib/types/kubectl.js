"use strict";
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.Kubectl = void 0;
const exec_1 = require("@actions/exec");
class Kubectl {
  constructor(kubectlPath, namespace = "default", ignoreSSLErrors = false) {
    this.kubectlPath = kubectlPath;
    this.ignoreSSLErrors = !!ignoreSSLErrors;
    this.namespace = namespace;
  }
  apply(configurationPaths, force = false) {
    return __awaiter(this, void 0, void 0, function* () {
      const applyArgs = ["apply", "-f", createInlineArray(configurationPaths)];
      if (force) applyArgs.push("--force");
      return yield this.execute(applyArgs);
    });
  }
  describe(resourceType, resourceName, silent = false) {
    return __awaiter(this, void 0, void 0, function* () {
      return yield this.execute(
        ["describe", resourceType, resourceName],
        silent
      );
    });
  }
  getNewReplicaSet(deployment) {
    return __awaiter(this, void 0, void 0, function* () {
      const result = yield this.describe("deployment", deployment, true);
      let newReplicaSet = "";
      if (result === null || result === void 0 ? void 0 : result.stdout) {
        const stdout = result.stdout.split("\n");
        stdout.forEach((line) => {
          const newreplicaset = "newreplicaset";
          if (line && line.toLowerCase().indexOf(newreplicaset) > -1)
            newReplicaSet = line
              .substring(newreplicaset.length)
              .trim()
              .split(" ")[0];
        });
      }
      return newReplicaSet;
    });
  }
  annotate(resourceType, resourceName, annotation) {
    return __awaiter(this, void 0, void 0, function* () {
      const args = [
        "annotate",
        resourceType,
        resourceName,
        annotation,
        "--overwrite",
      ];
      return yield this.execute(args);
    });
  }
  annotateFiles(files, annotation) {
    return __awaiter(this, void 0, void 0, function* () {
      const args = [
        "annotate",
        "-f",
        createInlineArray(files),
        annotation,
        "--overwrite",
      ];
      return yield this.execute(args);
    });
  }
  labelFiles(files, labels) {
    return __awaiter(this, void 0, void 0, function* () {
      const args = [
        "label",
        "-f",
        createInlineArray(files),
        ...labels,
        "--overwrite",
      ];
      return yield this.execute(args);
    });
  }
  getAllPods() {
    return __awaiter(this, void 0, void 0, function* () {
      return yield this.execute(["get", "pods", "-o", "json"], true);
    });
  }
  getClusterInfo() {
    return __awaiter(this, void 0, void 0, function* () {
      return yield this.execute(["cluster-info"], true);
    });
  }
  checkRolloutStatus(resourceType, name) {
    return __awaiter(this, void 0, void 0, function* () {
      return yield this.execute([
        "rollout",
        "status",
        `${resourceType}/${name}`,
      ]);
    });
  }
  getResource(resourceType, name) {
    return __awaiter(this, void 0, void 0, function* () {
      return yield this.execute([
        "get",
        `${resourceType}/${name}`,
        "-o",
        "json",
      ]);
    });
  }
  getResources(applyOutput, filterResourceTypes) {
    const outputLines = applyOutput.split("\n");
    const results = [];
    outputLines.forEach((line) => {
      const words = line.split(" ");
      if (words.length > 2) {
        const resourceType = words[0].trim();
        const resourceName = JSON.parse(words[1].trim());
        if (
          filterResourceTypes.filter(
            (type) =>
              !!type &&
              resourceType.toLowerCase().startsWith(type.toLowerCase())
          ).length > 0
        )
          results.push({
            type: resourceType,
            name: resourceName,
          });
      }
    });
    return results;
  }
  executeCommand(command, args) {
    if (!command) throw new Error("Command must be defined");
    return args ? this.execute([command, args]) : this.execute([command]);
  }
  delete(args) {
    if (typeof args === "string") return this.execute(["delete", args]);
    return this.execute(["delete", ...args]);
  }
  execute(args, silent) {
    return __awaiter(this, void 0, void 0, function* () {
      if (this.ignoreSSLErrors) {
        args.push("--insecure-skip-tls-verify");
      }
      args = args.concat(["--namespace", this.namespace]);
      return yield exec_1.getExecOutput(this.kubectlPath, args, { silent });
    });
  }
}
exports.Kubectl = Kubectl;
function createInlineArray(str) {
  if (typeof str === "string") {
    return str;
  }
  return str.join(",");
}
