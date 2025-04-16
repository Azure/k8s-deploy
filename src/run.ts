import * as core from '@actions/core'
import {getKubectlPath, Kubectl} from './types/kubectl'
import {
   deploy,
   ResourceTypeFleet,
   ResourceTypeManagedCluster
} from './actions/deploy'
import {ClusterType} from './inputUtils'
import {promote} from './actions/promote'
import {reject} from './actions/reject'
import {Action, parseAction} from './types/action'
import {parseDeploymentStrategy} from './types/deploymentStrategy'
import {getFilesFromDirectoriesAndURLs} from './utilities/fileUtils'
import {PrivateKubectl} from './types/privatekubectl'
import {parseResourceTypeInput} from './inputUtils'

export async function run() {
   // verify kubeconfig is set
   if (!process.env['KUBECONFIG'])
      core.warning(
         'KUBECONFIG env is not explicitly set. Ensure cluster context is set by using k8s-set-context action.'
      )

   // get inputs
   const action: Action | undefined = parseAction(
      core.getInput('action', {required: true})
   )
   const strategy = parseDeploymentStrategy(core.getInput('strategy'))
   const manifestsInput = core.getInput('manifests', {required: true})
   const manifestFilePaths = manifestsInput
      .split(/[\n,;]+/) // split into each individual manifest
      .map((manifest) => manifest.trim()) // remove surrounding whitespace
      .filter((manifest) => manifest.length > 0) // remove any blanks

   const fullManifestFilePaths =
      await getFilesFromDirectoriesAndURLs(manifestFilePaths)
   const kubectlPath = await getKubectlPath()
   const namespace = core.getInput('namespace') || 'default'
   const isPrivateCluster =
      core.getInput('private-cluster').toLowerCase() === 'true'
   const resourceGroup = core.getInput('resource-group') || ''
   const resourceName = core.getInput('name') || ''
   const skipTlsVerify = core.getBooleanInput('skip-tls-verify')

   const resourceTypeInput = core.getInput('resource-type')
   let resourceType: ClusterType
   try {
      resourceType = parseResourceTypeInput(resourceTypeInput)
   } catch (e) {
      core.setFailed(e)
      return
   }

   const kubectl = isPrivateCluster
      ? new PrivateKubectl(
           kubectlPath,
           namespace,
           skipTlsVerify,
           resourceGroup,
           resourceName
        )
      : new Kubectl(kubectlPath, namespace, skipTlsVerify)

   // run action
   switch (action) {
      case Action.DEPLOY: {
         await deploy(kubectl, fullManifestFilePaths, strategy, resourceType)
         break
      }
      case Action.PROMOTE: {
         await promote(kubectl, fullManifestFilePaths, strategy, resourceType)
         break
      }
      case Action.REJECT: {
         await reject(kubectl, fullManifestFilePaths, strategy)
         break
      }
      default: {
         throw Error(
            'Not a valid action. The allowed actions are "deploy", "promote", and "reject".'
         )
      }
   }
}

run().catch(core.setFailed)
