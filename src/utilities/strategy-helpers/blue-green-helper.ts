'use strict';

import * as core from '@actions/core';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { checkForErrors, sleep } from '../utility';
import { Kubectl } from '../../kubectl-object-model';
import { KubernetesWorkload, DiscoveryAndLoadBalancerResource } from '../../constants';
import * as fileHelper from '../files-helper';
import * as helper from '../resource-object-utility';
import * as TaskInputParameters from '../../input-parameters';
import { routeBlueGreenService } from './service-blue-green-helper';
import { routeBlueGreenIngress } from './ingress-blue-green-helper';
import { routeBlueGreenSMI } from './smi-blue-green-helper';

export const BLUE_GREEN_DEPLOYMENT_STRATEGY = 'BLUE-GREEN';
export const GREEN_LABEL_VALUE = 'green';
export const NONE_LABEL_VALUE = 'None';
export const BLUE_GREEN_VERSION_LABEL = 'k8s.deploy.color';
export const BLUE_GREEN_AUXILIARY_LABEL = 'k8s.deploy.auxiliary';
export const GREEN_SUFFIX = '-green';
export const STABLE_SUFFIX = '-stable'
const TRUE_STRING = 'True';

export function isBlueGreenDeploymentStrategy() {
    const deploymentStrategy = TaskInputParameters.deploymentStrategy;
    return deploymentStrategy && deploymentStrategy.toUpperCase() === BLUE_GREEN_DEPLOYMENT_STRATEGY;
}

export function isIngressRoute(): boolean {
    const routeMethod = TaskInputParameters.routeMethod;
    return routeMethod && routeMethod.toUpperCase() === DiscoveryAndLoadBalancerResource.ingress.toUpperCase();
}

export function isSMIRoute(): boolean {
    const routeMethod = TaskInputParameters.routeMethod;
    return routeMethod && routeMethod.toUpperCase() === DiscoveryAndLoadBalancerResource.smi.toUpperCase();
}

export async function routeBlueGreen(kubectl: Kubectl, manifestObjects: any) {
    // get buffer time
    let bufferTime: number = parseInt(TaskInputParameters.versionSwitchBuffer);

    //logging start of buffer time
    let dateNow = new Date();
    console.log(`Starting buffer time of ${bufferTime} minute(s) at ${dateNow.toISOString()}`);
    // waiting
    await sleep(bufferTime*1000*60);
    // logging end of buffer time
    dateNow = new Date();
    console.log(`Stopping buffer time of ${bufferTime} minute(s) at ${dateNow.toISOString()}`);
    
    // routing to new deployments
    if (isIngressRoute()) {
        routeBlueGreenIngress(kubectl, GREEN_LABEL_VALUE, manifestObjects.serviceNameMap, manifestObjects.ingressEntityList);    
    } else if (isSMIRoute()) {
        routeBlueGreenSMI(kubectl,  GREEN_LABEL_VALUE, manifestObjects.serviceEntityList);
    } else {
        routeBlueGreenService(kubectl, GREEN_LABEL_VALUE, manifestObjects.serviceEntityList);
    }
}


export function deleteWorkloadsWithLabel(kubectl: Kubectl, deleteLabel: string, deploymentEntityList: any[]) {
    let resourcesToDelete = []
    deploymentEntityList.forEach((inputObject) => {
        const name = inputObject.metadata.name;
        const kind = inputObject.kind;
        if (deleteLabel === NONE_LABEL_VALUE) {
            // if dellabel is none, deletes stable deployments
            const resourceToDelete = { name : name, kind : kind};
            resourcesToDelete.push(resourceToDelete);
        } else {
            // if dellabel is not none, then deletes new green deployments
            const resourceToDelete = { name : getBlueGreenResourceName(name, GREEN_SUFFIX), kind : kind };
            resourcesToDelete.push(resourceToDelete);
        }
    });

    // deletes the deployments
    deleteObjects(kubectl, resourcesToDelete);
}

export function deleteWorkloadsAndServicesWithLabel(kubectl: Kubectl, deleteLabel: string, deploymentEntityList: any[], serviceEntityList: any[]) {
    // need to delete services and deployments
    const deletionEntitiesList = deploymentEntityList.concat(serviceEntityList);
    let resourcesToDelete = []
    deletionEntitiesList.forEach((inputObject) => {
        const name = inputObject.metadata.name;
        const kind = inputObject.kind;
        if (deleteLabel === NONE_LABEL_VALUE) {
            // if not dellabel, delete stable objects
            const resourceToDelete = { name : name, kind : kind};
            resourcesToDelete.push(resourceToDelete);
        } else {
            // else delete green labels
            const resourceToDelete = { name : getBlueGreenResourceName(name, GREEN_SUFFIX), kind : kind };
            resourcesToDelete.push(resourceToDelete);
        }
    });
    deleteObjects(kubectl, resourcesToDelete);
}

export function deleteObjects(kubectl: Kubectl, deleteList: any[]) {
    // delete services and deployments
    deleteList.forEach((delObject) => {
        try {
            const result = kubectl.delete([delObject.kind, delObject.name]);
            checkForErrors([result]);
        } catch (ex) {
            // Ignore failures of delete if doesn't exist
        }
    });
}

export function getSuffix(label: string): string {
    if(label === GREEN_LABEL_VALUE) {
        return GREEN_SUFFIX
    } else {
        return '';
    }
}

export function getManifestObjects (kubectl: Kubectl, filePaths: string[]): BlueGreenManifests {
    const deploymentEntityList = [];
    const serviceEntityList = [];
    const ingressEntityList = [];
    const otherEntitiesList = [];
    filePaths.forEach((filePath: string) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {
            if(!!inputObject) {
                const kind = inputObject.kind;
                if (helper.isDeploymentEntity(kind)) {
                    deploymentEntityList.push(inputObject);
                } else if (helper.isServiceEntity(kind)) {
                    serviceEntityList.push(inputObject);
                } else if (helper.isIngressEntity(kind)) {
                    ingressEntityList.push(inputObject);
                } else {
                    otherEntitiesList.push(inputObject);
                }
            }
        });
    })

    const allServiceEntities = getServicesToRoute(kubectl, deploymentEntityList, serviceEntityList); 
    const allIngressEntities = getIngressesToRoute(kubectl, ingressEntityList, allServiceEntities.serviceNameMap);

    return { serviceEntityList: allServiceEntities.routedServices, serviceNameMap: allServiceEntities.serviceNameMap, unroutedServiceEntityList: allServiceEntities.unroutedServices, deploymentEntityList: deploymentEntityList, ingressEntityList: allIngressEntities.routedIngresses, unroutedIngressEntityList: allIngressEntities.unroutedIngresses, otherObjects: otherEntitiesList };
}

// find services in manifests and namespace  which need to be routed for a corresponding workload in manifest
function getServicesToRoute(kubectl: Kubectl, deploymentEntityList: any[], serviceEntityList: any[]) {
    // finding services without selectors
    const unroutedServices = [];
    const servicesWithSelectors = [];    
    serviceEntityList.forEach((serviceObject) => {
        const serviceSelector = getServiceSelector(serviceObject);
        if (!!serviceSelector) {
            servicesWithSelectors.push(serviceObject);
        } else {
            unroutedServices.push(serviceObject);
        }
    })

    const routedServices = [];
    let serviceNameMap = new Map<string, string>();
    const deploymentsWithoutServices = [];
    // find any workloads that are not routed
    deploymentEntityList.forEach(deploymentObject => {
        const deploymentMatchLabels: any = getDeploymentMatchLabels(deploymentObject);
        if (!!deploymentMatchLabels) {
            let isDeploymentRouted: boolean = false;
            servicesWithSelectors.forEach((serviceObject) => {
                const serviceSelector: any = getServiceSelector(serviceObject);
                if (isServiceSelectorSubsetOfMatchLabel(serviceSelector, deploymentMatchLabels)) {
                    // if service targets a workload and has not been already added to routed list, add it
                    if (!serviceNameMap.has(serviceObject.metadata.name)) {
                        routedServices.push(serviceObject);
                        serviceNameMap.set(serviceObject.metadata.name, getBlueGreenResourceName(serviceObject.metadata.name, GREEN_SUFFIX));
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
        let servicesInNamespace = fetchAllResourcesOfKind(kubectl, DiscoveryAndLoadBalancerResource.service);
        // workloads in manifests would not haave blue-green label, so remove them
        servicesInNamespace = removeBlueGreenSelectors(servicesInNamespace);
        servicesInNamespace.forEach(serviceObject => {
            // if it is an auxiliary service created in case of ingress or smi, do no route it
            if (!isAuxiliaryService(serviceObject)) {
                // if the service targets a workloadm, then route it
                if (isServiceRouted(serviceObject, deploymentsWithoutServices)) {
                    routedServices.push(serviceObject);
                    serviceNameMap.set(serviceObject.metadata.name, getBlueGreenResourceName(serviceObject.metadata.name, GREEN_SUFFIX));
                }
            }
        })
    }

    return { routedServices: routedServices, serviceNameMap: serviceNameMap, unroutedServices: unroutedServices }
}

// get ingresses from manifests and namespace which target a routed service
function getIngressesToRoute(kubectl: Kubectl, ingressEntityList: any[], serviceNameMap: Map<string, string>) {
    const routedIngresses = [];
    const unroutedIngresses = [];
    let serviceCheckList = new Map(serviceNameMap);
    ingressEntityList.forEach((ingressObject) => {
        let shouldWeRoute: boolean = false;
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
        } else {
            unroutedIngresses.push(ingressObject);
        }
    });

    // if there are some routed services which do not have a corresponding ingress, try and find them in namespace
    if (serviceCheckList.size != 0) {
        let ingressInNamespace = fetchAllResourcesOfKind(kubectl, DiscoveryAndLoadBalancerResource.ingress); 
        ingressInNamespace.forEach(ingressObject => {
            let suffix = '';
            // if object have green label, then it would be targeting '-green' suffix services 
            if (isGreenObject(ingressObject)) {
                suffix = GREEN_SUFFIX;
            }
            // if service name in backend ends with green
            let regex = new RegExp(suffix+'$');
            let shouldWeRoute = false;
            JSON.parse(JSON.stringify(ingressObject), (key, value) => {
                if(key.toUpperCase() === 'BACKEND') {
                    let serName: string = value.serviceName;
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
    return { routedIngresses: routedIngresses, unroutedIngresses: unroutedIngresses }
}

export function isGreenObject(inputObject: any): boolean {
    let currentLabel = '';
    try {
        currentLabel = inputObject.metadata.labels[BLUE_GREEN_VERSION_LABEL];
    } catch {
        // just a non blue green object
    }
    return currentLabel == GREEN_LABEL_VALUE 
}

export interface BlueGreenManifests {
    serviceEntityList: any[], 
    serviceNameMap: Map<string, string>, 
    unroutedServiceEntityList: any[], 
    deploymentEntityList: any[], 
    ingressEntityList: any[], 
    unroutedIngressEntityList: any[],
    otherObjects: any[] 
}

export function removeBlueGreenSelectors(servicesInNamespace: any[]): any[] {
    servicesInNamespace.forEach(serviceObject => {
        try {
            delete serviceObject.spec.selector[BLUE_GREEN_VERSION_LABEL];
        } catch(err) {
            // do nothing
        }
    });
    return servicesInNamespace;
}

export function isServiceRouted(serviceObject: any[], deploymentEntityList: any[]): boolean {
    let shouldBeRouted: boolean = false;
    const serviceSelector: any = getServiceSelector(serviceObject);
    if (!!serviceSelector) {
        if (deploymentEntityList.some((depObject) => {
            // finding if there is a deployment in the given manifests the service targets
            const matchLabels: any = getDeploymentMatchLabels(depObject); 
            return (!!matchLabels && isServiceSelectorSubsetOfMatchLabel(serviceSelector, matchLabels)) 
        })) {
            shouldBeRouted = true;
        }
    }
    return shouldBeRouted;
}

export function createWorkloadsWithLabel(kubectl: Kubectl, deploymentObjectList: any[], nextLabel: string) {
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

export function getNewBlueGreenObject(inputObject: any, labelValue: string): object {
    const newObject = JSON.parse(JSON.stringify(inputObject));

    // Updating name only if label is green label is given
    if (labelValue === GREEN_LABEL_VALUE) {
        newObject.metadata.name = getBlueGreenResourceName(inputObject.metadata.name, GREEN_SUFFIX);
    }

    // Adding labels and annotations
    addBlueGreenLabelsAndAnnotations(newObject, labelValue);

    return newObject;
}

export function addBlueGreenLabelsAndAnnotations(inputObject: any, labelValue: string) {
    //creating the k8s.deploy.color label
    const newLabels = new Map<string, string>();
    newLabels[BLUE_GREEN_VERSION_LABEL] = labelValue;

    // updating object labels and selector labels
    helper.updateObjectLabels(inputObject, newLabels, false);
    helper.updateSelectorLabels(inputObject, newLabels, false);

    // updating spec labels if it is a service
    if (!helper.isServiceEntity(inputObject.kind)) {
        helper.updateSpecLabels(inputObject, newLabels, false);
    }
}

export function getBlueGreenResourceName(name: string, suffix: string) {
    return `${name}${suffix}`;
}

export function getDeploymentMatchLabels(deploymentObject: any): any {
    if (!!deploymentObject && deploymentObject.kind.toUpperCase()==KubernetesWorkload.pod.toUpperCase() &&  !!deploymentObject.metadata && !!deploymentObject.metadata.labels) {
        return deploymentObject.metadata.labels;
    } else if (!!deploymentObject && deploymentObject.spec && deploymentObject.spec.selector && deploymentObject.spec.selector.matchLabels) {
        return deploymentObject.spec.selector.matchLabels;
    }
    return null;
}

export function getServiceSelector(serviceObject: any): any {
    if (!!serviceObject && serviceObject.spec && serviceObject.spec.selector) {
        return serviceObject.spec.selector;
    } else return null;
}

export function getAuxiliaryService(serviceObject: any, label: string): any {
    let newObject = JSON.parse(JSON.stringify(serviceObject));
    let newLabels = new Map<string, string>();
    newLabels[BLUE_GREEN_AUXILIARY_LABEL] = TRUE_STRING;
    helper.updateObjectLabels(newObject, newLabels, false);

    newObject = removeClusterGeneratedFields(newObject);

    if (label === NONE_LABEL_VALUE) {
        // adding stable suffix to service name
        newObject.metadata.name = getBlueGreenResourceName(serviceObject.metadata.name, STABLE_SUFFIX)
        return getNewBlueGreenObject(newObject, NONE_LABEL_VALUE);
    } else {
        // green label will be added for these
        return getNewBlueGreenObject(newObject, GREEN_LABEL_VALUE);
    }
}

function removeClusterGeneratedFields(newObject: any): any{
    // delete metadata
    try {
    delete newObject.metadata["creationTimestamp"];
    } catch(ex) {
    // do nothing
    }
    try {
    delete newObject.metadata["uid"];
    } catch(ex) {
    // do nothing
    }
    try {
    delete newObject.metadata["selfLink"];
    } catch(ex) {
    // do nothing
    }

    try {
    // remove clusterIP
    delete newObject.spec["clusterIP"];
    } catch(ex) {
    // do nothing
    }

    try {
    // remove any info of assigned loadBalancerIP
    delete newObject["status"];
    } catch(ex) {
    // do nothing
    }

    try {
    // remove any nodePort assignments
    newObject.spec.ports.forEach(element => {
    delete element["nodePort"];    
    });
    } catch(ex) {
    // do nothing
    }

    return newObject;
}

export function getSMIServiceResource(inputObject: any, suffix: string): object {
    const newObject = JSON.parse(JSON.stringify(inputObject));
    if (suffix === STABLE_SUFFIX) {
        // adding stable suffix to service name
        newObject.metadata.name = getBlueGreenResourceName(inputObject.metadata.name, STABLE_SUFFIX)
        return getNewBlueGreenObject(newObject, NONE_LABEL_VALUE);
    } else {
        // green label will be added for these
        return getNewBlueGreenObject(newObject, GREEN_LABEL_VALUE);
    }
}

function isAuxiliaryService(serviceObject: any): boolean {
    if (!!serviceObject && !!serviceObject.metadata && !!serviceObject.metadata.labels && !!serviceObject.metadata.labels[BLUE_GREEN_AUXILIARY_LABEL]) {
        if (serviceObject.metadata.labels[BLUE_GREEN_AUXILIARY_LABEL] == TRUE_STRING) {
            return true;
        }
    } 
    return false;
}

export function isServiceSelectorSubsetOfMatchLabel(serviceSelector: any, matchLabels: any): boolean {
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

export function fetchResource(kubectl: Kubectl, kind: string, name: string) {
    const result = kubectl.getResource(kind, name);
    if (result == null || !!result.stderr) {
        return null;
    }

    if (!!result.stdout) {
        const resource = JSON.parse(result.stdout);
        try {
            UnsetsClusterSpecficDetails(resource);
            return resource;
        } catch (ex) {
            core.debug('Exception occurred while Parsing ' + resource + ' in Json object');
            core.debug(`Exception:${ex}`);
        }
    }
    return null;
}

export function fetchAllResourcesOfKind(kubectl: Kubectl, kind: string) {
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
                    returnList.push(element)
                } catch (ex) {
                    core.debug('Exception occurred while Parsing ' + element + ' in Json object');
                    core.debug(`Exception:${ex}`);
                }
            });
        } catch (ex) {
            core.debug('Undefined resource kind' + kind);
            core.debug(`Exception:${ex}`);
        }
        return returnList;
    }
    return null;
}

function UnsetsClusterSpecficDetails(resource: any) {
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