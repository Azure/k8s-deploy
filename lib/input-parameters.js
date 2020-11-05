'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.githubToken = exports.forceDeployment = exports.args = exports.baselineAndCanaryReplicas = exports.versionSwitchBuffer = exports.routeMethod = exports.trafficSplitMethod = exports.deploymentStrategy = exports.canaryPercentage = exports.manifests = exports.imagePullSecrets = exports.containers = exports.namespace = void 0;
const core = require("@actions/core");
exports.namespace = core.getInput('namespace');
exports.containers = core.getInput('images').split('\n');
exports.imagePullSecrets = core.getInput('imagepullsecrets').split('\n').filter(secret => secret.trim().length > 0);
exports.manifests = core.getInput('manifests').split('\n');
exports.canaryPercentage = core.getInput('percentage');
exports.deploymentStrategy = core.getInput('strategy');
exports.trafficSplitMethod = core.getInput('traffic-split-method');
exports.routeMethod = core.getInput('route-method');
exports.versionSwitchBuffer = core.getInput('version-switch-buffer');
exports.baselineAndCanaryReplicas = core.getInput('baseline-and-canary-replicas');
exports.args = core.getInput('arguments');
exports.forceDeployment = core.getInput('force').toLowerCase() == 'true';
exports.githubToken = core.getInput("token");
if (!exports.namespace) {
    core.debug('Namespace was not supplied; using "default" namespace instead.');
    exports.namespace = 'default';
}
if (!exports.githubToken) {
    core.error("'token' input is not supplied. Set it to a PAT/GITHUB_TOKEN");
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
try {
    const pe = parseInt(exports.versionSwitchBuffer);
    if (pe < 0 || pe > 300) {
        core.setFailed('Invalid buffer time, valid version-switch-buffer is a value more than or equal to 0 and lesser than or equal 300');
        process.exit(1);
    }
}
catch (ex) {
    core.setFailed("Enter a valid 'version-switch-buffer' integer value");
    process.exit(1);
}
=======
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.githubToken = exports.forceDeployment = exports.args = exports.baselineAndCanaryReplicas = exports.versionSwitchBuffer = exports.routeMethod = exports.trafficSplitMethod = exports.deploymentStrategy = exports.canaryPercentage = exports.manifests = exports.imagePullSecrets = exports.containers = exports.namespace = void 0;
const core = require("@actions/core");
exports.namespace = core.getInput('namespace');
exports.containers = core.getInput('images').split('\n');
exports.imagePullSecrets = core.getInput('imagepullsecrets').split('\n').filter(secret => secret.trim().length > 0);
exports.manifests = core.getInput('manifests').split('\n');
exports.canaryPercentage = core.getInput('percentage');
exports.deploymentStrategy = core.getInput('strategy');
exports.trafficSplitMethod = core.getInput('traffic-split-method');
exports.routeMethod = core.getInput('route-method');
exports.versionSwitchBuffer = core.getInput('version-switch-buffer');
exports.baselineAndCanaryReplicas = core.getInput('baseline-and-canary-replicas');
exports.args = core.getInput('arguments');
exports.forceDeployment = core.getInput('force').toLowerCase() == 'true';
exports.githubToken = core.getInput("token");
if (!exports.namespace) {
    core.debug('Namespace was not supplied; using "default" namespace instead.');
    exports.namespace = 'default';
}
if (!exports.githubToken) {
    core.error("'token' input is not supplied. Set it to a PAT/GITHUB_TOKEN");
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
try {
    const pe = parseInt(exports.versionSwitchBuffer);
    if (pe < 0 || pe > 300) {
        core.setFailed('Invalid buffer time, valid version-switch-buffer is a value more than or equal to 0 and lesser than or equal 300');
        process.exit(1);
    }
}
catch (ex) {
    core.setFailed("Enter a valid 'version-switch-buffer' integer value");
    process.exit(1);
}

