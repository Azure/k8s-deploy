import * as fileUtils from '../utilities/fileUtils'
import {
   PrivateKubectl,
   extractFileNames,
   replaceFileNamesWithNamesRelativeToTemp
} from './privatekubectl'
import * as exec from '@actions/exec'

describe('Private kubectl', () => {
   const testString = `kubectl annotate -f /tmp/testdir/test.yml,/tmp/test2.yml,/tmp/testdir/subdir/test3.yml -f /tmp/test4.yml --filename /tmp/test5.yml actions.github.com/k8s-deploy={"run":"3498366832","repository":"jaiveerk/k8s-deploy","workflow":"Minikube Integration Tests - private cluster","workflowFileName":"run-integration-tests-private.yml","jobName":"run-integration-test","createdBy":"jaiveerk","runUri":"https://github.com/jaiveerk/k8s-deploy/actions/runs/3498366832","commit":"c63b323186ea1320a31290de6dcc094c06385e75","lastSuccessRunCommit":"NA","branch":"refs/heads/main","deployTimestamp":1668787848577,"dockerfilePaths":{"nginx:1.14.2":""},"manifestsPaths":["https://github.com/jaiveerk/k8s-deploy/blob/c63b323186ea1320a31290de6dcc094c06385e75/test/integration/manifests/test.yml"],"helmChartPaths":[],"provider":"GitHub"} --overwrite --namespace test-3498366832`
   const mockKube = new PrivateKubectl(
      'kubectlPath',
      'namespace',
      true,
      'resourceGroup',
      'resourceName'
   )

   const spy = jest
      .spyOn(fileUtils, 'getTempDirectory')
      .mockImplementation(() => {
         return '/tmp'
      })

   it('should extract filenames correctly', () => {
      expect(extractFileNames(testString)).toEqual([
         '/tmp/testdir/test.yml',
         '/tmp/test2.yml',
         '/tmp/testdir/subdir/test3.yml',
         '/tmp/test4.yml',
         '/tmp/test5.yml'
      ])
   })

   it('should replace filenames with relative locations in tmp correctly', () => {
      expect(replaceFileNamesWithNamesRelativeToTemp(testString)).toEqual(
         `kubectl annotate -f testdir/test.yml,test2.yml,testdir/subdir/test3.yml -f test4.yml --filename test5.yml actions.github.com/k8s-deploy={"run":"3498366832","repository":"jaiveerk/k8s-deploy","workflow":"Minikube Integration Tests - private cluster","workflowFileName":"run-integration-tests-private.yml","jobName":"run-integration-test","createdBy":"jaiveerk","runUri":"https://github.com/jaiveerk/k8s-deploy/actions/runs/3498366832","commit":"c63b323186ea1320a31290de6dcc094c06385e75","lastSuccessRunCommit":"NA","branch":"refs/heads/main","deployTimestamp":1668787848577,"dockerfilePaths":{"nginx:1.14.2":""},"manifestsPaths":["https://github.com/jaiveerk/k8s-deploy/blob/c63b323186ea1320a31290de6dcc094c06385e75/test/integration/manifests/test.yml"],"helmChartPaths":[],"provider":"GitHub"} --overwrite --namespace test-3498366832`
      )
   })

   test('Should throw well defined Error on error from Azure', async () => {
      const errorMsg = 'An error message'
      jest.spyOn(exec, 'getExecOutput').mockImplementation(async () => {
         return {exitCode: 1, stdout: '', stderr: errorMsg}
      })

      await expect(mockKube.executeCommand('az', 'test')).rejects.toThrow(
         Error(
            `Call to private cluster failed. Command: 'kubectl az test --insecure-skip-tls-verify --namespace namespace', errormessage: ${errorMsg}`
         )
      )
   })
})
