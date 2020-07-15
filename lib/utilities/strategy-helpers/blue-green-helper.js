'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAllResourcesOfKind = exports.fetchResource = exports.isServiceSelectorSubsetOfMatchLabel = exports.getSMIServiceResource = exports.getAuxiliaryService = exports.getServiceSelector = exports.getDeploymentMatchLabels = exports.getBlueGreenResourceName = exports.addBlueGreenLabelsAndAnnotations = exports.getNewBlueGreenObject = exports.createWorkloadsWithLabel = exports.isServiceRouted = exports.removeBlueGreenSelectors = exports.isGreenObject = exports.getManifestObjects = exports.getSuffix = exports.deleteObjects = exports.deleteWorkloadsAndServicesWithLabel = exports.deleteWorkloadsWithLabel = exports.routeBlueGreen = exports.isSMIRoute = exports.isIngressRoute = exports.isBlueGreenDeploymentStrategy = exports.STABLE_SUFFIX = exports.GREEN_SUFFIX = exports.BLUE_GREEN_AUXILIARY_LABEL = exports.BLUE_GREEN_VERSION_LABEL = exports.NONE_LABEL_VALUE = exports.GREEN_LABEL_VALUE = exports.BLUE_GREEN_DEPLOYMENT_STRATEGY = void 0;
const core = require("@actions/core");
const fs = require("fs");
const yaml = require("js-yaml");
const utility_1 = require("../utility");
const constants_1 = require("../../constants");
const fileHelper = require("../files-helper");
const helper = require("../resource-object-utility");
const TaskInputParameters = require("../../input-parameters");
const service_blue_green_helper_1 = require("./service-blue-green-helper");
const ingress_blue_green_helper_1 = require("./ingress-blue-green-helper");
const smi_blue_green_helper_1 = require("./smi-blue-green-helper");
exports.BLUE_GREEN_DEPLOYMENT_STRATEGY = 'BLUE-GREEN';
exports.GREEN_LABEL_VALUE = 'green';
exports.NONE_LABEL_VALUE = 'None';
exports.BLUE_GREEN_VERSION_LABEL = 'k8s.deploy.color';
exports.BLUE_GREEN_AUXILIARY_LABEL = 'k8s.deploy.auxiliary';
exports.GREEN_SUFFIX = '-green';
exports.STABLE_SUFFIX = '-stable';
const TRUE_STRING = 'True';
function isBlueGreenDeploymentStrategy() {
    const deploymentStrategy = TaskInputParameters.deploymentStrategy;
    return deploymentStrategy && deploymentStrategy.toUpperCase() === exports.BLUE_GREEN_DEPLOYMENT_STRATEGY;
}
exports.isBlueGreenDeploymentStrategy = isBlueGreenDeploymentStrategy;
function isIngressRoute() {
    const routeMethod = TaskInputParameters.routeMethod;
    return routeMethod && routeMethod.toUpperCase() === constants_1.DiscoveryAndLoadBalancerResource.ingress.toUpperCase();
}
exports.isIngressRoute = isIngressRoute;
function isSMIRoute() {
    const routeMethod = TaskInputParameters.routeMethod;
    return routeMethod && routeMethod.toUpperCase() === constants_1.DiscoveryAndLoadBalancerResource.smi.toUpperCase();
}
exports.isSMIRoute = isSMIRoute;
function routeBlueGreen(kubectl, manifestObjects) {
    return __awaiter(this, void 0, void 0, function* () {
        // get buffer time
        let bufferTime = parseInt(TaskInputParameters.versionSwitchBuffer);
        //logging start of buffer time
        let dateNow = new Date();
        console.log(`Starting buffer time of ${bufferTime} minute(s) at ${dateNow.toISOString()}`);
        // waiting
        yield utility_1.sleep(bufferTime * 1000 * 60);
        // logging end of buffer time
        dateNow = new Date();
        console.log(`Stopping buffer time of ${bufferTime} minute(s) at ${dateNow.toISOString()}`);
        // routing to new deployments
        if (isIngressRoute()) {
            ingress_blue_green_helper_1.routeBlueGreenIngress(kubectl, exports.GREEN_LABEL_VALUE, manifestObjects.serviceNameMap, manifestObjects.ingressEntityList);
        }
        else if (isSMIRoute()) {
            smi_blue_green_helper_1.routeBlueGreenSMI(kubectl, exports.GREEN_LABEL_VALUE, manifestObjects.serviceEntityList);
        }
        else {
            service_blue_green_helper_1.routeBlueGreenService(kubectl, exports.GREEN_LABEL_VALUE, manifestObjects.serviceEntityList);
        }
    });
}
exports.routeBlueGreen = routeBlueGreen;
function deleteWorkloadsWithLabel(kubectl, deleteLabel, deploymentEntityList) {
    let resourcesToDelete = [];
    deploymentEntityList.forEach((inputObject) => {
        const name = inputObject.metadata.name;
        const kind = inputObject.kind;
        if (deleteLabel === exports.NONE_LABEL_VALUE) {
            // if dellabel is none, deletes stable deployments
            const resourceToDelete = { name: name, kind: kind };
            resourcesToDelete.push(resourceToDelete);
        }
        else {
            // if dellabel is not none, then deletes new green deployments
            const resourceToDelete = { name: getBlueGreenResourceName(name, exports.GREEN_SUFFIX), kind: kind };
            resourcesToDelete.push(resourceToDelete);
        }
    });
    // deletes the deployments
    deleteObjects(kubectl, resourcesToDelete);
}
exports.deleteWorkloadsWithLabel = deleteWorkloadsWithLabel;
function deleteWorkloadsAndServicesWithLabel(kubectl, deleteLabel, deploymentEntityList, serviceEntityList) {
    // need to delete services and deployments
    const deletionEntitiesList = deploymentEntityList.concat(serviceEntityList);
    let resourcesToDelete = [];
    deletionEntitiesList.forEach((inputObject) => {
        const name = inputObject.metadata.name;
        const kind = inputObject.kind;
        if (deleteLabel === exports.NONE_LABEL_VALUE) {
            // if not dellabel, delete stable objects
            const resourceToDelete = { name: name, kind: kind };
            resourcesToDelete.push(resourceToDelete);
        }
        else {
            // else delete green labels
            const resourceToDelete = { name: getBlueGreenResourceName(name, exports.GREEN_SUFFIX), kind: kind };
            resourcesToDelete.push(resourceToDelete);
        }
    });
    deleteObjects(kubectl, resourcesToDelete);
}
exports.deleteWorkloadsAndServicesWithLabel = deleteWorkloadsAndServicesWithLabel;
function deleteObjects(kubectl, deleteList) {
    // delete services and deployments
    deleteList.forEach((delObject) => {
        try {
            const result = kubectl.delete([delObject.kind, delObject.name]);
            utility_1.checkForErrors([result]);
        }
        catch (ex) {
            // Ignore failures of delete if doesn't exist
        }
    });
}
exports.deleteObjects = deleteObjects;
function getSuffix(label) {
    if (label === exports.GREEN_LABEL_VALUE) {
        return exports.GREEN_SUFFIX;
    }
    else {
        return '';
    }
}
exports.getSuffix = getSuffix;
function getManifestObjects(kubectl, filePaths) {
    const deploymentEntityList = [];
    const serviceEntityList = [];
    const ingressEntityList = [];
    const otherEntitiesList = [];
    filePaths.forEach((filePath) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {
            if (!!inputObject) {
                const kind = inputObject.kind;
                if (helper.isDeploymentEntity(kind)) {
                    deploymentEntityList.push(inputObject);
                }
                else if (helper.isServiceEntity(kind)) {
                    serviceEntityList.push(inputObject);
                }
                else if (helper.isIngressEntity(kind)) {
                    ingressEntityList.push(inputObject);
                }
                else {
                    otherEntitiesList.push(inputObject);
                }
            }
        });
    });
    const allServiceEntities = getServicesToRoute(kubectl, deploymentEntityList, serviceEntityList);
    const allIngressEntities = getIngressesToRoute(kubectl, ingressEntityList, allServiceEntities.serviceNameMap);
    return { serviceEntityList: allServiceEntities.routedServices, serviceNameMap: allServiceEntities.serviceNameMap, unroutedServiceEntityList: allServiceEntities.unroutedServices, deploymentEntityList: deploymentEntityList, ingressEntityList: allIngressEntities.routedIngresses, unroutedIngressEntityList: allIngressEntities.unroutedIngresses, otherObjects: otherEntitiesList };
}
exports.getManifestObjects = getManifestObjects;
// find services in manifests and namespace  which need to be routed for a corresponding workload in manifest
function getServicesToRoute(kubectl, deploymentEntityList, serviceEntityList) {
    // finding services without selectors
    const unroutedServices = [];
    const servicesWithSelectors = [];
    serviceEntityList.forEach((serviceObject) => {
        const serviceSelector = getServiceSelector(serviceObject);
        if (!!serviceSelector) {
            servicesWithSelectors.push(serviceObject);
        }
        else {
            unroutedServices.push(serviceObject);
        }
    });
    const routedServices = [];
    let serviceNameMap = new Map();
    const deploymentsWithoutServices = [];
    // find any workloads that are not routed
    deploymentEntityList.forEach(deploymentObject => {
        const deploymentMatchLabels = getDeploymentMatchLabels(deploymentObject);
        if (!!deploymentMatchLabels) {
            let isDeploymentRouted = false;
            servicesWithSelectors.forEach((serviceObject) => {
                const serviceSelector = getServiceSelector(serviceObject);
                if (isServiceSelectorSubsetOfMatchLabel(serviceSelector, deploymentMatchLabels)) {
                    // if service targets a workload and has not been already added to routed list, add it
                    if (!serviceNameMap.has(serviceObject.metadata.name)) {
                        routedServices.push(serviceObject);
                        serviceNameMap.set(serviceObject.metadata.name, getBlueGreenResourceName(serviceObject.metadata.name, exports.GREEN_SUFFIX));
                    }
                    isDeploymentRouted = true;
                }
            });
            if (!isDeploymentRouted) {
                deploymentsWithoutServices.push(deploymentObject);
            }
        }
    });
    // if a service does not have a corresponding workloads in manifests, do not route it
    servicesWithSelectors.forEach((serviceObject) => {
        if (!serviceNameMap.has(serviceObject.metadata.name)) {
            unroutedServices.push(serviceObject);
        }
    });
    // if some workloads without services targeting them exist
    if (deploymentsWithoutServices.length != 0) {
        let servicesInNamespace = fetchAllResourcesOfKind(kubectl, constants_1.DiscoveryAndLoadBalancerResource.service);
        // workloads in manifests would not haave blue-green label, so remove them
        servicesInNamespace = removeBlueGreenSelectors(servicesInNamespace);
        servicesInNamespace.forEach(serviceObject => {
            // if it is an auxiliary service created in case of ingress or smi, do no route it
            if (!isAuxiliaryService(serviceObject)) {
                // if the service targets a workloadm, then route it
                if (isServiceRouted(serviceObject, deploymentsWithoutServices)) {
                    routedServices.push(serviceObject);
                    serviceNameMap.set(serviceObject.metadata.name, getBlueGreenResourceName(serviceObject.metadata.name, exports.GREEN_SUFFIX));
                }
            }
        });
    }
    return { routedServices: routedServices, serviceNameMap: serviceNameMap, unroutedServices: unroutedServices };
}
// get ingresses from manifests and namespace which target a routed service
function getIngressesToRoute(kubectl, ingressEntityList, serviceNameMap) {
    const routedIngresses = [];
    const unroutedIngresses = [];
    let serviceCheckList = new Map(serviceNameMap);
    ingressEntityList.forEach((ingressObject) => {
        let shouldWeRoute = false;
        // sees if ingress targets a routed service
        JSON.parse(JSON.stringify(ingressObject), (key, value) => {
            if (key === 'serviceName' && serviceCheckList.has(value)) {
                shouldWeRoute = true;
                serviceCheckList.delete(value);
            }
            return value;
        });
        if (shouldWeRoute) {
            routedIngresses.push(ingressObject);
        }
        else {
            unroutedIngresses.push(ingressObject);
        }
    });
    // if there are some routed services which do not have a corresponding ingress, try and find them in namespace
    if (serviceCheckList.size != 0) {
        let ingressInNamespace = fetchAllResourcesOfKind(kubectl, constants_1.DiscoveryAndLoadBalancerResource.ingress);
        ingressInNamespace.forEach(ingressObject => {
            let suffix = '';
            // if object have green label, then it would be targeting '-green' suffix services 
            if (isGreenObject(ingressObject)) {
                suffix = exports.GREEN_SUFFIX;
            }
            // if service name in backend ends with green
            let regex = new RegExp(suffix + '$');
            let shouldWeRoute = false;
            JSON.parse(JSON.stringify(ingressObject), (key, value) => {
                if (key.toUpperCase() === 'BACKEND') {
                    let serName = value.serviceName;
                    // based on regex, we find a routed service or an auxiliary service 
                    if (serviceCheckList.has(serName.replace(regex, ''))) {
                        shouldWeRoute = true;
                        // delete from checklist after it is found
                        serviceCheckList.delete(serName);
                    }
                }
                return value;
            });
            if (shouldWeRoute) {
                routedIngresses.push(ingressObject);
            }
        });
    }
    return { routedIngresses: routedIngresses, unroutedIngresses: unroutedIngresses };
}
function isGreenObject(inputObject) {
    let currentLabel = '';
    try {
        currentLabel = inputObject.metadata.labels[exports.BLUE_GREEN_VERSION_LABEL];
    }
    catch (_a) {
        // just a non blue green object
    }
    return currentLabel == exports.GREEN_LABEL_VALUE;
}
exports.isGreenObject = isGreenObject;
function removeBlueGreenSelectors(servicesInNamespace) {
    servicesInNamespace.forEach(serviceObject => {
        try {
            delete serviceObject.spec.selector[exports.BLUE_GREEN_VERSION_LABEL];
        }
        catch (err) {
            // do nothing
        }
    });
    return servicesInNamespace;
}
exports.removeBlueGreenSelectors = removeBlueGreenSelectors;
function isServiceRouted(serviceObject, deploymentEntityList) {
    let shouldBeRouted = false;
    const serviceSelector = getServiceSelector(serviceObject);
    if (!!serviceSelector) {
        if (deploymentEntityList.some((depObject) => {
            // finding if there is a deployment in the given manifests the service targets
            const matchLabels = getDeploymentMatchLabels(depObject);
            return (!!matchLabels && isServiceSelectorSubsetOfMatchLabel(serviceSelector, matchLabels));
        })) {
            shouldBeRouted = true;
        }
    }
    return shouldBeRouted;
}
exports.isServiceRouted = isServiceRouted;
function createWorkloadsWithLabel(kubectl, deploymentObjectList, nextLabel) {
    const newObjectsList = [];
    deploymentObjectList.forEach((inputObject) => {
        // creating deployment with label
        const newBlueGreenObject = getNewBlueGreenObject(inputObject, nextLabel);
        core.debug('New blue-green object is: ' + JSON.stringify(newBlueGreenObject));
        newObjectsList.push(newBlueGreenObject);
    });
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    const result = kubectl.apply(manifestFiles);
    return { 'result': result, 'newFilePaths': manifestFiles };
}
exports.createWorkloadsWithLabel = createWorkloadsWithLabel;
function getNewBlueGreenObject(inputObject, labelValue) {
    const newObject = JSON.parse(JSON.stringify(inputObject));
    // Updating name only if label is green label is given
    if (labelValue === exports.GREEN_LABEL_VALUE) {
        newObject.metadata.name = getBlueGreenResourceName(inputObject.metadata.name, exports.GREEN_SUFFIX);
    }
    // Adding labels and annotations
    addBlueGreenLabelsAndAnnotations(newObject, labelValue);
    return newObject;
}
exports.getNewBlueGreenObject = getNewBlueGreenObject;
function addBlueGreenLabelsAndAnnotations(inputObject, labelValue) {
    //creating the k8s.deploy.color label
    const newLabels = new Map();
    newLabels[exports.BLUE_GREEN_VERSION_LABEL] = labelValue;
    // updating object labels and selector labels
    helper.updateObjectLabels(inputObject, newLabels, false);
    helper.updateSelectorLabels(inputObject, newLabels, false);
    // updating spec labels if it is a service
    if (!helper.isServiceEntity(inputObject.kind)) {
        helper.updateSpecLabels(inputObject, newLabels, false);
    }
}
exports.addBlueGreenLabelsAndAnnotations = addBlueGreenLabelsAndAnnotations;
function getBlueGreenResourceName(name, suffix) {
    return `${name}${suffix}`;
}
exports.getBlueGreenResourceName = getBlueGreenResourceName;
function getDeploymentMatchLabels(deploymentObject) {
    if (!!deploymentObject && deploymentObject.kind.toUpperCase() == constants_1.KubernetesWorkload.pod.toUpperCase() && !!deploymentObject.metadata && !!deploymentObject.metadata.labels) {
        return deploymentObject.metadata.labels;
    }
    else if (!!deploymentObject && deploymentObject.spec && deploymentObject.spec.selector && deploymentObject.spec.selector.matchLabels) {
        return deploymentObject.spec.selector.matchLabels;
    }
    return null;
}
exports.getDeploymentMatchLabels = getDeploymentMatchLabels;
function getServiceSelector(serviceObject) {
    if (!!serviceObject && serviceObject.spec && serviceObject.spec.selector) {
        return serviceObject.spec.selector;
    }
    else
        return null;
}
exports.getServiceSelector = getServiceSelector;
function getAuxiliaryService(serviceObject, label) {
    let newObject = JSON.parse(JSON.stringify(serviceObject));
    let newLabels = new Map();
    newLabels[exports.BLUE_GREEN_AUXILIARY_LABEL] = TRUE_STRING;
    helper.updateObjectLabels(newObject, newLabels, false);
    newObject = removeClusterGeneratedFields(newObject);
    if (label === exports.NONE_LABEL_VALUE) {
        // adding stable suffix to service name
        newObject.metadata.name = getBlueGreenResourceName(serviceObject.metadata.name, exports.STABLE_SUFFIX);
        return getNewBlueGreenObject(newObject, exports.NONE_LABEL_VALUE);
    }
    else {
        // green label will be added for these
        return getNewBlueGreenObject(newObject, exports.GREEN_LABEL_VALUE);
    }
}
exports.getAuxiliaryService = getAuxiliaryService;
function removeClusterGeneratedFields(newObject) {
    // delete metadata
    try {
        delete newObject.metadata["creationTimestamp"];
    }
    catch (ex) {
        // do nothing
    }
    try {
        delete newObject.metadata["uid"];
    }
    catch (ex) {
        // do nothing
    }
    try {
        delete newObject.metadata["selfLink"];
    }
    catch (ex) {
        // do nothing
    }
    try {
        // remove clusterIP
        delete newObject.spec["clusterIP"];
    }
    catch (ex) {
        // do nothing
    }
    try {
        // remove any info of assigned loadBalancerIP
        delete newObject["status"];
    }
    catch (ex) {
        // do nothing
    }
    try {
        // remove any nodePort assignments
        newObject.spec.ports.forEach(element => {
            delete element["nodePort"];
        });
    }
    catch (ex) {
        // do nothing
    }
    return newObject;
}
function getSMIServiceResource(inputObject, suffix) {
    const newObject = JSON.parse(JSON.stringify(inputObject));
    if (suffix === exports.STABLE_SUFFIX) {
        // adding stable suffix to service name
        newObject.metadata.name = getBlueGreenResourceName(inputObject.metadata.name, exports.STABLE_SUFFIX);
        return getNewBlueGreenObject(newObject, exports.NONE_LABEL_VALUE);
    }
    else {
        // green label will be added for these
        return getNewBlueGreenObject(newObject, exports.GREEN_LABEL_VALUE);
    }
}
exports.getSMIServiceResource = getSMIServiceResource;
function isAuxiliaryService(serviceObject) {
    if (!!serviceObject && !!serviceObject.metadata && !!serviceObject.metadata.labels && !!serviceObject.metadata.labels[exports.BLUE_GREEN_AUXILIARY_LABEL]) {
        if (serviceObject.metadata.labels[exports.BLUE_GREEN_AUXILIARY_LABEL] == TRUE_STRING) {
            return true;
        }
    }
    return false;
}
function isServiceSelectorSubsetOfMatchLabel(serviceSelector, matchLabels) {
    let serviceSelectorMap = new Map();
    let matchLabelsMap = new Map();
    JSON.parse(JSON.stringify(serviceSelector), (key, value) => {
        serviceSelectorMap.set(key, value);
    });
    JSON.parse(JSON.stringify(matchLabels), (key, value) => {
        matchLabelsMap.set(key, value);
    });
    let isMatch = true;
    serviceSelectorMap.forEach((value, key) => {
        if (!!key && (!matchLabelsMap.has(key) || matchLabelsMap.get(key)) != value) {
            isMatch = false;
        }
    });
    return isMatch;
}
exports.isServiceSelectorSubsetOfMatchLabel = isServiceSelectorSubsetOfMatchLabel;
function fetchResource(kubectl, kind, name) {
    const result = kubectl.getResource(kind, name);
    if (result == null || !!result.stderr) {
        return null;
    }
    if (!!result.stdout) {
        const resource = JSON.parse(result.stdout);
        try {
            UnsetsClusterSpecficDetails(resource);
            return resource;
        }
        catch (ex) {
            core.debug('Exception occurred while Parsing ' + resource + ' in Json object');
            core.debug(`Exception:${ex}`);
        }
    }
    return null;
}
exports.fetchResource = fetchResource;
function fetchAllResourcesOfKind(kubectl, kind) {
    const result = kubectl.getAllResourcesOfKind(kind);
    if (result == null || !!result.stderr) {
        return null;
    }
    if (!!result.stdout) {
        const resources = JSON.parse(result.stdout);
        const returnList = [];
        try {
            resources['items'].forEach(element => {
                try {
                    UnsetsClusterSpecficDetails(element);
                    returnList.push(element);
                }
                catch (ex) {
                    core.debug('Exception occurred while Parsing ' + element + ' in Json object');
                    core.debug(`Exception:${ex}`);
                }
            });
        }
        catch (ex) {
            core.debug('Undefined resource kind' + kind);
            core.debug(`Exception:${ex}`);
        }
        return returnList;
    }
    return null;
}
exports.fetchAllResourcesOfKind = fetchAllResourcesOfKind;
function UnsetsClusterSpecficDetails(resource) {
    if (resource == null) {
        return;
    }
    // Unsets the cluster specific details in the object
    if (!!resource) {
        const metadata = resource.metadata;
        const status = resource.status;
        if (!!metadata) {
            const newMetadata = {
                'annotations': metadata.annotations,
                'labels': metadata.labels,
                'name': metadata.name
            };
            resource.metadata = newMetadata;
        }
        if (!!status) {
            resource.status = {};
        }
    }
}
