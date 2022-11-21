import {PrivateKubectl} from './privatekubectl'

describe('Private kubectl', () => {
   const testString = `kubectl annotate -f test.yml,test2.yml,test3.yml -f test4.yml --filename test5.yml actions.github.com/k8s-deploy={"run":"3498366832","repository":"jaiveerk/k8s-deploy","workflow":"Minikube Integration Tests - private cluster","workflowFileName":"run-integration-tests-private.yml","jobName":"run-integration-test","createdBy":"jaiveerk","runUri":"https://github.com/jaiveerk/k8s-deploy/actions/runs/3498366832","commit":"c63b323186ea1320a31290de6dcc094c06385e75","lastSuccessRunCommit":"NA","branch":"refs/heads/main","deployTimestamp":1668787848577,"dockerfilePaths":{"nginx:1.14.2":""},"manifestsPaths":["https://github.com/jaiveerk/k8s-deploy/blob/c63b323186ea1320a31290de6dcc094c06385e75/test/integration/manifests/test.yml"],"helmChartPaths":[],"provider":"GitHub"} --overwrite --namespace test-3498366832`
   const mockKube = new PrivateKubectl('')

   it('should extract filenames correctly', () => {
      expect(mockKube.extractFilesnames(testString)).toEqual(
         'test.yml test2.yml test3.yml test4.yml test5.yml'
      )
   })
})
