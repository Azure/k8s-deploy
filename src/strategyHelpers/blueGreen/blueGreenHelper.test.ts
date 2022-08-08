import * as core from '@actions/core'
import {deployWithLabel, deleteGreenObjects, fetchResource, getDeploymentMatchLabels, getManifestObjects, getNewBlueGreenObject, GREEN_LABEL_VALUE, isServiceRouted} from './blueGreenHelper'
import * as bgHelper from './blueGreenHelper'
import { Kubectl } from '../../types/kubectl'
import * as fileHelper from '../../utilities/fileUtils'
import { K8sObject } from '../../types/k8sObject'
import * as manifestUpdateUtils from '../../utilities/manifestUpdateUtils'
import { ExecOutput } from "@actions/exec";

jest.mock('../../types/kubectl')
let testObjects
const kubectl = new Kubectl('')

describe('bluegreenhelper functions', () => {
    beforeEach(() => {
        //@ts-ignore
        Kubectl.mockClear()
        testObjects = getManifestObjects(['test/unit/manifests/test-ingress.yml'])

        jest.spyOn(fileHelper, 'writeObjectsToFile').mockImplementationOnce(() => [''])
    })

    test('correctly deletes services and workloads according to label', () => {
        
        jest.spyOn(bgHelper, 'deleteObjects').mockReturnValue({} as Promise<void>)

        const objectsToDelete = deleteGreenObjects(kubectl, testObjects.deploymentEntityList.concat(testObjects.serviceEntityList))
        objectsToDelete.then((value) => {
            expect(value).toHaveLength(2)
            expect(value).toContainEqual({name: 'nginx-service-green', kind: 'Service'})
            expect(value).toContainEqual({name: 'nginx-deployment-green', kind: 'Deployment'})
        })
        
    })

    test('parses objects correctly from one file (getManifestObjects)', () => {

        expect(testObjects.deploymentEntityList[0].kind).toBe('Deployment')
        expect(testObjects.serviceEntityList[0].kind).toBe('Service')
        expect(testObjects.ingressEntityList[0].kind).toBe('Ingress')
    
        expect(testObjects.deploymentEntityList[0].spec.selector.matchLabels.app).toBe('nginx')
    })

    test('parses other kinds of objects (getManifestObjects)', () => {
        const otherObjectsCollection = getManifestObjects(['test/unit/manifests/anomaly-objects-test.yml'])
        expect(otherObjectsCollection.unroutedServiceEntityList[0].metadata.name).toBe('unrouted-service')
        expect(otherObjectsCollection.otherObjects[0].metadata.name).toBe('foobar-rollout')
    })
    
    test('correctly classifies routed services', () => {
        expect(isServiceRouted(testObjects.serviceEntityList[0], testObjects.deploymentEntityList)).toBe(true)
        testObjects.serviceEntityList[0].spec.selector.app = 'fakeapp'
        expect(isServiceRouted(testObjects.serviceEntityList[0], testObjects.deploymentEntityList)).toBe(false)
    })

    test('correctly makes labeled workloads', () => {
        const cwlResult: Promise<bgHelper.BlueGreenDeployment> = deployWithLabel(kubectl, testObjects.deploymentEntityList, GREEN_LABEL_VALUE)
        cwlResult.then((value) => {
            expect(value.deployResult.manifestFiles[0]).toBe('')
        })
    })

    test('correctly makes new blue green object (getNewBlueGreenObject and addBlueGreenLabelsAndAnnotations)', () => {
        const modifiedDeployment = getNewBlueGreenObject(testObjects.deploymentEntityList[0], GREEN_LABEL_VALUE)
        
        expect(modifiedDeployment.metadata.name).toBe('nginx-deployment-green')
        expect(modifiedDeployment.metadata.labels['k8s.deploy.color']).toBe('green')

        const modifiedSvc = getNewBlueGreenObject(testObjects.serviceEntityList[0], GREEN_LABEL_VALUE)

        expect(modifiedSvc.metadata.name).toBe('nginx-service-green')
        expect(modifiedSvc.metadata.labels['k8s.deploy.color']).toBe('green')

    })

    test('correctly fetches k8s objects', async () => {
        const mockExecOutput = {stderr: '', stdout: JSON.stringify(testObjects.deploymentEntityList[0]), exitCode: 0}

        jest.spyOn(kubectl, 'getResource').mockImplementation(() => Promise.resolve(mockExecOutput))
        const fetched = await fetchResource(kubectl, 'nginx-deployment', 'Deployment')
        expect(fetched.metadata.name).toBe('nginx-deployment')

    })

    test('exits when fails to fetch k8s objects', async () => {
        const mockExecOutput = ({stdout: 'this should not matter', exitCode: 0, stderr: 'this is a fake error'} as ExecOutput)
        jest.spyOn(kubectl, 'getResource').mockImplementation(() => Promise.resolve(mockExecOutput))
        let fetched = await fetchResource(kubectl, 'nginx-deployment', 'Deployment')
        expect(fetched).toBe(null)

        jest.spyOn(kubectl, 'getResource').mockImplementation()
        fetched = await fetchResource(kubectl, 'nginx-deployment', 'Deployment')
        expect(fetched).toBe(null)

    })

    test('returns null when fetch fails to unset k8s objects', async () => {
        const mockExecOutput = ({stdout: 'this should not matter', exitCode: 0, stderr: 'this is a fake error'} as ExecOutput)
        jest.spyOn(manifestUpdateUtils, 'UnsetClusterSpecificDetails').mockImplementation(() => {throw new Error('test error')})
        expect(await fetchResource(kubectl, 'nginx-deployment', 'Deployment')).toBe(null)
    })



    test('gets deployment labels',  () => {
        const mockLabels = new Map<string, string>()
        mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] = GREEN_LABEL_VALUE
        const mockPodObject: K8sObject = {kind: 'Pod', metadata: {name: 'testPod', labels: mockLabels}, spec: {} }
        expect(getDeploymentMatchLabels(mockPodObject)[bgHelper.BLUE_GREEN_VERSION_LABEL]).toBe(GREEN_LABEL_VALUE)
        expect(getDeploymentMatchLabels(testObjects.deploymentEntityList[0])['app']).toBe('nginx')
    })
})