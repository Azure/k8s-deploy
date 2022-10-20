import os
import sys
import json

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

    # reformat list-like parameters (eg, paramName=value1,value2,value3)
    if ingressServicesKey in argsDict:
        argsDict[ingressServicesKey] = argsDict[ingressServicesKey].split(",")

    return argsDict


def stringListToDict(args: list[str], separator: str):
    parsedArgs = {}
    for arg in args:
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
        deployment['spec']['selector']['matchLabels'], parsedArgs[selectorLabelsKey])
    if not dictMatch:
        return dictMatch, msg

    if labelsKey in parsedArgs:
        dictMatch, msg = compareDicts(
            deployment['metadata']['labels'], parsedArgs[labelsKey])
        if not dictMatch:
            return dictMatch, msg

    if annotationsKey in parsedArgs:
        dictMatch, msg = compareDicts(
            deployment['metadata']['annotations'], parsedArgs[annotationsKey])
        if not dictMatch:
            return dictMatch, msg

    return True, ""


def verifyService(service, parsedArgs):
    # test selector labels, labels, annotations
    if not selectorLabelsKey in parsedArgs:
        raise ValueError(
            f"expected selector labels not provided to inspect service {parsedArgs[nameKey]}")
    dictMatch, msg = compareDicts(
        service['spec']['selector'], parsedArgs[selectorLabelsKey])
    if not dictMatch:
        return dictMatch, msg

    if labelsKey in parsedArgs:
        dictMatch, msg = compareDicts(
            service['metadata']['labels'], parsedArgs[labelsKey])
        if not dictMatch:
            return dictMatch, msg

    if annotationsKey in parsedArgs:
        dictMatch, msg = compareDicts(
            service['metadata']['annotations'], parsedArgs[annotationsKey])
        if not dictMatch:
            return dictMatch, msg


def verifyIngress(ingress, parsedArgs):
    # test services in paths
    if not ingressServicesKey in parsedArgs:
        raise ValueError(
            f"expected services not provided to inspect ingress {parsedArgs[nameKey]}")

    expectedIngresses = parsedArgs[ingressServicesKey]
    for i in range(k8s_object['spec']['rules'][0]['http']['paths']):
        svcName = k8s_object['spec']['rules'][0]['http']['paths'][i]['backend']['serviceName']
        if svcName != expectedIngresses[i]:
            return False, f"for ingress {parsedArgs[nameKey]} expected svc name {expectedIngresses[i]} at position {i} but got {svcName}"

    return True, ""


def verifyTs(tsObj, percentages):
    actual = tsObj  # fill out the rest of this


def compareDicts(actual: dict, expected: dict):
    actualKeys = actual.keys()
    expectedKeys = actual.keys()

    if not actualKeys == expectedKeys:
        return False, f'dicts had different keys.\n actual keys: {actualKeys}\n expected keys: {expectedKeys}'
    for key in actualKeys:
        if not actual[key] == expected[key]:
            return False, f'dicts differed at key {key}.\n actual[{key}] is {actual[key]} and expected[{key}] is {expected[key]}'

    return True, ""


def main():
    parsedArgs: dict = parseArgs(sys.argv[1:])
    RESULT = False
    msg = "placeholder"
    k8_object = None

    kind = parsedArgs[kindKey]
    name = parsedArgs[nameKey]
    namespace = f"test-{parsedArgs[namespaceKey]}"
    print('kubectl get '+kind+' '+name+' -n '+namespace+' -o json')

    try:
        k8_object = json.load(os.popen('kubectl get '+kind +
                              ' '+name+' -n '+namespace+' -o json'))
    except:
        sys.exit(kind+' '+name+' not created or not found')

    if kind == 'Deployment':
        RESULT, msg = verifyDeployment(
            k8_object, parsedArgs)
    if kind == 'Service':
        RESULT, msg = verifyDeployment(
            k8_object, parsedArgs)
    if kind == 'Ingress':
        RESULT, msg = verifyIngress(k8_object, parsedArgs)

    if not RESULT:
        sys.exit(f"{kind} {name} failed check: {msg}")
    print('Test passed')


if __name__ == "__main__":
    sys.exit(main())
