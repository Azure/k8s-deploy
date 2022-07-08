import {KubernetesWorkload} from '../types/kubernetesTypes'

export function getImagePullSecrets(inputObject: any) {
   if (!inputObject?.spec) return null

   if (
      inputObject.kind.toLowerCase() ===
      KubernetesWorkload.CRON_JOB.toLowerCase()
   )
      return inputObject?.spec?.jobTemplate?.spec?.template?.spec
         ?.imagePullSecrets

   if (inputObject.kind.toLowerCase() === KubernetesWorkload.POD.toLowerCase())
      return inputObject.spec.imagePullSecrets

   if (inputObject?.spec?.template?.spec) {
      return inputObject.spec.template.spec.imagePullSecrets
   }
}

export function setImagePullSecrets(
   inputObject: any,
   newImagePullSecrets: any
) {
   if (!inputObject || !inputObject.spec || !newImagePullSecrets) return

   if (
      inputObject.kind.toLowerCase() === KubernetesWorkload.POD.toLowerCase()
   ) {
      inputObject.spec.imagePullSecrets = newImagePullSecrets
      return
   }

   if (
      inputObject.kind.toLowerCase() ===
      KubernetesWorkload.CRON_JOB.toLowerCase()
   ) {
      if (inputObject?.spec?.jobTemplate?.spec?.template?.spec)
         inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets =
            newImagePullSecrets
      return
   }

   if (inputObject?.spec?.template?.spec) {
      inputObject.spec.template.spec.imagePullSecrets = newImagePullSecrets
      return
   }
}
