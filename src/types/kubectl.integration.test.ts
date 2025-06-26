import {Kubectl} from './kubectl'
import * as exec from '@actions/exec'
import * as fs from 'fs'
import * as yaml from 'js-yaml'

jest.setTimeout(30000)

describe('Kubectl integration tests', () => {
    const kubectlPath = 'kubectl'
    const namespace1 = 'integration-test-namespace1'
    const namespace2 = 'integration-test-namespace2'
    const testManifestWithNamespace = './test-deployment-with-namespace.yaml'
    const testManifestWithoutNamespace =
        './test-deployment-without-namespace.yaml'

    beforeAll(async () => {
        // Create namespaces
        await exec.exec(kubectlPath, ['create', 'namespace', namespace1])
        await exec.exec(kubectlPath, ['create', 'namespace', namespace2])

        // Create test manifests
        const manifestWithNamespace = {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
            name: 'test-deployment',
            namespace: namespace1 // Namespace specified
            },
            spec: {
            replicas: 1,
            selector: {matchLabels: {app: 'test-app'}},
            template: {
                metadata: {labels: {app: 'test-app'}},
                spec: {
                    containers: [
                        {
                        name: 'test-container',
                        image: 'nginx:latest',
                        ports: [{containerPort: 80}]
                        }
                    ]
                }
            }
            }
        }

        const manifestWithoutNamespace = {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
            name: 'test-deployment-no-ns' // Give different name to avoid conflict
            },
            spec: {
            replicas: 1,
            selector: {matchLabels: {app: 'test-app'}},
            template: {
                metadata: {labels: {app: 'test-app'}},
                spec: {
                    containers: [
                        {
                        name: 'test-container',
                        image: 'nginx:latest',
                        ports: [{containerPort: 80}]
                        }
                    ]
                }
            }
            }
        }

        fs.writeFileSync(
            testManifestWithNamespace,
            yaml.dump(manifestWithNamespace)
        )
        fs.writeFileSync(
            testManifestWithoutNamespace,
            yaml.dump(manifestWithoutNamespace)
        )
    })

    afterAll(async () => {
        // Delete namespaces
        await exec.exec(kubectlPath, ['delete', 'namespace', namespace1])
        await exec.exec(kubectlPath, ['delete', 'namespace', namespace2])

        // Delete test manifests
        fs.unlinkSync(testManifestWithNamespace)
        fs.unlinkSync(testManifestWithoutNamespace)
    })

    it('handles namespace correctly based on manifest', async () => {
        const testCases = [
            {
            manifestPath: testManifestWithNamespace,
            expectedNamespace: namespace1 // Namespace specified in the manifest
            },
            {
            manifestPath: testManifestWithoutNamespace,
            expectedNamespace: 'default' // Falls back to default namespace
            }
        ]

        for (const {manifestPath, expectedNamespace} of testCases) {
            const kubectl = new Kubectl(kubectlPath) // No namespace provided

            // Apply manifest
            const result = await kubectl.apply(manifestPath)
            expect(result.exitCode).toBe(0)

            // Verify resources are in the expected namespace
            const getResult = await exec.exec(kubectlPath, [
            'get',
            'pods',
            '--namespace',
            expectedNamespace,
            '-o',
            'json'
            ])
            expect(getResult).toBeDefined()
        }
    })

    it('deploys resources to namespace1', async () => {
        const kubectl = new Kubectl(kubectlPath, namespace1)

        // Apply manifest to namespace1
        try {
            const result = await kubectl.apply(testManifestWithNamespace)
            expect(result.exitCode).toBe(0)
        } catch (error) {
            console.error('Error applying manifest:', error)
            throw error // Rethrow to fail the test
        }

        // Verify resources in namespace1
        const getResult = await exec.exec(kubectlPath, [
            'get',
            'pods',
            '--namespace',
            namespace1,
            '-o',
            'json'
        ])
        expect(getResult).toBeDefined()
    })

    it('deploys the same resource to two different namespaces without conflict', async () => {
       const kubectl1 = new Kubectl(kubectlPath, namespace1)
       const kubectl2 = new Kubectl(kubectlPath, namespace2)

       const result1 = await kubectl1.apply(testManifestWithoutNamespace)
       expect(result1.exitCode).toBe(0)

       const result2 = await kubectl2.apply(testManifestWithoutNamespace)
       expect(result2.exitCode).toBe(0)

       const getPods1 = await exec.exec(kubectlPath, [
          'get',
          'pods',
          '--namespace',
          namespace1,
          '-o',
          'json'
       ])
       expect(getPods1).toBeDefined()

       const getPods2 = await exec.exec(kubectlPath, [
          'get',
          'pods',
          '--namespace',
          namespace2,
          '-o',
          'json'
       ])
       expect(getPods2).toBeDefined()
    })
      
})
