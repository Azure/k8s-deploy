export interface K8sObject{
    metadata: {
        name: string,
        labels: Map<string, string>
    }
}
