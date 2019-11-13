'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const tl = require("@actions/core");
exports.namespace = tl.getInput('namespace');
exports.containers = tl.getInput('images').split('\n');
exports.imagePullSecrets = tl.getInput('imagepullsecrets').split('\n');
exports.manifests = tl.getInput('manifests').split('\n');
exports.canaryPercentage = tl.getInput('percentage');
exports.deploymentStrategy = tl.getInput('strategy');
exports.trafficSplitMethod = tl.getInput('traffic-split-method');
exports.baselineAndCanaryReplicas = tl.getInput('baseline-and-canary-replicas');
exports.args = tl.getInput('arguments');
if (!exports.namespace) {
    tl.debug('Namespace was not supplied; using "default" namespace instead.');
    exports.namespace = 'default';
}
