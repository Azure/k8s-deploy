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
   if (!inputObject) return null

   if (inputObject.kind.toLowerCase() === KubernetesWorkload.POD.toLowerCase())
      return inputObject.metadata.labels

   if (inputObject?.spec?.template?.metadata)
      return inputObject.spec.template.metadata.labels

   return null
}

function setSpecLabels(inputObject: any, newLabels: any) {
   if (!inputObject || !newLabels) return null

   if (
      inputObject.kind.toLowerCase() === KubernetesWorkload.POD.toLowerCase()
   ) {
      inputObject.metadata.labels = newLabels
      return
   }

   if (inputObject?.spec?.template?.metatada) {
      inputObject.spec.template.metatada.labels = newLabels
      return
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
