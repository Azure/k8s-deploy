import * as fs from 'fs';
import * as inputParam from '../src/input-parameters';
import * as fileHelper from '../src/utilities/files-helper';
import {
	Kubectl,
} from '../src/kubectl-object-model';
import {
	mocked
} from 'ts-jest/utils';
import * as kubectlUtils from '../src/utilities/kubectl-util';

var path = require('path');
const inputParamMock = mocked(inputParam, true);
var deploymentYaml = "";

import * as blueGreenHelper from '../src/utilities/strategy-helpers/blue-green-helper';
import * as blueGreenHelperService from '../src/utilities/strategy-helpers/service-blue-green-helper';
import * as blueGreenHelperIngress from '../src/utilities/strategy-helpers/ingress-blue-green-helper';
import * as blueGreenHelperSMI from '../src/utilities/strategy-helpers/smi-blue-green-helper';

beforeAll(() => {
	deploymentYaml = fs.readFileSync(path.join(__dirname, 'manifests', 'bg.yml'), 'utf8');
	process.env["KUBECONFIG"] = 'kubeConfig';
});

test("deployBlueGreen - checks if deployment can be done, then deploys", () => {
	const fileHelperMock = mocked(fileHelper, true);
	const kubeCtl: jest.Mocked < Kubectl > = new Kubectl("") as any;
	let temp = {
		stdout: undefined
	};
	fileHelperMock.writeObjectsToFile = jest.fn().mockReturnValue('hello');
	kubeCtl.apply = jest.fn().mockReturnValue('');
	kubeCtl.getResource = jest.fn().mockReturnValue(JSON.parse(JSON.stringify(temp)));
	const readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => deploymentYaml);

	//Invoke and assert
	expect(blueGreenHelperService.deployBlueGreenService(kubeCtl, ['manifests/bg.yaml'])).toMatchObject({
		"newFilePaths": "hello",
		"result": ""
	});
	expect(readFileSpy).toBeCalledWith("manifests/bg.yaml");
	expect(fileHelperMock.writeObjectsToFile).toBeCalled();
	expect(kubeCtl.apply).toBeCalled();
});

test("blueGreenPromote - checks if in deployed state and then promotes", () => {
	const fileHelperMock = mocked(fileHelper, true);
	const kubeCtl: jest.Mocked < Kubectl > = new Kubectl("") as any;
	let temp = {
		stdout: JSON.stringify({
			"apiVersion": "v1",
			"kind": "Service",
			"metadata": {
				"name": "testservice"
			},
			"spec": {
				"selector": {
					"app": "testapp",
					"k8s.deploy.color": "green"
				},
				"ports": [{
					"protocol": "TCP",
					"port": 80,
					"targetPort": 80
				}]
			}
		})
	};
	fileHelperMock.writeObjectsToFile = jest.fn().mockReturnValue('hello');
	kubeCtl.apply = jest.fn().mockReturnValue('');
	kubeCtl.getResource = jest.fn().mockReturnValue(JSON.parse(JSON.stringify(temp)));
	const readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => deploymentYaml);
	//Invoke and assert
	const manifestObjects = blueGreenHelper.getManifestObjects(['manifests/bg.yaml']);
	expect(blueGreenHelperService.promoteBlueGreenService(kubeCtl, manifestObjects)).toMatchObject({});
	expect(readFileSpy).toBeCalledWith("manifests/bg.yaml");
	expect(kubeCtl.apply).toBeCalledWith("hello");
	expect(fileHelperMock.writeObjectsToFile).toBeCalled();
});

test("blueGreenReject - routes servcies to old deployment and deletes new deployment", () => {
	const fileHelperMock = mocked(fileHelper, true);
	const kubeCtl: jest.Mocked < Kubectl > = new Kubectl("") as any;
	let temp = {
		stdout: JSON.stringify({
			"apiVersion": "apps/v1beta1",
			"kind": "Deployment",
			"metadata": {
				"name": "testapp",
				"labels": {
					"k8s.deploy.color": "none"
				}
			},
			"spec": {
				"selector": {
					"matchLabels": {
						"app": "testapp",
						"k8s.deploy.color": "none"
					}
				},
				"replicas": 1,
				"template": {
					"metadata": {
						"labels": {
							"app": "testapp",
							"k8s.deploy.color": "none"
						}
					},
					"spec": {
						"containers": [{
							"name": "testapp",
							"image": "testcr.azurecr.io/testapp",
							"ports": [{
								"containerPort": 80
							}]
						}]
					}
				}
			}
		})
	};
	kubeCtl.delete = jest.fn().mockReturnValue('');
	fileHelperMock.writeObjectsToFile = jest.fn().mockReturnValue('hello');
	kubeCtl.apply = jest.fn().mockReturnValue('');
	kubeCtl.getResource = jest.fn().mockReturnValue(JSON.parse(JSON.stringify(temp)));
	const readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => deploymentYaml);

	//Invoke and assert
	expect(blueGreenHelperService.rejectBlueGreenService(kubeCtl, ['manifests/bg.yaml'])).toMatchObject({});
	expect(kubeCtl.delete).toBeCalledWith(["Deployment", "testapp-green"]);
	expect(readFileSpy).toBeCalledWith("manifests/bg.yaml");
	expect(fileHelperMock.writeObjectsToFile).toBeCalled();
});

test("blueGreenReject - deletes services if old deployment does not exist", () => {
	const fileHelperMock = mocked(fileHelper, true);
	const kubeCtl: jest.Mocked < Kubectl > = new Kubectl("") as any;
	let temp = {
		stdout: undefined
	};
	fileHelperMock.writeObjectsToFile = jest.fn().mockReturnValue('hello');
	kubeCtl.apply = jest.fn().mockReturnValue('');
	kubeCtl.delete = jest.fn().mockReturnValue('');
	kubeCtl.getResource = jest.fn().mockReturnValue(JSON.parse(JSON.stringify(temp)));
	const readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => deploymentYaml);

	//Invoke and assert
	expect(blueGreenHelperService.rejectBlueGreenService(kubeCtl, ['manifests/bg.yaml'])).toMatchObject({});
	expect(kubeCtl.delete).toBeCalledWith(["Deployment", "testapp-green"]);
	expect(readFileSpy).toBeCalledWith("manifests/bg.yaml");
	expect(fileHelperMock.writeObjectsToFile).toBeCalled();
});

test("isIngressRoute() - returns true if route-method is ingress", () => {
	// default is service
	expect(blueGreenHelper.isIngressRoute()).toBeFalsy();
});

test("isIngressRoute() - returns true if route-method is ingress", () => {
	inputParamMock.routeMethod = 'ingress'
	expect(blueGreenHelper.isIngressRoute()).toBeTruthy();
});

test("deployBlueGreenIngress - creates deployments, services and other non ingress objects", () => {
	const fileHelperMock = mocked(fileHelper, true);
	const kubeCtl: jest.Mocked < Kubectl > = new Kubectl("") as any;
	let temp = {
		stdout: undefined
	};
	fileHelperMock.writeObjectsToFile = jest.fn().mockReturnValue('hello');
	kubeCtl.apply = jest.fn().mockReturnValue('');
	kubeCtl.getResource = jest.fn().mockReturnValue(JSON.parse(JSON.stringify(temp)));
	const readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => deploymentYaml);

	//Invoke and assert
	expect(blueGreenHelperIngress.deployBlueGreenIngress(kubeCtl, ['manifests/bg.yaml'])).toMatchObject({
		"newFilePaths": "hello",
		"result": ""
	});
	expect(readFileSpy).toBeCalledWith("manifests/bg.yaml");
	expect(kubeCtl.apply).toBeCalledWith("hello");
});

test("blueGreenPromoteIngress - checks if in deployed state and then promotes ingress", () => {
	const fileHelperMock = mocked(fileHelper, true);
	const kubeCtl: jest.Mocked < Kubectl > = new Kubectl("") as any;
	fileHelperMock.writeObjectsToFile = jest.fn().mockReturnValue('hello');
	kubeCtl.apply = jest.fn().mockReturnValue('');
	const readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => deploymentYaml);
	let temp = {
		stdout: JSON.stringify({
			"apiVersion": "networking.k8s.io/v1beta1",
			"kind": "Ingress",
			"metadata": {
				"name": "testingress",
				"labels": {
					"k8s.deploy.color": "green"
				},
				"annotations": {
					"nginx.ingress.kubernetes.io/rewrite-target": "/"
				}
			},
			"spec": {
				"rules": [{
					"http": {
						"paths": [{
							"path": "/testpath",
							"pathType": "Prefix",
							"backend": {
								"serviceName": "testservice-green",
								"servicePort": 80
							}
						}]
					}
				}]
			}
		})
	};
	kubeCtl.getResource = jest.fn().mockReturnValue(JSON.parse(JSON.stringify(temp)));
	const manifestObjects = blueGreenHelper.getManifestObjects(['manifests/bg.yaml']);
	//Invoke and assert
	expect(blueGreenHelperIngress.promoteBlueGreenIngress(kubeCtl, manifestObjects)).toMatchObject({});
	expect(readFileSpy).toBeCalledWith("manifests/bg.yaml");
	expect(kubeCtl.apply).toBeCalledWith("hello");
});

test("blueGreenRejectIngress - routes ingress to stable services and deletes new deployments and services", () => {
	const fileHelperMock = mocked(fileHelper, true);
	const kubeCtl: jest.Mocked < Kubectl > = new Kubectl("") as any;
	fileHelperMock.writeObjectsToFile = jest.fn().mockReturnValue('hello');
	kubeCtl.apply = jest.fn().mockReturnValue('');
	kubeCtl.delete = jest.fn().mockReturnValue('');
	const readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => deploymentYaml);

	//Invoke and assert
	expect(blueGreenHelperIngress.rejectBlueGreenIngress(kubeCtl, ['manifests/bg.yaml'])).toMatchObject({});
	expect(kubeCtl.delete).toBeCalledWith(["Deployment", "testapp-green"]);
	expect(kubeCtl.delete).toBeCalledWith(["Service", "testservice-green"]);
	expect(readFileSpy).toBeCalledWith("manifests/bg.yaml");
	expect(fileHelperMock.writeObjectsToFile).toBeCalled();
});

test("isSMIRoute() - returns true if route-method is smi", () => {
	inputParamMock.routeMethod = 'smi'
	expect(blueGreenHelper.isSMIRoute()).toBeTruthy();
});

test("isSMIRoute() - returns true if route-method is smi", () => {
	inputParamMock.routeMethod = 'ingress'
	expect(blueGreenHelper.isSMIRoute()).toBeFalsy();
});

test("deployBlueGreenSMI - checks if deployment can be done, then deploys along this auxiliary services and trafficsplit", () => {
	const fileHelperMock = mocked(fileHelper, true);
	const kubeCtl: jest.Mocked < Kubectl > = new Kubectl("") as any;
	let temp = {
		stdout: undefined
	};
	fileHelperMock.writeObjectsToFile = jest.fn().mockReturnValue('hello');
	kubeCtl.apply = jest.fn().mockReturnValue('');
	kubeCtl.getResource = jest.fn().mockReturnValue(JSON.parse(JSON.stringify(temp)));
	const readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => deploymentYaml);
	const kubectlUtilsMock = mocked(kubectlUtils, true);
	kubectlUtilsMock.getTrafficSplitAPIVersion = jest.fn().mockReturnValue('split.smi-spec.io/v1alpha2');

	//Invoke and assert
	expect(blueGreenHelperSMI.deployBlueGreenSMI(kubeCtl, ['manifests/bg.yaml'])).toMatchObject({
		"newFilePaths": "hello",
		"result": ""
	});
	expect(readFileSpy).toBeCalledWith("manifests/bg.yaml");
	expect(fileHelperMock.writeObjectsToFile).toBeCalled();
});

test("blueGreenPromoteSMI - checks weights of trafficsplit and then deploys", () => {
	const fileHelperMock = mocked(fileHelper, true);
	const kubeCtl: jest.Mocked < Kubectl > = new Kubectl("") as any;
	fileHelperMock.writeObjectsToFile = jest.fn().mockReturnValue('hello');
	kubeCtl.apply = jest.fn().mockReturnValue('');
	const readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => deploymentYaml);
	let temp = {
		stdout: JSON.stringify({
			"apiVersion": "split.smi-spec.io/v1alpha2",
			"kind": "TrafficSplit",
			"metadata": {
				"name": "testservice-rollout"
			},
			"spec": {
				"service": "testservice",
				"backends": [{
						"service": "testservice-stable",
						"weight": 0
					},
					{
						"service": "testservice-green",
						"weight": 100
					}
				]
			}
		})
	};
	kubeCtl.getResource = jest.fn().mockReturnValue(JSON.parse(JSON.stringify(temp)));
	const manifestObjects = blueGreenHelper.getManifestObjects(['manifests/bg.yaml']);
	//Invoke and assert
	expect(blueGreenHelperSMI.promoteBlueGreenSMI(kubeCtl, manifestObjects)).toMatchObject({});
	expect(readFileSpy).toBeCalledWith("manifests/bg.yaml");
});

test("blueGreenRejectSMI - routes servcies to old deployment and deletes new deployment, auxiliary services and trafficsplit", () => {
	const fileHelperMock = mocked(fileHelper, true);
	const kubeCtl: jest.Mocked < Kubectl > = new Kubectl("") as any;
	let temp = {
		stdout: JSON.stringify({
			"apiVersion": "apps/v1beta1",
			"kind": "Deployment",
			"metadata": {
				"name": "testapp",
				"labels": {
					"k8s.deploy.color": "none"
				}
			},
			"spec": {
				"selector": {
					"matchLabels": {
						"app": "testapp",
						"k8s.deploy.color": "none"

					}
				},
				"replicas": 1,
				"template": {
					"metadata": {
						"labels": {
							"app": "testapp",
							"k8s.deploy.color": "none"
						}
					},
					"spec": {
						"containers": [{
							"name": "testapp",
							"image": "testcr.azurecr.io/testapp",
							"ports": [{
								"containerPort": 80
							}]
						}]
					}
				}
			}
		})
	};
	kubeCtl.delete = jest.fn().mockReturnValue('');
	fileHelperMock.writeObjectsToFile = jest.fn().mockReturnValue('hello');
	kubeCtl.apply = jest.fn().mockReturnValue('');
	kubeCtl.getResource = jest.fn().mockReturnValue(JSON.parse(JSON.stringify(temp)));
	const readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => deploymentYaml);

	//Invoke and assert
	expect(blueGreenHelperSMI.rejectBlueGreenSMI(kubeCtl, ['manifests/bg.yaml'])).toMatchObject({});
	expect(kubeCtl.delete).toBeCalledWith(["Deployment", "testapp-green"]);
	expect(kubeCtl.delete).toBeCalledWith(["Service", "testservice-green"]);
	expect(kubeCtl.delete).toBeCalledWith(["Service", "testservice-stable"]);
	expect(kubeCtl.delete).toBeCalledWith(["TrafficSplit", "testservice-trafficsplit"]);
	expect(readFileSpy).toBeCalledWith("manifests/bg.yaml");
});

test("blueGreenRejectSMI - deletes service if stable deployment doesn't exist", () => {
	const fileHelperMock = mocked(fileHelper, true);
	const kubeCtl: jest.Mocked < Kubectl > = new Kubectl("") as any;
	let temp = {
		stdout: undefined
	};
	kubeCtl.delete = jest.fn().mockReturnValue('');
	fileHelperMock.writeObjectsToFile = jest.fn().mockReturnValue('hello');
	kubeCtl.apply = jest.fn().mockReturnValue('');
	kubeCtl.getResource = jest.fn().mockReturnValue(JSON.parse(JSON.stringify(temp)));
	const readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => deploymentYaml);

	//Invoke and assert
	expect(blueGreenHelperSMI.rejectBlueGreenSMI(kubeCtl, ['manifests/bg.yaml'])).toMatchObject({});
	expect(kubeCtl.delete).toBeCalledWith(["Deployment", "testapp-green"]);
	expect(kubeCtl.delete).toBeCalledWith(["Service", "testservice-green"]);
	expect(kubeCtl.delete).toBeCalledWith(["Service", "testservice-stable"]);
	expect(kubeCtl.delete).toBeCalledWith(["TrafficSplit", "testservice-trafficsplit"]);
	expect(readFileSpy).toBeCalledWith("manifests/bg.yaml");
});

// other functions and branches
test("blueGreenRouteIngress - routes to green services in nextlabel is green", () => {
	const kubeCtl: jest.Mocked < Kubectl > = new Kubectl("") as any;
	const fileHelperMock = mocked(fileHelper, true);
	const ingEntList = [{
			"apiVersion": "networking.k8s.io/v1beta1",
			"kind": "Ingress",
			"metadata": {
				"name": "test-ingress",
				"annotations": {
					"nginx.ingress.kubernetes.io/rewrite-target": "/"
				},
			},
			"spec": {
				"rules": [{
					"http": {
						"paths": [{
								"path": "/testpath",
								"pathType": "Prefix",
								"backend": {
									"serviceName": "testservice",
									"servicePort": 80
								}
							},
							{
								"path": "/testpath",
								"pathType": "Prefix",
								"backend": {
									"serviceName": "random",
									"servicePort": 80
								}
							}
						]
					}
				}]
			}
		},
		{
			"apiVersion": "networking.k8s.io/v1beta1",
			"kind": "Ingress",
			"metadata": {
				"name": "test-ingress",
				"annotations": {
					"nginx.ingress.kubernetes.io/rewrite-target": "/"
				},
			},
			"spec": {
				"rules": [{
					"http": {
						"paths": [{
							"path": "/testpath",
							"pathType": "Prefix",
							"backend": {
								"serviceName": "random",
								"servicePort": 80
							}
						}]
					}
				}]
			}
		}
	];

	const serEntList = [{
		"apiVersion": "v1",
		"kind": "Service",
		"metadata": {
			"name": "testservice"
		},
		"spec": {
			"selector": {
				"app": "testapp",
			},
			"ports": [{
				"protocol": "TCP",
				"port": 80,
				"targetPort": 80
			}]
		}
	}];

	let serviceEntityMap = new Map<string, string>();
	serviceEntityMap.set('testservice', 'testservice-green');
	fileHelperMock.writeObjectsToFile = jest.fn().mockReturnValue('hello');
	kubeCtl.apply = jest.fn().mockReturnValue('');

	//Invoke and assert
	expect(blueGreenHelperIngress.routeBlueGreenIngress(kubeCtl, 'green', serviceEntityMap, ingEntList));
	expect(kubeCtl.apply).toBeCalled();
	expect(fileHelperMock.writeObjectsToFile).toBeCalled();
});

test("shouldWePromoteIngress - throws if routed ingress does not exist", () => {
	const kubeCtl: jest.Mocked < Kubectl > = new Kubectl("") as any;
	let temp = {
		stdout: undefined
	}

	const ingEntList = [{
		"apiVersion": "networking.k8s.io/v1beta1",
		"kind": "Ingress",
		"metadata": {
			"name": "test-ingress",
			"annotations": {
				"nginx.ingress.kubernetes.io/rewrite-target": "/"
			}
		},
		"spec": {
			"rules": [{
				"http": {
					"paths": [{
						"path": "/testpath",
						"pathType": "Prefix",
						"backend": {
							"serviceName": "testservice",
							"servicePort": 80
						}
					}]
				}
			}]
		}
	}];

	let serviceEntityMap = new Map<string, string>();
	serviceEntityMap.set('testservice', 'testservice-green');

	kubeCtl.getResource = jest.fn().mockReturnValue(JSON.parse(JSON.stringify(temp)));

	//Invoke and assert
	expect(blueGreenHelperIngress.validateIngressesState(kubeCtl, ingEntList, serviceEntityMap)).toBeFalsy();
});

test("validateTrafficSplitState - throws if trafficsplit in wrong state", () => {
	const kubeCtl: jest.Mocked < Kubectl > = new Kubectl("") as any;
	let temp = {
		stdout: JSON.stringify({
			"apiVersion": "split.smi-spec.io/v1alpha2",
			"kind": "TrafficSplit",
			"metadata": {
				"name": "testservice-trafficsplit"
			},
			"spec": {
				"service": "testservice",
				"backends": [{
						"service": "testservice-stable",
						"weight": 100
					},
					{
						"service": "testservice-green",
						"weight": 0
					}
				]
			}
		})
	}

	const depEntList = [{
		"apiVersion": "apps/v1beta1",
		"kind": "Deployment",
		"metadata": {
			"name": "testapp",
		},
		"spec": {
			"selector": {
				"matchLabels": {
					"app": "testapp",
				}
			},
			"replicas": 1,
			"template": {
				"metadata": {
					"labels": {
						"app": "testapp",
					}
				},
				"spec": {
					"containers": [{
						"name": "testapp",
						"image": "testcr.azurecr.io/testapp",
						"ports": [{
							"containerPort": 80
						}]
					}]
				}
			}
		}
	}];

	const serEntList = [{
		"apiVersion": "v1",
		"kind": "Service",
		"metadata": {
			"name": "testservice"
		},
		"spec": {
			"selector": {
				"app": "testapp",
			},
			"ports": [{
				"protocol": "TCP",
				"port": 80,
				"targetPort": 80
			}]
		}
	}];
	kubeCtl.getResource = jest.fn().mockReturnValue(JSON.parse(JSON.stringify(temp)));

	//Invoke and assert
	expect(blueGreenHelperSMI.validateTrafficSplitsState(kubeCtl, serEntList)).toBeFalsy();
});

test("validateTrafficSplitState - throws if trafficsplit in wrong state", () => {
	const kubeCtl: jest.Mocked < Kubectl > = new Kubectl("") as any;
	let temp = {
		stdout: JSON.stringify({
			"apiVersion": "split.smi-spec.io/v1alpha2",
			"kind": "TrafficSplit",
			"metadata": {
				"name": "testservice-trafficsplit"
			},
			"spec": {
				"service": "testservice",
				"backends": [{
						"service": "testservice-stable",
						"weight": 0
					},
					{
						"service": "testservice-green",
						"weight": 0
					}
				]
			}
		})
	}

	const depEntList = [{
		"apiVersion": "apps/v1beta1",
		"kind": "Deployment",
		"metadata": {
			"name": "testapp",
		},
		"spec": {
			"selector": {
				"matchLabels": {
					"app": "testapp",
				}
			},
			"replicas": 1,
			"template": {
				"metadata": {
					"labels": {
						"app": "testapp",
					}
				},
				"spec": {
					"containers": [{
						"name": "testapp",
						"image": "testcr.azurecr.io/testapp",
						"ports": [{
							"containerPort": 80
						}]
					}]
				}
			}
		}
	}];

	const serEntList = [{
		"apiVersion": "v1",
		"kind": "Service",
		"metadata": {
			"name": "testservice"
		},
		"spec": {
			"selector": {
				"app": "testapp",
			},
			"ports": [{
				"protocol": "TCP",
				"port": 80,
				"targetPort": 80
			}]
		}
	}];
	kubeCtl.getResource = jest.fn().mockReturnValue(JSON.parse(JSON.stringify(temp)));

	//Invoke and assert
	expect(blueGreenHelperSMI.validateTrafficSplitsState(kubeCtl, serEntList)).toBeFalsy();
});

test("getSuffix() - returns BLUE_GREEN_SUFFIX if BLUE_GREEN_NEW_LABEL_VALUE is given, else emrty string", () => {
	expect(blueGreenHelper.getSuffix('green')).toBe('-green');
});

test("getSuffix() - returns BLUE_GREEN_SUFFIX if BLUE_GREEN_NEW_LABEL_VALUE is given, else emrty string", () => {
	expect(blueGreenHelper.getSuffix('random')).toBe('');
});

test("getServiceSpacLabel() - returns empty string if BLUE_GREEN_VERSION_LABEL in spec selector doesn't exist", () => {
	let input = {
		"apiVersion": "apps/v1",
		"kind": "Deployment",
		"metadata": {
			"name": "sample-deployment"
		},
		"spec": {
			"selector": {
				"matchLabels": {
					"app": "sample",
					"k8s.deploy.color": "green"
				}
			},
			"template": {
				"metadata": {
					"labels": {
						"app": "sample"
					},
					"annotations": {
						"prometheus.io/scrape": "true",
						"prometheus.io/port": "8888"
					}
				},
				"spec": {
					"containers": [{
						"name": "sample",
						"image": "tsugunt/sample:v34",
						"ports": [{
							"containerPort": 8888
						}]
					}]
				}
			}
		}
	}
	expect(blueGreenHelperService.getServiceSpecLabel(input)).toBe('');
});

test("getDeploymentMatchLabels() - return false is input doesnt have matchLabels", () => {
	let input = {
		"apiVersion": "v1",
		"kind": "Service",
		"metadata": {
			"name": "sample-service"
		},
		"spec": {
			"selector": {
				"app": "sample",
				"k8s.deploy.color": "green"
			},
			"ports": [{
				"protocol": "TCP",
				"port": 80,
				"targetPort": 8888,
				"nodePort": 31002
			}],
			"type": "NodePort"
		}
	}

	expect(blueGreenHelper.getDeploymentMatchLabels(input)).toBeFalsy();
});

test("getServiceSelector() - return false if spec selector does not exist", () => {
	let input = {
		"apiVersion": "networking.k8s.io/v1beta1",
		"kind": "Ingress",
		"metadata": {
			"name": "test-ingress",
			"annotations": {
				"nginx.ingress.kubernetes.io/rewrite-target": "/"
			}
		},
		"spec": {
			"rules": [{
				"http": {
					"paths": [{
						"path": "/testpath",
						"pathType": "Prefix",
						"backend": {
							"serviceName": "test",
							"servicePort": 80
						}
					}]
				}
			}]
		}
	}

	expect(blueGreenHelper.getServiceSelector(input)).toBeFalsy();
});