import {KubernetesWorkload} from '../types/kubernetesTypes.js'

export function getImagePullSecrets(inputObject: any) {
   const kind = inputObject?.kind?.toLowerCase()
   const spec = inputObject?.spec

   if (!spec || !kind) return null

   switch (kind) {
      case KubernetesWorkload.CRON_JOB.toLowerCase():
         return spec.jobTemplate?.spec?.template?.spec?.imagePullSecrets

      case KubernetesWorkload.SCALED_JOB.toLowerCase():
         return spec.jobTargetRef?.template?.spec?.imagePullSecrets

      case KubernetesWorkload.POD.toLowerCase():
         return spec.imagePullSecrets

      default:
         return spec.template?.spec?.imagePullSecrets || null
   }
}

export function setImagePullSecrets(
   inputObject: any,
   newImagePullSecrets: any
) {
   const kind = inputObject?.kind?.toLowerCase()
   const spec = inputObject?.spec

   if (!inputObject || !spec || !newImagePullSecrets || !kind) return

   switch (kind) {
      case KubernetesWorkload.POD.toLowerCase():
         spec.imagePullSecrets = newImagePullSecrets
         break

      case KubernetesWorkload.CRON_JOB.toLowerCase():
         if (spec.jobTemplate?.spec?.template?.spec) {
            spec.jobTemplate.spec.template.spec.imagePullSecrets =
               newImagePullSecrets
         }
         break

      case KubernetesWorkload.SCALED_JOB.toLowerCase():
         if (spec.jobTargetRef?.template?.spec) {
            spec.jobTargetRef.template.spec.imagePullSecrets =
               newImagePullSecrets
         }
         break

      default:
         if (spec.template?.spec) {
            spec.template.spec.imagePullSecrets = newImagePullSecrets
         }
         break
   }
}
