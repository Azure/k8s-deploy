const { Octokit } = require("@octokit/core");
const yaml = require('yaml');
const fs = require('fs');  
const fsPromises = require('fs').promises; 

class testObject {
    constructor(testName, workflowJson, testJson, deleteJson) {
        this.testName = testName;
        this.workflowJson = workflowJson;
        this.testJson = testJson;
        this.deleteJson = deleteJson;
    }
}

class actionsTest {
    constructor(runnerRepositoryOwner, runnerRepositoryName, runnerRepositoryToken, testingRepositoryOwner, testingRepositoryName, testingRepositoryToken) {
        this.runnerRepositoryOwner = runnerRepositoryOwner;
        this.runnerRepositoryName = runnerRepositoryName;
        this.runnerRepositoryToken = runnerRepositoryToken

        this.testingRepositoryOwner = testingRepositoryOwner;
        this.testingRepositoryName = testingRepositoryName;
        this.testingRepositoryToken = testingRepositoryToken;

        this.octokit = new Octokit({ auth: this.runnerRepositoryToken });

        this.setup = new Array();
        this.tests = new Array();
        this.cleanup = new Array();
    }

    addSetup(setupJson) {
        this.setup = setupJson;
    }

    addCleanUp(cleanupJson) {
        this.cleanup = cleanupJson;
    }

    addTest(testName, workflowJson, testJson, deleteJson) {
        this.tests.push(new testObject(testName, workflowJson, testJson, deleteJson));
    }

    createFile(currentPath, pathInRunnerRespository) {
        return fsPromises.readFile(currentPath, 'utf-8',) 
        .then(data=>{    
            // console.log(data);
            return this.octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: this.runnerRepositoryOwner,
                repo: this.runnerRepositoryName,
                path: pathInRunnerRespository,
            }).then((res)=>{
                return this.octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
                    owner: this.runnerRepositoryOwner,
                    repo: this.runnerRepositoryName,
                    path: pathInRunnerRespository,
                    message: 'Deleting file '+pathInRunnerRespository,
                    sha: res.data.sha
                })
                .catch(err => {
                    console.log("Unable to delete file");
                    console.log(err);
                });
            }, err=>{
                console.log('File doesn\'t already exist.')
            })
            .then(() => {
                return this.octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
                    owner: this.runnerRepositoryOwner,
                    repo: this.runnerRepositoryName,
                    path: pathInRunnerRespository,
                    message: 'Creating file '+pathInRunnerRespository,
                    content: new Buffer(data.toString()).toString('base64')
                })
                .then(() => {
                    console.log("Created file "+pathInRunnerRespository+" successfully.");
                })
                .catch(err => {
                    console.log("Unable to create file.");
                    console.log(err);
                });
            });
        })
        .catch(err => {
            console.log("Couldn't find local file.");
        });
    }

    deleteFile(pathInRunnerRespository) {
        return this.octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
            owner: this.runnerRepositoryOwner,
            repo: this.runnerRepositoryName,
            path: pathInRunnerRespository,
        }).then((res)=>{
            return this.octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
                owner: this.runnerRepositoryOwner,
                repo: this.runnerRepositoryName,
                path: pathInRunnerRespository,
                message: 'Deleting file '+pathInRunnerRespository,
                sha: res.data.sha
            })
            .then(res => {
                console.log("Sucessfully deleted "+pathInRunnerRespository);
            })
            .catch(err => {
                console.log("Unable to delete file in deleteFile");
                console.log(err);
            });
        })
        .catch(err => {
            console.log('File doesn\'t already exist.')
        });
    }

    runTests(pullId, pullBranch) {
        var mainWorkflowJson = {
            "name": "Integration test for "+this.testingRepositoryName,
            "on": {
                "repository_dispatch": {
                    "types": this.testingRepositoryName+"-call"
                }
            },
            "jobs": {
                "runTests": {
                    "name": "Validate release and master branch",
                    "runs-on": "ubuntu-latest"
                }  
            },
        }

        mainWorkflowJson.jobs.runTests.steps = new Array(); 

        const checkoutStep = {
            "uses": "actions/checkout@v2"
         };

        const checkoutPullBranchStep = {
            "uses": "actions/checkout@v2",
            "name": "Checkout from PR branch",
            "with": {
               "repository": testingRepositoryOwner+'/'+testingRepositoryName,
               "ref": pullBranch,
               "path": testingRepositoryName
            }
        };

        const initialPostStep = {
            "name": "Posting status to PR",
            "run": "curl   -X POST -u username:${{github.event.client_payload.token}} -H \"Accept: application/vnd.github.v3+json\" https://api.github.com/repos/sundargs2000/actions-e2e/statuses/${{github.event.client_payload.pullId}} -d '{\"state\":\"pending\"}'" 
        }

        mainWorkflowJson.jobs.runTests.steps = [checkoutStep, checkoutPullBranchStep, initialPostStep];
        
        if(!!this.setup)
            mainWorkflowJson.jobs.runTests.steps.push(...this.setup);

        this.tests.forEach(test => {
            if(!!test.workflowJson)
                mainWorkflowJson.jobs.runTests.steps.push(...test.workflowJson);
            if(!!test.testJson)
                mainWorkflowJson.jobs.runTests.steps.push(...test.testJson);
            if(!!test.deleteJson)
                mainWorkflowJson.jobs.runTests.steps.push(...test.deleteJson);
        });

        var postBackStep = {
            "if": "${{ always() }}",
            "name": "Posting back to PR",
            "run": "echo ${{job.status}}\nif [ ${{job.status}} = \"successs\" ]\nthen\n  curl   -X POST -u username:${{github.event.client_payload.token}} -H \"Accept: application/vnd.github.v3+json\" https://api.github.com/repos/sundargs2000/actions-e2e/statuses/${{github.event.client_payload.pullId}} -d '{\"state\":\"success\"}'\nelse\n  curl   -X POST -u username:${{github.event.client_payload.token}} -H \"Accept: application/vnd.github.v3+json\" https://api.github.com/repos/sundargs2000/actions-e2e/statuses/${{github.event.client_payload.pullId}} -d '{\"state\":\"failure\"}'\nfi\n"
        }
        mainWorkflowJson.jobs.runTests.steps.push(postBackStep);
        
        if(!!this.cleanup) {
            this.cleanup = this.cleanup.map(cleanupStep => {
                cleanupStep.if = "${{ always() }}"
                return cleanupStep;
            });
            mainWorkflowJson.jobs.runTests.steps.push(...this.cleanup);
        }
        // console.log(this.cleanup);
        
        console.log(JSON.stringify(mainWorkflowJson, null, 2));

        const yf = new yaml.Document();
        yf.contents = mainWorkflowJson;
        console.log(yf.toString());
        // console.log(this.runnerRepositoryToken);
        
        return this.octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
            owner: this.runnerRepositoryOwner,
            repo: this.runnerRepositoryName,
            path: '.github/workflows/'+this.testingRepositoryName+'.yaml',
        }).then((res)=>{
            return this.octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
                owner: this.runnerRepositoryOwner,
                repo: this.runnerRepositoryName,
                path: '.github/workflows/'+this.testingRepositoryName+'.yaml',
                message: 'Deleting workflow of '+this.testingRepositoryName,
                sha: res.data.sha
            });
        }, err=>{
            console.log('File doesn\'t already exist.')
        })
        .then(() => {
            return this.octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
                owner: this.runnerRepositoryOwner,
                repo: this.runnerRepositoryName,
                path: '.github/workflows/'+this.testingRepositoryName+'.yaml',
                message: 'Creating workflow for '+this.testingRepositoryName,
                content: new Buffer(yf.toString()).toString('base64')
            })
            .then(res => {
                return this.octokit.request('POST /repos/{owner}/{repo}/dispatches', {
                    owner: this.runnerRepositoryOwner,
                    repo: this.runnerRepositoryName,
                    event_type: this.testingRepositoryName+"-call",
                    client_payload: { token: this.testingRepositoryToken, pullId: pullId }  
                })
                .catch(err => {
                    console.log("Error occured while posting dispatch!!");
                    console.log(err);
                })
            })
            .catch(err => {
                console.log("Error while trying to create file.");
                console.log(err);
            })
        })
        .catch(() => {
            console.log("Error deleting file.");
        });
    }
}

// user written code
var runnerRepositoryOwner = 'sundargs2000';
var runnerRepositoryName = 'testing-automation';
var runnerRepositoryToken = process.argv[2]
var testingRepositoryOwner = 'sundargs2000';
var testingRepositoryName = 'k8s-deploy';
var testingRepositoryToken = process.argv[2]

var k8sDeployTestObject = new actionsTest(runnerRepositoryOwner, runnerRepositoryName, runnerRepositoryToken, testingRepositoryOwner, testingRepositoryName, testingRepositoryToken);

// defining setup steps
const kubectlSetupStep = {
    "uses": "Azure/setup-kubectl@v1",
    "name": "Install Kubectl"
}

const kubeConfigSetupStep = {
    "uses": "azure/k8s-set-context@v1",
    "name": "Set AKS context",
        "with": {
            "method": "kubeconfig",
            "kubeconfig": "${{ secrets.kubeconfig }}"
        }
}

const createNamespaceSetupStep = {
    "name": "Create namespace if required",
    "run": "kubectl create namespace integration-test-k8s-deploy-ubuntu --dry-run=client -o json | kubectl apply -f -\n"
}

const buildSetupStep = {
    "name": "Building latest changes",
    "run": "cd k8s-deploy\nnpm install --prod\n"
}

const pythonSetupStep = {
    "uses": "actions/setup-python@v2",
    "name": "Install Python",
    "with": {
      "python-version": "3.x"
    }
}

k8sDeployTestObject.addSetup([kubectlSetupStep, kubeConfigSetupStep, createNamespaceSetupStep, buildSetupStep, pythonSetupStep]);

const deletePrevStep = {
    "name": "Cleaning any previously created items",
    "run": "python K8sDeployActionResources/k8s-deploy-delete.py 'Service' 'nginx-service' ubuntu\npython K8sDeployActionResources/k8s-deploy-delete.py 'Service' 'nginx-service-green' ubuntu\npython K8sDeployActionResources/k8s-deploy-delete.py 'Deployment' 'nginx-deployment-green' ubuntu\npython K8sDeployActionResources/k8s-deploy-delete.py 'Deployment' 'nginx-deployment' ubuntu\npython K8sDeployActionResources/k8s-deploy-delete.py 'Ingress' 'nginx-ingress' ubuntu\n"
}

// defining first test
const firstTestWorkflow = {
    "name": "Executing deploy action on ubuntu",
    "uses": "./k8s-deploy",
    "with": {
      "namespace": "integration-test-k8s-deploy-ubuntu",
      "images": "nginx:1.14.2",
      "manifests": "K8sDeployActionResources/manifests/test-service.yml\n",
      "strategy": "blue-green",
      "route-method": "service",
      "action": "deploy"
    }
}

const firstTestChecks = {
    "name": "Checking if deploments and services were created with green labels",
    "run": "python K8sDeployActionResources/k8s-deploy-test.py 'Deployment' 'nginx-deployment-green' 'green' ubuntu\npython K8sDeployActionResources/k8s-deploy-test.py 'Service' 'nginx-service' 'green' ubuntu\n"
}

k8sDeployTestObject.addTest("basic-deploy", [deletePrevStep, firstTestWorkflow], [firstTestChecks], []);

// defining second test
const secondTestWorkflow = {
    "name": "Executing promote action on ubuntu",
    "uses": "./k8s-deploy",
    "with": {
      "namespace": "integration-test-k8s-deploy-ubuntu",
      "images": "nginx:1.14.2",
      "manifests": "K8sDeployActionResources/manifests/test-service.yml\n",
      "strategy": "blue-green",
      "route-method": "service",
      "action": "promote"
    }
}

const secondTestChecks = {
    "name": "Checking if deploments and services were created with none labels after promote",
    "run": "python K8sDeployActionResources/k8s-deploy-test.py 'Deployment' 'nginx-deployment' 'None' ubuntu\npython K8sDeployActionResources/k8s-deploy-test.py 'Service' 'nginx-service' 'None' ubuntu\n"
}

k8sDeployTestObject.addTest("basic-promote", [secondTestWorkflow], [secondTestChecks], []);

// defining third tests
const thirdTestWorkflow = {
    "name": "Executing deploy action on ubuntu",
    "uses": "./k8s-deploy",
    "with": {
      "namespace": "integration-test-k8s-deploy-ubuntu",
      "images": "nginx:1.19.1",
      "manifests": "K8sDeployActionResources/manifests/test-service.yml\n",
      "strategy": "blue-green",
      "route-method": "service",
      "action": "deploy"
    }
}

const thirdTestChecks = {
    "name": "Checking if deploments and services were created with green labels, and old workloads persist on deploy",
    "run": "python K8sDeployActionResources/k8s-deploy-test.py 'Deployment' 'nginx-deployment-green' 'green' ubuntu\npython K8sDeployActionResources/k8s-deploy-test.py 'Service' 'nginx-service' 'green' ubuntu\npython K8sDeployActionResources/k8s-deploy-test.py 'Deployment' 'nginx-deployment' 'None' ubuntu\n"
}

k8sDeployTestObject.addTest("deploy-with-exist", [thirdTestWorkflow], [thirdTestChecks], []);

const fourthTestWorkflow = {
    "name": "Executing reject action on ubuntu",
    "uses": "./k8s-deploy",
    "with": {
      "namespace": "integration-test-k8s-deploy-ubuntu",
      "images": "nginx:1.19.1",
      "manifests": "K8sDeployActionResources/manifests/test-service.yml\n",
      "strategy": "blue-green",
      "route-method": "service",
      "action": "reject"
    }
}

const fourthTestChecks = {
    "name": "Checking if deploments and services were routed back to none labels after reject",
    "run": "python K8sDeployActionResources/k8s-deploy-test.py 'Deployment' 'nginx-deployment' 'None' ubuntu\npython K8sDeployActionResources/k8s-deploy-test.py 'Service' 'nginx-service' 'None' ubuntu\n"
} 

const fourthTestCleanup = {
    "name": "Cleaning up current set up",
    "run": "python K8sDeployActionResources/k8s-deploy-delete.py 'Service' 'nginx-service' ubuntu\npython K8sDeployActionResources/k8s-deploy-delete.py 'Deployment' 'nginx-deployment' ubuntu\n"
}

k8sDeployTestObject.addTest("basic-reject", [fourthTestWorkflow], [fourthTestChecks], [fourthTestCleanup, deletePrevStep]);


k8sDeployTestObject.createFile('./manifests/test-ingress.yml', 'K8sDeployActionResources/manifests/test-ingress.yml')
.then(() => 
    k8sDeployTestObject.createFile('./manifests/test-service.yml', 'K8sDeployActionResources/manifests/test-service.yml')
    .then(() =>
        k8sDeployTestObject.createFile('./k8s-deploy-delete.py', 'K8sDeployActionResources/k8s-deploy-delete.py')
        .then(() =>
            k8sDeployTestObject.createFile('./k8s-deploy-test.py', 'K8sDeployActionResources/k8s-deploy-test.py')
            .then(() => 
                k8sDeployTestObject.runTests(process.argv[3], process.argv[4])
                .then(() => 
                    k8sDeployTestObject.deleteFile('K8sDeployActionResources/manifests/test-ingress.yml')
                    .then(() =>
                        k8sDeployTestObject.deleteFile('K8sDeployActionResources/manifests/test-service.yml')
                        .then(() => 
                            k8sDeployTestObject.deleteFile('K8sDeployActionResources/k8s-deploy-delete.py')
                            .then(() =>
                                k8sDeployTestObject.deleteFile('K8sDeployActionResources/k8s-deploy-test.py')
                                .then(() => console.log("Everything done!!"))
                            )
                        )
                    )
                )
            )
        )
    )
);

