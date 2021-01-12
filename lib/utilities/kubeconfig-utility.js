"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClusterMetadata = void 0;
const files_helper_1 = require("./files-helper");
const core = require("@actions/core");
const KUBECONFIG_VARIABLE = 'KUBECONFIG';
const CURRENT_CONTEXT = 'current-context';
const CONTEXTS = 'contexts';
const CONTEXT = 'context';
const CLUSTERS = 'clusters';
const CLUSTER = 'cluster';
const SERVER = 'server';
const NAME = 'name';
function getClusterMetadata() {
    let kubeconfigMetadata = {
        name: '',
        url: ''
    };
    const currentCluster = getCurrentCluster();
    if (currentCluster) {
        kubeconfigMetadata.name = currentCluster[NAME] || '';
        kubeconfigMetadata.url = (currentCluster[CLUSTER] && currentCluster[CLUSTER][SERVER]) || '';
    }
    return kubeconfigMetadata;
}
exports.getClusterMetadata = getClusterMetadata;
function getCurrentCluster() {
    // SAMPLE KUBECONFIG
    //
    // apiVersion: v1
    // clusters:
    // - cluster:
    //     certificate-authority-data: contosoCert
    //     server: https://contosok8s.io:443
    //   name: contosoCluster
    // contexts:
    // - context:
    //     cluster: contosoCluster
    //     user: contosoUser
    //   name: contosoCluster
    // current-context: contosoCluster
    // kind: Config
    // preferences: {}
    // users:
    // - name: contosoUser
    //   user:
    //     client-certificate-data: contosoCert
    //     client-key-data: contosoKey
    //     token: contosoToken
    const kubeconfig = readKubeconfig();
    if (!kubeconfig) {
        return null;
    }
    const currentContextName = kubeconfig[CURRENT_CONTEXT];
    const currentContext = currentContextName
        && kubeconfig[CONTEXTS]
        && kubeconfig[CONTEXTS].find(context => context[NAME] == currentContextName);
    const currentClusterName = currentContext[CONTEXT] && currentContext[CONTEXT][CLUSTER];
    const currentCluster = currentClusterName
        && kubeconfig[CLUSTERS]
        && kubeconfig[CLUSTERS].find(cluster => cluster[NAME] == currentClusterName);
    return currentCluster;
}
function readKubeconfig() {
    const kubeconfigPath = process.env[KUBECONFIG_VARIABLE];
    let kubeconfig = null;
    try {
        let parsedYaml = files_helper_1.getParsedYaml(kubeconfigPath);
        if (parsedYaml && parsedYaml.length > 0) {
            kubeconfig = parsedYaml[0];
        }
    }
    catch (error) {
        core.debug(`An error occured while reading the kubeconfig. Error: ${error}`);
    }
    return kubeconfig;
}
