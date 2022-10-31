# Deploy manifests action for Kubernetes

This action is used to deploy manifests to Kubernetes clusters. It requires that the cluster context be set earlier in the workflow by using either the [Azure/aks-set-context](https://github.com/Azure/aks-set-context/tree/releases/v1) action or the [Azure/k8s-set-context](https://github.com/Azure/k8s-set-context/tree/releases/v1) action. It also requires Kubectl to be installed (you can use the [Azure/setup-kubectl](https://github.com/Azure/setup-kubectl) action).

If you are looking to automate your workflows to deploy to [Azure Web Apps](https://azure.microsoft.com/en-us/services/app-service/web/) and [Azure Web App for Containers](https://azure.microsoft.com/en-us/services/app-service/containers/), consider using [`Azure/webapps-deploy`](https://github.com/Azure/webapps-deploy) action.

This action requires the following permissions from your workflow:

```yaml
permissions:
   id-token: write
   contents: read
   actions: read
```

## Action capabilities

Following are the key capabilities of this action:

-  **Artifact substitution**: Takes a list of container images which can be specified along with their tags or digests. They are substituted into the non-templatized version of manifest files before applying to the cluster to ensure that the right version of the image is pulled by the cluster nodes.

-  **Object stability checks**: Rollout status is checked for the Kubernetes objects deployed. This is done to incorporate stability checks while computing the action status as success/failure.

-  **Secret handling**: The secret names specified as inputs in the action are used to augment the input manifest files with imagePullSecrets values before deploying to the cluster. Also, checkout the [Azure/k8s-create-secret](https://github.com/Azure/k8s-create-secret) action for creation of generic or docker-registry secrets in the cluster.

-  **Deployment strategy** Supports both canary and blue-green deployment strategies

   -  **Canary strategy**: Workloads suffixed with '-baseline' and '-canary' are created. There are two methods of traffic splitting supported:
      -  **Service Mesh Interface**: Service Mesh Interface abstraction allows for plug-and-play configuration with service mesh providers such as [Linkerd](https://linkerd.io/) and [Istio](https://istio.io/). Meanwhile, this action takes away the hard work of mapping SMI's TrafficSplit objects to the stable, baseline and canary services during the lifecycle of the deployment strategy. Service mesh based canary deployments using this action are more accurate as service mesh providers enable granular percentage traffic split (via service registry and sidecar containers injected into pods alongside application containers).
      -  **Only Kubernetes (no service mesh)**: In the absence of service mesh, while it may not be possible to achieve exact percentage split at the request level, it is still possible to perform canary deployments by deploying -baseline and -canary workload variants next to the stable variant. The service routes requests to pods of all three workload variants as the selector-label constraints are met (KubernetesManifest will honor these when creating -baseline and -canary variants). This achieves the intended effect of routing only a portion of total requests to the canary.
   -  **Blue-Green strategy**: Choosing blue-green strategy with this action leads to creation of workloads suffixed with '-green'. An identified service is one that is supplied as part of the input manifest(s) and targets a workload in the supplied manifest(s). There are three route-methods supported in the action:

      -  **Service route-method**: Identified services are configured to target the green deployments.
      -  **Ingress route-method**: Along with deployments, new services are created with '-green' suffix (for identified services), and the ingresses are in turn updated to target the new services.
      -  **SMI route-method**: A new [TrafficSplit](https://github.com/servicemeshinterface/smi-spec/blob/master/apis/traffic-split/v1alpha3/traffic-split.md) object is created for each identified service. The TrafficSplit object is updated to target the new deployments. This works only if SMI is set up in the cluster.

      Traffic is routed to the new workloads only after the time provided as `version-switch-buffer` input has passed. The `promote` action creates workloads and services with new configurations but without any suffix. `reject` routes traffic back to the old workloads and deletes the '-green' workloads.

## Action inputs

<table>
  <thead>
    <tr>
      <th>Action inputs</th>
      <th>Description</th>
    </tr>
  </thead>
  <tr>
    <td>action </br></br>(Required)</td>
    <td>Acceptable values: deploy/promote/reject.</br>Promote or reject actions are used to promote or reject canary/blue-green deployments. Sample YAML snippets are provided below for guidance.</td>
  </tr>
  <tr>
    <td>manifests </br></br>(Required)</td>
    <td>Path to the manifest files to be used for deployment. These can also be directories containing manifest files, in which case, all manifest files in the referenced directory at every depth will be deployed, or URLs to manifest files (like https://raw.githubusercontent.com/kubernetes/website/main/content/en/examples/controllers/nginx-deployment.yaml). Files and URLs not ending in .yml or .yaml will be ignored.</td>
  </tr>
    <tr>
    <td>strategy </br></br>(Required)</td>
    <td>Acceptable values: basic/canary/blue-green. <br>
    Default value: basic
    <br>Deployment strategy to be used while applying manifest files on the cluster.
    <br>basic - Template is force applied to all pods when deploying to cluster. NOTE: Can only be used with action == deploy
    <br>canary - Canary deployment strategy is used when deploying to the cluster.<br>blue-green - Blue-Green deployment strategy is used when deploying to cluster.</td>
  </tr>
  <tr>
    <td>namespace </br></br>(Optional)
    <td>Namespace within the cluster to deploy to.</td>
  </tr>
  <tr>
    <td>images </br></br>(Optional)</td>
    <td>Fully qualified resource URL of the image(s) to be used for substitutions on the manifest files. This multiline input accepts specifying multiple artifact substitutions in newline separated form. For example:<br> 
    <code><br>images: |<br>&nbsp&nbspcontosodemo.azurecr.io/foo:test1<br>&nbsp&nbspcontosodemo.azurecr.io/bar:test2<br></code><br>
    In this example, all references to contosodemo.azurecr.io/foo and contosodemo.azurecr.io/bar are searched for in the image field of the input manifest files. For the matches found, the tags test1 and test2 are substituted.</td>
  </tr>
  <tr>
    <td>imagepullsecrets </br></br>(Optional)</td>
    <td>Multiline input where each line contains the name of a docker-registry secret that has already been setup within the cluster. Each of these secret names are added under imagePullSecrets field for the workloads found in the input manifest files</td>
  </tr>  
  <tr>
    <td>pull-images</br></br>(Optional)</td>
    <td>Acceptable values: true/false</br>Default value: true</br>Switch whether to pull the images from the registry before deployment to find out Dockerfile's path in order to add it to the annotations</td>
  </tr>
  <tr>
    <td>traffic-split-method </br></br>(Optional)</td>
    <td>Acceptable values: pod/smi.<br> Default value: pod <br>SMI: Percentage traffic split is done at request level using service mesh. Service mesh has to be setup by cluster admin. Orchestration of <a href="https://github.com/servicemeshinterface/smi-spec/blob/master/apis/traffic-split/v1alpha3/traffic-split.md" data-raw-source="TrafficSplit](https://github.com/deislabs/smi-spec/blob/master/traffic-split.md)">TrafficSplit</a> objects of SMI is handled by this action. <br>Pod: Percentage split not possible at request level in the absence of service mesh. Percentage input is used to calculate the replicas for baseline and canary as a percentage of replicas specified in the input manifests for the stable variant.</td>
  </tr>
  <tr>
   <td>traffic-split-annotations </br></br>(Optional)</td>
   <td>Annotations in the form of key/value pair to be added to TrafficSplit.</td>
  <tr>
    <td>percentage </br></br>(Optional but required if strategy is canary)</td>
    <td>Used to compute the number of replicas of &#39;-baseline&#39; and &#39;-canary&#39; variants of the workloads found in manifest files. For the specified percentage input, if (percentage * numberOfDesirerdReplicas)/100 is not a round number, the floor of this number is used while creating &#39;-baseline&#39; and &#39;-canary&#39;.<br/><br/>For example, if Deployment hello-world was found in the input manifest file with &#39;replicas: 4&#39; and if &#39;strategy: canary&#39; and &#39;percentage: 25&#39; are given as inputs to the action, then the Deployments hello-world-baseline and hello-world-canary are created with 1 replica each. The &#39;-baseline&#39; variant is created with the same image and tag as the stable version (4 replica variant prior to deployment) while the &#39;-canary&#39; variant is created with the image and tag corresponding to the new changes being deployed</td>
  </tr>
  <tr>
    <td>baseline-and-canary-replicas </br></br> (Optional and relevant only if strategy is canary and traffic-split-method is smi)</td>
    <td>The number of baseline and canary replicas. Percentage traffic split is controlled in the service mesh plane, the actual number of replicas for canary and baseline variants could be controlled independently of the traffic split. For example, assume that the input Deployment manifest desired 30 replicas to be used for stable and that the following inputs were specified for the action </br></br><code>&nbsp;&nbsp;&nbsp;&nbsp;strategy: canary<br>&nbsp;&nbsp;&nbsp;&nbsp;trafficSplitMethod: smi<br>&nbsp;&nbsp;&nbsp;&nbsp;percentage: 20<br>&nbsp;&nbsp;&nbsp;&nbsp;baselineAndCanaryReplicas: 1</code></br></br> In this case, stable variant will receive 80% traffic while baseline and canary variants will receive 10% each (20% split equally between baseline and canary). However, instead of creating baseline and canary with 3 replicas each, the explicit count of baseline and canary replicas is honored. That is, only 1 replica each is created for baseline and canary variants.</td>
  </tr>
   <tr>
    <td>route-method </br></br>(Optional and relevant only if strategy is blue-green)</td>
    <td>Acceptable values: service/ingress/smi.</br>Default value: service.</br>Traffic is routed based on this input.
    <br>Service: Service selector labels are updated to target '-green' workloads.
    <br>Ingress: Ingress backends are updated to target the new '-green' services which in turn target '-green' deployments.
    <br>SMI: A <a href="https://github.com/servicemeshinterface/smi-spec/blob/master/apis/traffic-split/v1alpha3/traffic-split.md" data-raw-source="TrafficSplit](https://github.com/deislabs/smi-spec/blob/master/traffic-split.md)">TrafficSplit</a>  object is created for each required service to route traffic to new workloads.</td>
  </tr>
  <tr>
    <td>version-switch-buffer </br></br>(Optional and relevant only if strategy is blue-green)</td>
    <td>Acceptable values: 1-300.</br>Default value: 0.</br>Waits for the given input in minutes before routing traffic to '-green' workloads.</td>
  </tr>
  <tr>
    <td>private-cluster </br></br>(Optional and relevant only using K8's deploy for a cluster with private cluster enabled)</td>
    <td>Acceptable values: true, false</br>Default value: false.</td>
  </tr>
  <tr>
    <td>force </br></br>(Optional)</td>
    <td>Deploy when a previous deployment already exists. If true then '--force' argument is added to the apply command. Using '--force' argument is not recommended in production.</td>
  </tr>
  <tr>
    <td>annotate-namespace</br></br>(Optional)</td>
    <td>Acceptable values: true/false</br>Default value: true</br>Switch whether to annotate the namespace resources object or not</td>
  </tr>
</table>

## Usage Examples

### Basic deployment (without any deployment strategy)

```yaml
- uses: Azure/k8s-deploy@v3.1
  with:
     namespace: 'myapp'
     manifests: |
        dir/manifestsDirectory
     images: 'contoso.azurecr.io/myapp:${{ event.run_id }}'
     imagepullsecrets: |
        image-pull-secret1
        image-pull-secret2
```

### Private cluster deployment

```yaml
- uses: Azure/k8s-deploy@v4
  with:
     resource-group: yourResourceGroup
     name: yourClusterName
     action: deploy
     strategy: basic

     private-cluster: true
     manifests: |
        manifests/azure-vote-backend-deployment.yaml
        manifests/azure-vote-backend-service.yaml
        manifests/azure-vote-frontend-deployment.yaml
        manifests/azure-vote-frontend-service.yaml
     images: |
        registry.azurecr.io/containername
```

### Canary deployment without service mesh

```yaml
- uses: Azure/k8s-deploy@v3.1
  with:
     namespace: 'myapp'
     images: 'contoso.azurecr.io/myapp:${{ event.run_id }}'
     imagepullsecrets: |
        image-pull-secret1
        image-pull-secret2
     manifests: |
        deployment.yaml
        service.yaml
        dir/manifestsDirectory
     strategy: canary
     action: deploy
     percentage: 20
```

To promote/reject the canary created by the above snippet, the following YAML snippet could be used:

```yaml
- uses: Azure/k8s-deploy@v3.1
  with:
     namespace: 'myapp'
     images: 'contoso.azurecr.io/myapp:${{ event.run_id }}'
     imagepullsecrets: |
        image-pull-secret1
        image-pull-secret2
     manifests: |
        deployment.yaml
        service.yaml
        dir/manifestsDirectory
     strategy: canary
     action: promote # substitute reject if you want to reject
```

### Canary deployment based on Service Mesh Interface

```yaml
- uses: Azure/k8s-deploy@v3.1
  with:
     namespace: 'myapp'
     images: 'contoso.azurecr.io/myapp:${{ event.run_id }}'
     imagepullsecrets: |
        image-pull-secret1
        image-pull-secret2
     manifests: |
        deployment.yaml
        service.yaml
        dir/manifestsDirectory
     strategy: canary
     action: deploy
     traffic-split-method: smi
     percentage: 20
     baseline-and-canary-replicas: 1
```

To promote/reject the canary created by the above snippet, the following YAML snippet could be used:

```yaml
- uses: Azure/k8s-deploy@v3.1
  with:
     namespace: 'myapp'
     images: 'contoso.azurecr.io/myapp:${{ event.run_id }} '
     imagepullsecrets: |
        image-pull-secret1
        image-pull-secret2
     manifests: |
        deployment.yaml
        service.yaml
        dir/manifestsDirectory
     strategy: canary
     traffic-split-method: smi
     action: reject # substitute promote if you want to promote
```

### Blue-Green deployment with different route methods

```yaml
- uses: Azure/k8s-deploy@v3.1
  with:
     namespace: 'myapp'
     images: 'contoso.azurecr.io/myapp:${{ event.run_id }}'
     imagepullsecrets: |
        image-pull-secret1
        image-pull-secret2
     manifests: |
        deployment.yaml
        service.yaml
        ingress.yml
     strategy: blue-green
     action: deploy
     route-method: ingress # substitute with service/smi as per need
     version-switch-buffer: 15
```

To promote/reject the green workload created by the above snippet, the following YAML snippet could be used:

```yaml
- uses: Azure/k8s-deploy@v3.1
  with:
     namespace: 'myapp'
     images: 'contoso.azurecr.io/myapp:${{ event.run_id }}'
     imagepullsecrets: |
        image-pull-secret1
        image-pull-secret2
     manifests: |
        deployment.yaml
        service.yaml
        ingress.yml
     strategy: blue-green
     route-method: ingress # should be the same as the value when action was deploy
     action: promote # substitute reject if you want to reject
```

## End to end workflows

Following are a few examples of not just this action, but how this action could be used along with other container and k8s related actions for building images and deploying objects onto k8s clusters:

### Build container image and deploy to Azure Kubernetes Service cluster

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

         - uses: azure/setup-kubectl@v2.0

         # Set the target AKS cluster.
         - uses: Azure/aks-set-context@v1
           with:
              creds: '${{ secrets.AZURE_CREDENTIALS }}'
              cluster-name: contoso
              resource-group: contoso-rg

         - uses: Azure/k8s-create-secret@v1.1
           with:
              container-registry-url: contoso.azurecr.io
              container-registry-username: ${{ secrets.REGISTRY_USERNAME }}
              container-registry-password: ${{ secrets.REGISTRY_PASSWORD }}
              secret-name: demo-k8s-secret

         - uses: Azure/k8s-deploy@v3.1
           with:
              action: deploy
              manifests: |
                 manifests/deployment.yml
                 manifests/service.yml
              images: |
                 demo.azurecr.io/k8sdemo:${{ github.sha }}
              imagepullsecrets: |
                 demo-k8s-secret
```

### Build container image and deploy to any Azure Kubernetes Service cluster

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

         - uses: azure/setup-kubectl@v2.0

         - uses: Azure/k8s-set-context@v2
           with:
              kubeconfig: ${{ secrets.KUBE_CONFIG }}

         - uses: Azure/k8s-create-secret@v1.1
           with:
              container-registry-url: contoso.azurecr.io
              container-registry-username: ${{ secrets.REGISTRY_USERNAME }}
              container-registry-password: ${{ secrets.REGISTRY_PASSWORD }}
              secret-name: demo-k8s-secret

         - uses: Azure/k8s-deploy@v3.1
           with:
              action: deploy
              manifests: |
                 manifests/deployment.yml
                 manifests/service.yml
              images: |
                 demo.azurecr.io/k8sdemo:${{ github.sha }}
              imagepullsecrets: |
                 demo-k8s-secret
```

### Build image and add `dockerfile-path` label to it

We can use this image in other workflows once built.

```yaml
on: [push]
env:
   NAMESPACE: demo-ns2

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
              docker build . -t contoso.azurecr.io/k8sdemo:${{ github.sha }} --label dockerfile-path=https://github.com/${{github.repo}}/blob/${{github.sha}}/Dockerfile
              docker push contoso.azurecr.io/k8sdemo:${{ github.sha }}
```

### Use bake action to get manifests deploying to a Kubernetes cluster

```yaml
on: [push]
env:
   NAMESPACE: demo-ns2

jobs:
   deploy:
      runs-on: ubuntu-latest
      steps:
         - uses: actions/checkout@master

         - uses: Azure/docker-login@v1
           with:
              login-server: contoso.azurecr.io
              username: ${{ secrets.REGISTRY_USERNAME }}
              password: ${{ secrets.REGISTRY_PASSWORD }}

         - uses: azure/setup-kubectl@v2.0

         # Set the target AKS cluster.
         - uses: Azure/aks-set-context@v1
           with:
              creds: '${{ secrets.AZURE_CREDENTIALS }}'
              cluster-name: contoso
              resource-group: contoso-rg

         - uses: Azure/k8s-create-secret@v1.1
           with:
              namespace: ${{ env.NAMESPACE  }}
              container-registry-url: contoso.azurecr.io
              container-registry-username: ${{ secrets.REGISTRY_USERNAME }}
              container-registry-password: ${{ secrets.REGISTRY_PASSWORD }}
              secret-name: demo-k8s-secret

         - uses: azure/k8s-bake@v2
           with:
              renderEngine: 'helm'
              helmChart: './aks-helloworld/'
              overrideFiles: './aks-helloworld/values-override.yaml'
              overrides: |
                 replicas:2
              helm-version: 'latest'
           id: bake

         - uses: Azure/k8s-deploy@v1.2
           with:
              action: deploy
              manifests: ${{ steps.bake.outputs.manifestsBundle }}
              images: |
                 contoso.azurecr.io/k8sdemo:${{ github.sha }}
              imagepullsecrets: |
                 demo-k8s-secret
```

## Traceability Fields Support

-  Environment variable `HELM_CHART_PATHS` is a list of helmchart files expected by k8s-deploy - it will be populated automatically if you are using k8s-bake to generate the manifests.
-  Use script to build image and add dockerfile-path label to it. The value expected is the link to the dockerfile: https://github.com/${{github.repo}}/blob/${{github.sha}}/Dockerfile. If your dockerfile is in the same repo and branch where the workflow is run, it can be a relative path and it will be converted to a link for traceability.
-  Run docker login action for each image registry - in case image build and image deploy are two distinct jobs in the same or separate workflows.

## Contributing

This project welcomes contributions and suggestions. Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Support

k8s-deploy is an open source project that is [**not** covered by the Microsoft Azure support policy](https://support.microsoft.com/en-us/help/2941892/support-for-linux-and-open-source-technology-in-azure). [Please search open issues here](https://github.com/Azure/k8s-deploy/issues), and if your issue isn't already represented please [open a new one](https://github.com/Azure/k8s-deploy/issues/new/choose). The project maintainers will respond to the best of their abilities.
