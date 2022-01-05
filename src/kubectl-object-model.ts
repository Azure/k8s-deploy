import { ExecOutput, getExecOutput } from "@actions/exec";

export interface Resource {
  name: string;
  type: string;
}

export class Kubectl {
  private kubectlPath: string;
  private namespace: string;
  private ignoreSSLErrors: boolean;

  constructor(
    kubectlPath: string,
    namespace: string = "default",
    ignoreSSLErrors: boolean = false
  ) {
    this.kubectlPath = kubectlPath;
    this.ignoreSSLErrors = !!ignoreSSLErrors;
    this.namespace = namespace;
  }

  public async apply(
    configurationPaths: string | string[],
    force: boolean = false
  ): Promise<ExecOutput> {
    const applyArgs: string[] = [
      "apply",
      "-f",
      createInlineArray(configurationPaths),
    ];
    if (force) applyArgs.push("--force");

    return await this.execute(applyArgs);
  }

  public async describe(
    resourceType: string,
    resourceName: string,
    silent: boolean = false
  ): Promise<ExecOutput> {
    return await this.execute(["describe", resourceType, resourceName], silent);
  }

  public async getNewReplicaSet(deployment: string) {
    const result = await this.describe("deployment", deployment, true);

    let newReplicaSet = "";
    if (result?.stdout) {
      const stdout = result.stdout.split("\n");
      stdout.forEach((line: string) => {
        const newreplicaset = "newreplicaset";
        if (line && line.toLowerCase().indexOf(newreplicaset) > -1)
          newReplicaSet = line
            .substring(newreplicaset.length)
            .trim()
            .split(" ")[0];
      });
    }

    return newReplicaSet;
  }

  public async annotate(
    resourceType: string,
    resourceName: string,
    annotation: string
  ): Promise<ExecOutput> {
    const args = [
      "annotate",
      resourceType,
      resourceName,
      annotation,
      "--overwrite",
    ];
    return await this.execute(args);
  }

  public async annotateFiles(
    files: string | string[],
    annotation: string
  ): Promise<ExecOutput> {
    const args = [
      "annotate",
      "-f",
      createInlineArray(files),
      annotation,
      "--overwrite",
    ];
    return await this.execute(args);
  }

  public async labelFiles(
    files: string | string[],
    labels: string[]
  ): Promise<ExecOutput> {
    const args = [
      "label",
      "-f",
      createInlineArray(files),
      ...labels,
      "--overwrite",
    ];
    return await this.execute(args);
  }

  public async getAllPods(): Promise<ExecOutput> {
    return await this.execute(["get", "pods", "-o", "json"], true);
  }

  public async getClusterInfo(): Promise<ExecOutput> {
    return await this.execute(["cluster-info"], true);
  }

  public async checkRolloutStatus(
    resourceType: string,
    name: string
  ): Promise<ExecOutput> {
    return await this.execute(["rollout", "status", `${resourceType}/${name}`]);
  }

  public async getResource(
    resourceType: string,
    name: string
  ): Promise<ExecOutput> {
    return await this.execute(["get", `${resourceType}/${name}`, "-o", "json"]);
  }

  public getResources(
    applyOutput: string,
    filterResourceTypes: string[]
  ): Resource[] {
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
          } as Resource);
      }
    });

    return results;
  }

  public executeCommand(command: string, args?: string) {
    if (!command) throw new Error("Command must be defined");
    return args ? this.execute([command, args]) : this.execute([command]);
  }

  public delete(args: string | string[]) {
    if (typeof args === "string") return this.execute(["delete", args]);
    return this.execute(["delete", ...args]);
  }

  private async execute(args: string[], silent?: boolean) {
    if (this.ignoreSSLErrors) {
      args.push("--insecure-skip-tls-verify");
    }
    args = args.concat(["--namespace", this.namespace]);

    return await getExecOutput(this.kubectlPath, args, { silent });
  }
}

function createInlineArray(str: string | string[]): string {
  if (typeof str === "string") {
    return str;
  }
  return str.join(",");
}
