import * as core from '@actions/core'
import {getKubectlPath, Kubectl} from './types/kubectl.js'
import {
   deploy,
   ResourceTypeFleet,
   ResourceTypeManagedCluster
} from './actions/deploy.js'
import {ClusterType} from './inputUtils.js'
import {promote} from './actions/promote.js'
import {reject} from './actions/reject.js'
import {Action, parseAction} from './types/action.js'
import {parseDeploymentStrategy} from './types/deploymentStrategy.js'
import {getFilesFromDirectoriesAndURLs} from './utilities/fileUtils.js'
import {PrivateKubectl} from './types/privatekubectl.js'
import {parseResourceTypeInput} from './inputUtils.js'
import {parseDuration} from './utilities/durationUtils.js'

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
   const namespace = core.getInput('namespace') || '' // Sets namespace to an empty string if not provided, allowing the manifest-defined namespace to take precedence instead of "default".
   const isPrivateCluster =
      core.getInput('private-cluster').toLowerCase() === 'true'
   const resourceGroup = core.getInput('resource-group') || ''
   const resourceName = core.getInput('name') || ''
   const skipTlsVerify = core.getBooleanInput('skip-tls-verify')

   let resourceType: ClusterType
   try {
      // included in the trycatch to allow raw input to go out of scope after parsing
      const resourceTypeInput = core.getInput('resource-type')
      resourceType = parseResourceTypeInput(resourceTypeInput)
   } catch (e) {
      core.setFailed(e)
      return
   }

   // Parse and validate timeout using extracted utility
   let timeout: string
   try {
      const timeoutInput = core.getInput('timeout') || '10m'
      timeout = parseDuration(timeoutInput)
      core.debug(`Using timeout: ${timeout}`)
   } catch (e) {
      core.setFailed(`Invalid timeout parameter: ${e.message}`)
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
         await deploy(
            kubectl,
            fullManifestFilePaths,
            strategy,
            resourceType,
            timeout
         )
         break
      }
      case Action.PROMOTE: {
         await promote(
            kubectl,
            fullManifestFilePaths,
            strategy,
            resourceType,
            timeout
         )
         break
      }
      case Action.REJECT: {
         await reject(kubectl, fullManifestFilePaths, strategy, timeout)
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
