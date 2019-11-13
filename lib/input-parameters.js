'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const core = require("@actions/core");
exports.namespace = core.getInput('namespace');
exports.containers = core.getInput('images').split('\n');
exports.imagePullSecrets = core.getInput('imagepullsecrets').split('\n');
exports.manifests = core.getInput('manifests').split('\n');
exports.canaryPercentage = core.getInput('percentage');
exports.deploymentStrategy = core.getInput('strategy');
exports.trafficSplitMethod = core.getInput('traffic-split-method');
exports.baselineAndCanaryReplicas = core.getInput('baseline-and-canary-replicas');
exports.args = core.getInput('arguments');
if (!exports.namespace) {
    core.debug('Namespace was not supplied; using "default" namespace instead.');
    exports.namespace = 'default';
}
