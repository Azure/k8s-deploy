'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.forceDeployment = exports.args = exports.baselineAndCanaryReplicas = exports.trafficSplitMethod = exports.deploymentStrategy = exports.canaryPercentage = exports.manifests = exports.imagePullSecrets = exports.containers = exports.namespace = void 0;
const core = require("@actions/core");
exports.namespace = core.getInput('namespace');
exports.containers = core.getInput('images').split('\n');
exports.imagePullSecrets = core.getInput('imagepullsecrets').split('\n').filter(secret => secret.trim().length > 0);
exports.manifests = core.getInput('manifests').split(/[\n,;]+/).filter(manifest => manifest.trim().length > 0);
exports.canaryPercentage = core.getInput('percentage');
exports.deploymentStrategy = core.getInput('strategy');
exports.trafficSplitMethod = core.getInput('traffic-split-method');
exports.baselineAndCanaryReplicas = core.getInput('baseline-and-canary-replicas');
exports.args = core.getInput('arguments');
exports.forceDeployment = core.getInput('force').toLowerCase() == 'true';
if (!exports.namespace) {
    core.debug('Namespace was not supplied; using "default" namespace instead.');
    exports.namespace = 'default';
}
try {
    const pe = parseInt(exports.canaryPercentage);
    if (pe < 0 || pe > 100) {
        core.setFailed('A valid percentage value is between 0 and 100');
        process.exit(1);
    }
}
catch (ex) {
    core.setFailed("Enter a valid 'percentage' integer value ");
    process.exit(1);
}
try {
    const pe = parseInt(exports.baselineAndCanaryReplicas);
    if (pe < 0 || pe > 100) {
        core.setFailed('A valid baseline-and-canary-replicas value is between 0 and 100');
        process.exit(1);
    }
}
catch (ex) {
    core.setFailed("Enter a valid 'baseline-and-canary-replicas' integer value");
    process.exit(1);
}
