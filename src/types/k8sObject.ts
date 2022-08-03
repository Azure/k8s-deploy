export interface K8sObject{
    metadata: {
        name: string,
        labels: Map<string, string>
    }
    kind: string
}

export interface K8sDeleteObject{
    name: string
    kind: string
}

export interface K8sIngress extends K8sObject{
    spec:{
        rules: [
            {http: {
                paths: [{
                    backend: {
                        service:
                        {
                            name: string
                        }
                    }
                }]
            }}
        ]
    }

}
