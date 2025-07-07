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

export function validateTimeoutDuration(duration: string): string {
   const trimmed = duration.trim()

   // Parse number and optional unit
   const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/i.exec(trimmed)
   if (!match) {
      throw new Error(
         `Invalid timeout format: "${duration}". Use: number + unit (30s, 5m, 1h) or just number (assumes minutes)`
      )
   }

   const value = parseFloat(match[1])
   const unit = (match[2] || 'm').toLowerCase() // Default to minutes if no unit

   if (value <= 0) {
      throw new Error(`Timeout must be positive: "${duration}"`)
   }

   // Convert to seconds for validation
   const multipliers = {ms: 0.001, s: 1, m: 60, h: 3600}
   const seconds = value * multipliers[unit]

   if (seconds < 0.001 || seconds > 86400) {
      throw new Error(`Timeout out of range (1ms to 24h): "${duration}"`)
   }

   // Log assumption for bare numbers
   if (!match[2]) {
      core.debug(
         `No unit specified for timeout "${duration}", assuming minutes`
      )
   }

   return `${value}${unit}`
}

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

   // Parse and validate timeout
   let timeout: string
   try {
      const timeoutInput = core.getInput('timeout') || '10m'
      timeout = validateTimeoutDuration(timeoutInput)
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
