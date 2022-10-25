from operator import truediv
import os
import sys
import json
from unicodedata import name

# Multiline comment here about
# how tests work/how to format args
# args will be formatted like labels=testkey:testValue,otherKey=otherValue
# or for singular ones, just with containerName=container

# TODO - finish parsing, take out color entirely, reformat current tests to use new arg structure
# then add extra deploy/promote/deploy step right before reject at the end for all of them, including
# checks for TrafficSplits

kindKey = "kind"
nameKey = "name"
containerKey = "containerName"
labelsKey = "labels"
annotationsKey = "annotations"
selectorLabelsKey = "selectorLabels"
namespaceKey = "namespace"
ingressServicesKey = "ingressServices"
tsServicesKey = "tsServices"


def parseArgs(sysArgs):
    argsDict = stringListToDict(sysArgs, "=")

    # mandatory parameters
    if not kindKey in argsDict:
        raise ValueError(f"missing key: {kindKey}")

    if not nameKey in argsDict:
        raise ValueError(f"missing key: {nameKey}")

    if not namespaceKey in argsDict:
        raise ValueError(f"missing key: {namespaceKey}")

    # reformat map-like parameters (eg, paramName=key1:value1,key2:value2)
    if labelsKey in argsDict:
        argsDict[labelsKey] = stringListToDict(
            argsDict[labelsKey].split(","), ":")

    if annotationsKey in argsDict:
        argsDict[annotationsKey] = stringListToDict(
            argsDict[annotationsKey].split(","), ":")

    if selectorLabelsKey in argsDict:
        argsDict[selectorLabelsKey] = stringListToDict(
            argsDict[selectorLabelsKey].split(","), ":")

    if tsServicesKey in argsDict:
        argsDict[tsServicesKey] = stringListToDict(
            argsDict[tsServicesKey].split(","), ":")

        for key in argsDict[tsServicesKey]:
            argsDict[tsServicesKey][key] = int(argsDict[tsServicesKey][key])

    # reformat list-like parameters (eg, paramName=value1,value2,value3)
    if ingressServicesKey in argsDict:
        argsDict[ingressServicesKey] = argsDict[ingressServicesKey].split(",")

    return argsDict


def stringListToDict(args: list[str], separator: str):
    parsedArgs = {}
    for arg in args:
        print(f"parsing arg {arg}")
        argSplit = arg.split(separator)
        parsedArgs[argSplit[0]] = argSplit[1]

    return parsedArgs


def verifyDeployment(deployment, parsedArgs):
    # test container image, labels, annotations, selector labels
    if not containerKey in parsedArgs:
        raise ValueError(
            f"expected container image name not provided to inspect deployment {parsedArgs[nameKey]}")

    actualImageName = deployment['spec']['template']['spec']['containers'][0]['image']
    if not actualImageName == parsedArgs[containerKey]:
        return False, f"expected container image name {parsedArgs[containerKey]} but got {actualImageName} instead"

    if not selectorLabelsKey in parsedArgs:
        raise ValueError(
            f"expected selector labels not provided to inspect deployment {parsedArgs[nameKey]}")
    dictMatch, msg = compareDicts(
        deployment['spec']['selector']['matchLabels'], parsedArgs[selectorLabelsKey], selectorLabelsKey)
    if not dictMatch:
        return dictMatch, msg

    if labelsKey in parsedArgs:
        dictMatch, msg = compareDicts(
            deployment['metadata']['labels'], parsedArgs[labelsKey], labelsKey)
        if not dictMatch:
            return dictMatch, msg

    if annotationsKey in parsedArgs:
        dictMatch, msg = compareDicts(
            deployment['metadata']['annotations'], parsedArgs[annotationsKey], annotationsKey)
        if not dictMatch:
            return dictMatch, msg

    return True, ""


def verifyService(service, parsedArgs):
    # test selector labels, labels, annotations
    if not selectorLabelsKey in parsedArgs:
        raise ValueError(
            f"expected selector labels not provided to inspect service {parsedArgs[nameKey]}")
    dictMatch, msg = compareDicts(
        service['spec']['selector'], parsedArgs[selectorLabelsKey], selectorLabelsKey)
    if not dictMatch:
        return dictMatch, msg

    if labelsKey in parsedArgs:
        print(f" service is {service}")
        dictMatch, msg = compareDicts(
            service['metadata']['labels'], parsedArgs[labelsKey], labelsKey)
        if not dictMatch:
            return dictMatch, msg

    if annotationsKey in parsedArgs:
        dictMatch, msg = compareDicts(
            service['metadata']['annotations'], parsedArgs[annotationsKey], annotationsKey)
        if not dictMatch:
            return dictMatch, msg

    return True, ""


def verifyIngress(ingress, parsedArgs):
    # test services in paths
    if not ingressServicesKey in parsedArgs:
        raise ValueError(
            f"expected services not provided to inspect ingress {parsedArgs[nameKey]}")

    expectedIngresses = parsedArgs[ingressServicesKey]
    for i in range(len(ingress['spec']['rules'][0]['http']['paths'])):
        print(
            f"service obj is {ingress['spec']['rules'][0]['http']['paths'][i]}")
        svcName = ingress['spec']['rules'][0]['http']['paths'][i]['backend']['serviceName']
        if svcName != expectedIngresses[i]:
            return False, f"for ingress {parsedArgs[nameKey]} expected svc name {expectedIngresses[i]} at position {i} but got {svcName}"

    return True, ""


def verifyTSObject(tsObj, parsedArgs):
    if not tsServicesKey in parsedArgs:
        raise ValueError(
            f"expected services not provided to inspect ts object {parsedArgs[nameKey]}")

    expectedServices = parsedArgs[tsServicesKey]
    actualServices = {}
    backends = tsObj['spec']['backends']
    for i in range(len(backends)):
        svcName = backends[i]['service']
        svcWeight = int(backends[i]['weight'])
        actualServices[svcName] = svcWeight

    dictResult, msg = compareDicts(
        actualServices, expectedServices, tsServicesKey)
    if not dictResult:
        return False, msg

    return True, ""


def compareDicts(actual: dict, expected: dict, paramName=""):
    actualKeys = actual.keys()
    expectedKeys = expected.keys()

    if not actualKeys == expectedKeys:
        msg = f'dicts had different keys.\n actual: {actual}\n expected: {expected}'
        if not paramName == "":
            msg = f"for param {paramName}, " + msg
        return False, msg
    for key in actualKeys:
        if not actual[key] == expected[key]:
            msg = f'dicts differed at key {key}.\n actual[{key}] is {actual[key]} and expected[{key}] is {expected[key]}'
            if not paramName == "":
                msg = f"for param {paramName}, " + msg
            return False, msg

    return True, ""


def main():
    parsedArgs: dict = parseArgs(sys.argv[1:])
    RESULT = False
    msg = "unknown type (no verification method currently exists)"
    k8_object = None

    kind = parsedArgs[kindKey]
    name = parsedArgs[nameKey]
    namespace = f"test-{parsedArgs[namespaceKey]}"
    print('kubectl get '+kind+' '+name+' -n '+namespace+' -o json')

    try:
        k8_object = json.load(os.popen('kubectl get '+kind +
                              ' '+name+' -n '+namespace+' -o json'))

        if k8_object == None:
            raise ValueError(f"{kind} {name} was not found")
    except:
        msg = kind+' '+name+' not created or not found'
        foundObjects = json.load(
            os.popen('kubectl get '+kind+' -n '+namespace+' -o json'))
        suffix = f"resources of type {kind}: {foundObjects}"
        sys.exit(msg + suffix)

    if kind == 'Deployment':
        RESULT, msg = verifyDeployment(
            k8_object, parsedArgs)
    if kind == 'Service':
        RESULT, msg = verifyService(
            k8_object, parsedArgs)
    if kind == 'Ingress':
        RESULT, msg = verifyIngress(k8_object, parsedArgs)
    if kind == "TrafficSplit":
        RESULT, msg = verifyTSObject(k8_object, parsedArgs)

    if not RESULT:
        sys.exit(f"{kind} {name} failed check: {msg}")

    print('Test passed')


if __name__ == "__main__":
    sys.exit(main())
