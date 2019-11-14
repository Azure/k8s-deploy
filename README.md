# Deploy manifest action for Kubernetes
Use this action to bake and deploy manifests to Kubernetes clusters.

Assumes that the deployment target K8s cluster context was set earlier in the workflow by using either [`Azure/aks-set-context`](https://github.com/Azure/aks-set-context/tree/releases/v1) or [`Azure/k8s-set-context`](https://github.com/Azure/k8s-set-context/tree/releases/v1)

#### Artifact substitution
The deploy action takes as input a list of container images which can be specified along with their tags or digests. The same is substituted into the non-templatized version of manifest files before applying to the cluster to ensure that the right version of the image is pulled by the cluster nodes.

#### Manifest stability
Rollout status is checked for the Kubernetes objects deployed. This is done to incorporate stability checks while computing the task status as success/failure.

#### Secret handling 
 The manifest files specfied as inputs are augmented with appropriate imagePullSecrets before deploying to the cluster.

#### Sample YAML to run a basic deployment

```yaml
- uses: Azure/k8s-deploy@v1
  with:
    namespace: 'myapp' # optional
    images: 'contoso.azurecr.io/myapp:${{ event.run_id }} '
    imagepullsecrets: |
      image-pull-secret1
      image-pull-secret2
    manifests: '/manifests/*.*'
    kubectl-version: 'latest' # optional
```

### Deployment Strategies

#### Pod Canary

```yaml
- uses: Azure/k8s-deploy@v1
  with:
    namespace: 'myapp' # optional
    images: 'contoso.azurecr.io/myapp:${{ event.run_id }} '
    imagepullsecrets: |
      image-pull-secret1
      image-pull-secret2
    manifests: '/manifests/*.*'
    strategy: canary
    percentage: 20
```

Inorder to promote or reject your canary deployment use the following:
```yaml
- uses: Azure/k8s-deploy@v1
  with:
    namespace: 'myapp' # optional
    images: 'contoso.azurecr.io/myapp:${{ event.run_id }} '
    imagepullsecrets: |
      image-pull-secret1
      image-pull-secret2
    manifests: '/manifests/*.*'
    strategy: canary
    percentage: 20
    action: promote # set to reject if you want to reject it
```

#### SMI Canary

```yaml
- uses: Azure/k8s-deploy@v1
  with:
    namespace: 'myapp' # optional
    images: 'contoso.azurecr.io/myapp:${{ event.run_id }} '
    imagepullsecrets: |
      image-pull-secret1
      image-pull-secret2
    manifests: '/manifests/*.*'
    strategy: canary
    traffic-split-method: smi
    percentage: 20
    baseline-and-canary-replicas: 1
```

Inorder to promote or reject your canary deployment use the following:

```yaml
- uses: Azure/k8s-deploy@v1
  with:
    namespace: 'myapp' # optional
    images: 'contoso.azurecr.io/myapp:${{ event.run_id }} '
    imagepullsecrets: |
      image-pull-secret1
      image-pull-secret2
    manifests: '/manifests/*.*'
    strategy: canary
    traffic-split-method: smi
    percentage: 20
    baseline-and-canary-replicas: 1
    action: promote # set to reject if you want to reject it
```

Refer to the action metadata file for details about all the inputs https://github.com/Azure/k8s-deploy/blob/master/action.yml

## End to end workflow for building container images and deploying to an Azure Kubernetes Service cluster

```yaml
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@master
    
    - uses: Azure/docker-login@v1
      with:
        login-server: contoso.azurecr.io
        username: ${{ secrets.REGISTRY_USERNAME }}
        password: ${{ secrets.REGISTRY_PASSWORD }}
    
    - run: |
        docker build . -t contoso.azurecr.io/k8sdemo:${{ github.sha }}
        docker push contoso.azurecr.io/k8sdemo:${{ github.sha }}
      
    # Set the target AKS cluster.
    - uses: Azure/aks-set-context@v1
      with:
        creds: '${{ secrets.AZURE_CREDENTIALS }}'
        cluster-name: contoso
        resource-group: contoso-rg
        
    - uses: Azure/k8s-create-secret@v1
      with:
        container-registry-url: contoso.azurecr.io
        container-registry-username: ${{ secrets.REGISTRY_USERNAME }}
        container-registry-password: ${{ secrets.REGISTRY_PASSWORD }}
        secret-name: demo-k8s-secret

    - uses: Azure/k8s-deploy@v1
      with:
        manifests: |
          manifests/deployment.yml
          manifests/service.yml
        images: |
          demo.azurecr.io/k8sdemo:${{ github.sha }}
        imagepullsecrets: |
          demo-k8s-secret
```

## End to end workflow for building container images and deploying to a Kubernetes cluster

```yaml
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@master
    
    - uses: Azure/docker-login@v1
      with:
        login-server: contoso.azurecr.io
        username: ${{ secrets.REGISTRY_USERNAME }}
        password: ${{ secrets.REGISTRY_PASSWORD }}
    
    - run: |
        docker build . -t contoso.azurecr.io/k8sdemo:${{ github.sha }}
        docker push contoso.azurecr.io/k8sdemo:${{ github.sha }}
      
    - uses: Azure/k8s-set-context@v1
      with:
        kubeconfig: ${{ secrets.KUBE_CONFIG }}
        
    - uses: Azure/k8s-create-secret@v1
      with:
        container-registry-url: contoso.azurecr.io
        container-registry-username: ${{ secrets.REGISTRY_USERNAME }}
        container-registry-password: ${{ secrets.REGISTRY_PASSWORD }}
        secret-name: demo-k8s-secret

    - uses: Azure/k8s-deploy@v1
      with:
        manifests: |
          manifests/deployment.yml
          manifests/service.yml
        images: |
          demo.azurecr.io/k8sdemo:${{ github.sha }}
        imagepullsecrets: |
          demo-k8s-secret
```

# Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.