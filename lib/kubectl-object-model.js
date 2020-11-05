"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Kubectl = void 0;
const tool_runner_1 = require("./utilities/tool-runner");
class Kubectl {
    constructor(kubectlPath, namespace, ignoreSSLErrors) {
        this.kubectlPath = kubectlPath;
        this.ignoreSSLErrors = !!ignoreSSLErrors;
        if (!!namespace) {
            this.namespace = namespace;
        }
        else {
            this.namespace = 'default';
        }
    }
    apply(configurationPaths, force) {
        let applyArgs = ['apply', '-f', this.createInlineArray(configurationPaths)];
        if (!!force) {
            console.log("force flag is on, deployment will continue even if previous deployment already exists");
            applyArgs.push('--force');
        }
        return this.execute(applyArgs);
    }
    describe(resourceType, resourceName, silent) {
        return this.execute(['describe', resourceType, resourceName], silent);
    }
    getNewReplicaSet(deployment) {
        let newReplicaSet = '';
        const result = this.describe('deployment', deployment, true);
        if (result && result.stdout) {
            const stdout = result.stdout.split('\n');
            stdout.forEach((line) => {
                if (!!line && line.toLowerCase().indexOf('newreplicaset') > -1) {
                    newReplicaSet = line.substr(14).trim().split(' ')[0];
                }
            });
        }
        return newReplicaSet;
    }
    annotate(resourceType, resourceName, annotation) {
        let args = ['annotate', resourceType, resourceName];
        args.push(annotation);
        args.push(`--overwrite`);
        return this.execute(args);
    }
    annotateFiles(files, annotation) {
        let args = ['annotate'];
        args = args.concat(['-f', this.createInlineArray(files)]);
        args.push(annotation);
        args.push(`--overwrite`);
        return this.execute(args);
    }
    labelFiles(files, labels) {
        let args = ['label'];
        args = args.concat(['-f', this.createInlineArray(files)]);
        args = args.concat(labels);
        args.push(`--overwrite`);
        return this.execute(args);
    }
    getAllPods() {
        return this.execute(['get', 'pods', '-o', 'json'], true);
    }
    getClusterInfo() {
        return this.execute(['cluster-info'], true);
    }
    checkRolloutStatus(resourceType, name) {
        return this.execute(['rollout', 'status', resourceType + '/' + name]);
    }
    getResource(resourceType, name) {
        return this.execute(['get', resourceType + '/' + name, '-o', 'json']);
    }
    getResources(applyOutput, filterResourceTypes) {
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
                    });
                }
            }
        });
        return results;
    }
    executeCommand(customCommand, args) {
        if (!customCommand)
            throw new Error('NullCommandForKubectl');
        return args ? this.execute([customCommand, args]) : this.execute([customCommand]);
    }
    delete(args) {
        if (typeof args === 'string')
            return this.execute(['delete', args]);
        else
            return this.execute(['delete'].concat(args));
    }
    execute(args, silent) {
        if (this.ignoreSSLErrors) {
            args.push('--insecure-skip-tls-verify');
        }
        args = args.concat(['--namespace', this.namespace]);
        const command = new tool_runner_1.ToolRunner(this.kubectlPath);
        command.arg(args);
        return command.execSync({ silent: !!silent });
    }
    createInlineArray(str) {
        if (typeof str === 'string') {
            return str;
        }
        return str.join(',');
    }
}
exports.Kubectl = Kubectl;
=======
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Kubectl = void 0;
const tool_runner_1 = require("./utilities/tool-runner");
class Kubectl {
    constructor(kubectlPath, namespace, ignoreSSLErrors) {
        this.kubectlPath = kubectlPath;
        this.ignoreSSLErrors = !!ignoreSSLErrors;
        if (!!namespace) {
            this.namespace = namespace;
        }
        else {
            this.namespace = 'default';
        }
    }
    apply(configurationPaths, force) {
        let applyArgs = ['apply', '-f', this.createInlineArray(configurationPaths)];
        if (!!force) {
            console.log("force flag is on, deployment will continue even if previous deployment already exists");
            applyArgs.push('--force');
        }
        return this.execute(applyArgs);
    }
    describe(resourceType, resourceName, silent) {
        return this.execute(['describe', resourceType, resourceName], silent);
    }
    getNewReplicaSet(deployment) {
        let newReplicaSet = '';
        const result = this.describe('deployment', deployment, true);
        if (result && result.stdout) {
            const stdout = result.stdout.split('\n');
            stdout.forEach((line) => {
                if (!!line && line.toLowerCase().indexOf('newreplicaset') > -1) {
                    newReplicaSet = line.substr(14).trim().split(' ')[0];
                }
            });
        }
        return newReplicaSet;
    }
    annotate(resourceType, resourceName, annotation) {
        let args = ['annotate', resourceType, resourceName];
        args.push(annotation);
        args.push(`--overwrite`);
        return this.execute(args);
    }
    annotateFiles(files, annotation) {
        let args = ['annotate'];
        args = args.concat(['-f', this.createInlineArray(files)]);
        args.push(annotation);
        args.push(`--overwrite`);
        return this.execute(args);
    }
    labelFiles(files, labels) {
        let args = ['label'];
        args = args.concat(['-f', this.createInlineArray(files)]);
        args = args.concat(labels);
        args.push(`--overwrite`);
        return this.execute(args);
    }
    getAllPods() {
        return this.execute(['get', 'pods', '-o', 'json'], true);
    }
    getClusterInfo() {
        return this.execute(['cluster-info'], true);
    }
    checkRolloutStatus(resourceType, name) {
        return this.execute(['rollout', 'status', resourceType + '/' + name]);
    }
    getResource(resourceType, name) {
        return this.execute(['get', resourceType + '/' + name, '-o', 'json']);
    }
    getResources(applyOutput, filterResourceTypes) {
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
                    });
                }
            }
        });
        return results;
    }
    executeCommand(customCommand, args) {
        if (!customCommand)
            throw new Error('NullCommandForKubectl');
        return args ? this.execute([customCommand, args]) : this.execute([customCommand]);
    }
    delete(args) {
        if (typeof args === 'string')
            return this.execute(['delete', args]);
        else
            return this.execute(['delete'].concat(args));
    }
    execute(args, silent) {
        if (this.ignoreSSLErrors) {
            args.push('--insecure-skip-tls-verify');
        }
        args = args.concat(['--namespace', this.namespace]);
        const command = new tool_runner_1.ToolRunner(this.kubectlPath);
        command.arg(args);
        return command.execSync({ silent: !!silent });
    }
    createInlineArray(str) {
        if (typeof str === 'string') {
            return str;
        }
        return str.join(',');
    }
}
exports.Kubectl = Kubectl;
