import {
   InputObjectKindNotDefinedError,
   isServiceEntity,
   KubernetesWorkload,
   NullInputObjectError
} from '../types/kubernetesTypes'

export function updateSpecLabels(
   inputObject: any,
   newLabels: Map<string, string>,
   override: boolean
) {
   if (!inputObject) throw NullInputObjectError

   if (!inputObject.kind) throw InputObjectKindNotDefinedError

   if (!newLabels) return

   let existingLabels = getSpecLabels(inputObject)
   if (override) {
      existingLabels = newLabels
   } else {
      existingLabels = existingLabels || new Map<string, string>()
      Object.keys(newLabels).forEach(
         (key) => (existingLabels[key] = newLabels[key])
      )
   }

   setSpecLabels(inputObject, existingLabels)
}

function getSpecLabels(inputObject: any) {
   const kind = inputObject?.kind?.toLowerCase()
   const spec = inputObject?.spec

   if (!inputObject || !kind) return null

   switch (kind) {
      case KubernetesWorkload.POD.toLowerCase():
         return inputObject.metadata.labels

      case KubernetesWorkload.CRON_JOB.toLowerCase():
         return spec?.jobTemplate?.spec?.template?.metadata?.labels

      case KubernetesWorkload.SCALED_JOB.toLowerCase():
         return spec?.jobTargetRef?.template?.metadata?.labels

      default:
         return spec?.template?.metadata?.labels || null
   }
}

function setSpecLabels(inputObject: any, newLabels: any) {
   const kind = inputObject?.kind?.toLowerCase()
   const spec = inputObject?.spec

   if (!inputObject || !newLabels || !kind) return null

   switch (kind) {
      case KubernetesWorkload.POD.toLowerCase():
         inputObject.metadata.labels = newLabels
         break

      case KubernetesWorkload.CRON_JOB.toLowerCase():
         if (spec?.jobTemplate?.spec?.template?.metadata) {
            spec.jobTemplate.spec.template.metadata.labels = newLabels
         }
         break

      case KubernetesWorkload.SCALED_JOB.toLowerCase():
         if (spec?.jobTargetRef?.template?.metadata) {
            spec.jobTargetRef.template.metadata.labels = newLabels
         }
         break

      default:
         if (spec?.template?.metadata) {
            spec.template.metadata.labels = newLabels
         }
         break
   }
}

export function getSpecSelectorLabels(inputObject: any) {
   if (inputObject?.spec?.selector) {
      if (isServiceEntity(inputObject.kind)) return inputObject.spec.selector
      else return inputObject.spec.selector.matchLabels
   }
}

export function setSpecSelectorLabels(inputObject: any, newLabels: any) {
   if (inputObject?.spec?.selector) {
      if (isServiceEntity(inputObject.kind))
         inputObject.spec.selector = newLabels
      else inputObject.spec.selector.matchLabels = newLabels
   }
}
