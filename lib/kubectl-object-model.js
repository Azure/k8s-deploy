"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {    
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
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
    apply(configurationPaths) {
        return this.execute(['apply', '-f', this.createInlineArray(configurationPaths)]);
    }
    describe(resourceType, resourceName, silent) {
        return this.execute(['describe', resourceType, resourceName], silent);
    }
    getNewReplicaSet(deployment) {
        return __awaiter(this, void 0, void 0, function* () {
            let newReplicaSet = '';
            const result = yield this.describe('deployment', deployment, true);
            if (result && result.stdout) {
                const stdout = result.stdout.split('\n');
                stdout.forEach((line) => {
                    if (!!line && line.toLowerCase().indexOf('newreplicaset') > -1) {
                        newReplicaSet = line.substr(14).trim().split(' ')[0];
                    }
                });
            }
            return newReplicaSet;
        });
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
