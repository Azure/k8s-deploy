import {Kubectl} from '../types/kubectl'

const trafficSplitAPIVersionPrefix = 'split.smi-spec.io'

export async function getTrafficSplitAPIVersion(
   kubectl: Kubectl
): Promise<string> {
   const result = await kubectl.executeCommand('api-versions')
   const trafficSplitAPIVersion = result.stdout
      .split('\n')
      .find((version) => version.startsWith(trafficSplitAPIVersionPrefix))

   if (!trafficSplitAPIVersion) {
      throw new Error('Unable to find traffic split api version')
   }

   return trafficSplitAPIVersion
}
