import { ToolRunner, IExecOptions } from "./utilities/tool-runner";

export interface Resource {
    name: string;
    type: string;
}

export class Kubectl {
    private kubectlPath: string;
    private namespace: string;
    private ignoreSSLErrors: boolean;

    constructor(kubectlPath: string, namespace?: string, ignoreSSLErrors?: boolean) {
        this.kubectlPath = kubectlPath;
        this.ignoreSSLErrors = !!ignoreSSLErrors;
        if (!!namespace) {
            this.namespace = namespace;
        } else {
            this.namespace = 'default';
        }
    }

    public apply(configurationPaths: string | string[]) {
        return this.execute(['apply', '-f', this.createInlineArray(configurationPaths)]);
    }

    public describe(resourceType: string, resourceName: string, silent?: boolean) {
        return this.execute(['describe', resourceType, resourceName], silent);
    }

    public async getNewReplicaSet(deployment: string) {
        let newReplicaSet = '';
        const result = await this.describe('deployment', deployment, true);
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

    public getAllPods() {
        return this.execute(['get', 'pods', '-o', 'json'], true);
    }

    public getClusterInfo() {
        return this.execute(['cluster-info'], true);
    }

    public checkRolloutStatus(resourceType: string, name: string) {
        return this.execute(['rollout', 'status', resourceType + '/' + name]);
    }

    public getResource(resourceType: string, name: string) {
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
        return args ? this.execute([customCommand, args]) : this.execute([customCommand]);
    }

    public delete(args: string | string[]) {
        if (typeof args === 'string')
            return this.execute(['delete', args]);
        else
            return this.execute(['delete'].concat(args));
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
}