export interface K8sObject {
   metadata: {
      name: string
      labels: Map<string, string>
   }
   kind: string
   spec: any
}

export interface K8sServiceObject extends K8sObject {
   spec: {
      selector: Map<string, string>
   }
}

export interface K8sDeleteObject {
   name: string
   kind: string
}

export interface K8sIngress extends K8sObject {
   spec: {
      rules: [
         {
            http: {
               paths: [
                  {
                     backend: {
                        service: {
                           name: string
                        }
                     }
                  }
               ]
            }
         }
      ]
   }
}

export interface TrafficSplitObject extends K8sObject {
   apiVersion: string
   metadata: {
      name: string
      labels: Map<string, string>
      annotations: Map<string, string>
   }
   spec: {
      service: string
      backends: TrafficSplitBackend[]
   }
}

export interface TrafficSplitBackend {
   service: string
   weight: number
}
