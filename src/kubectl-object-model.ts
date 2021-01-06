import { ToolRunner, IExecOptions, IExecSyncResult } from "./utilities/tool-runner";
import { getManifestObjects } from "./utilities/manifest-utilities";

export interface Resource {
    name: string;
    type: string;
}

export interface IKubeObject {
  kind: string;
  name: string;
  version: string;
}

export class Kubectl {
    private kubectlPath: string;
    private namespace: string;
    private ignoreSSLErrors: boolean;
    private deployedManifestsPaths: string[];

    constructor(kubectlPath: string, namespace?: string, ignoreSSLErrors?: boolean) {
        this.kubectlPath = kubectlPath;
        this.ignoreSSLErrors = !!ignoreSSLErrors;
        if (!!namespace) {
            this.namespace = namespace;
        } else {
            this.namespace = 'default';
        }
        this.deployedManifestsPaths = [];
    }

    public apply(configurationPaths: string | string[], force?: boolean): IExecSyncResult {
        let applyArgs: string[] = ['apply', '-f', this.createInlineArray(configurationPaths)];

        this.storeDeployedManifestsPaths(configurationPaths);

        if (!!force) {
            console.log("force flag is on, deployment will continue even if previous deployment already exists");
            applyArgs.push('--force');
        }

        return this.execute(applyArgs);
    }

    public describe(resourceType: string, resourceName: string, silent?: boolean): IExecSyncResult {
        return this.execute(['describe', resourceType, resourceName], silent);
    }

    public getNewReplicaSet(deployment: string) {
        let newReplicaSet = '';
        const result = this.describe('deployment', deployment, true);
        if (result && result.stdout) {
            const stdout = result.stdout.split('\n');
            stdout.forEach((line: string) => {
                if (!!line && line.toLowerCase().indexOf('newreplicaset') > -1) {
                    newReplicaSet = line.substr(14).trim().split(' ')[0];
                }
            });
        }

        return newReplicaSet;
    }

    public annotate(resourceType: string, resourceName: string, annotation: string): IExecSyncResult {
        let args = ['annotate', resourceType, resourceName];
        args.push(annotation);
        args.push(`--overwrite`);
        return this.execute(args);
    }

    public annotateFiles(files: string | string[], annotation: string): IExecSyncResult {
        let args = ['annotate'];
        args = args.concat(['-f', this.createInlineArray(files)]);
        args.push(annotation);
        args.push(`--overwrite`);
        return this.execute(args);
    }

    public labelFiles(files: string | string[], labels: string[]): IExecSyncResult {
        let args = ['label'];
        args = args.concat(['-f', this.createInlineArray(files)]);
        args = args.concat(labels);
        args.push(`--overwrite`);
        return this.execute(args);
    }

    public getAllPods(): IExecSyncResult {
        return this.execute(['get', 'pods', '-o', 'json'], true);
    }

    public getClusterInfo(): IExecSyncResult {
        return this.execute(['cluster-info'], true);
    }

    public checkRolloutStatus(resourceType: string, name: string): IExecSyncResult {
        return this.execute(['rollout', 'status', resourceType + '/' + name]);
    }

    public getResource(resourceType: string, name: string): IExecSyncResult {
        return this.execute(['get', resourceType + '/' + name, '-o', 'json']);
    }

    public getResources(applyOutput: string, filterResourceTypes: string[]): Resource[] {
        const outputLines = applyOutput.split('\n');
        const results = [];
        outputLines.forEach(line => {
            const words = line.split(' ');
            if (words.length > 2) {
                const resourceType = words[0].trim();
                const resourceName = JSON.parse(words[1].trim());
                if (filterResourceTypes.filter(type => !!type && resourceType.toLowerCase().startsWith(type.toLowerCase())).length > 0) {
                    results.push({
                        type: resourceType,
                        name: resourceName
                    } as Resource);
                }
            }
        });

        return results;
    }

    public executeCommand(customCommand: string, args?: string) {
        if (!customCommand)
            throw new Error('NullCommandForKubectl');
        return args ? this.execute([customCommand, args]) : this.execute([customCommand]);
    }

    public delete(args: string | string[]) {
        if (typeof args === 'string')
            return this.execute(['delete', args]);
        else
            return this.execute(['delete'].concat(args));
    }

    public getDeployedObjects() {
        let manifests = getManifestObjects(this.deployedManifestsPaths);
        let deployedObjects: IKubeObject[] = [];
        let isKubeObjectPresent: any = {};
        if (manifests &&
            manifests.length > 0) {
                manifests.forEach((manifestContent) => {
                    if (manifestContent &&
                        manifestContent.apiVersion &&
                        manifestContent.kind &&
                        manifestContent.metadata &&
                        manifestContent.metadata.name) {
                            let kind = manifestContent.kind;
                            let name = manifestContent.metadata.name;
                            if (!isKubeObjectPresent[kind]) {
                                isKubeObjectPresent[kind] = {};
                            }

                            if (!isKubeObjectPresent[kind][name]) {
                                deployedObjects.push({
                                    version: manifestContent.apiVersion,
                                    kind: kind,
                                    name: name
                                });
                                isKubeObjectPresent[kind][name] = true;
                            }
                        }
                });
            }
        return deployedObjects;
    }

    private execute(args: string[], silent?: boolean) {
        if (this.ignoreSSLErrors) {
            args.push('--insecure-skip-tls-verify');
        }
        args = args.concat(['--namespace', this.namespace]);
        const command = new ToolRunner(this.kubectlPath);
        command.arg(args);

        return command.execSync({ silent: !!silent } as IExecOptions);
    }

    private createInlineArray(str: string | string[]): string {
        if (typeof str === 'string') { return str; }
        return str.join(',');
    }

    private storeDeployedManifestsPaths(configurationPaths: string | string[]) {
        if (typeof configurationPaths === 'string') {
            this.deployedManifestsPaths.push(configurationPaths)
        }
        else {
            this.deployedManifestsPaths = [...configurationPaths];
        }
    }
}