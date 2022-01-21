"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setImagePullSecrets = exports.getImagePullSecrets = void 0;
const kubernetesTypes_1 = require("../types/kubernetesTypes");
function getImagePullSecrets(inputObject) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!(inputObject === null || inputObject === void 0 ? void 0 : inputObject.spec))
        return null;
    if (inputObject.kind.toLowerCase() === kubernetesTypes_1.KubernetesWorkload.CRON_JOB.toLowerCase())
        return (_e = (_d = (_c = (_b = (_a = inputObject === null || inputObject === void 0 ? void 0 : inputObject.spec) === null || _a === void 0 ? void 0 : _a.jobTemplate) === null || _b === void 0 ? void 0 : _b.spec) === null || _c === void 0 ? void 0 : _c.template) === null || _d === void 0 ? void 0 : _d.spec) === null || _e === void 0 ? void 0 : _e.imagePullSecrets;
    if (inputObject.kind.toLowerCase() === kubernetesTypes_1.KubernetesWorkload.POD.toLowerCase())
        return inputObject.spec.imagePullSecrets;
    if ((_g = (_f = inputObject === null || inputObject === void 0 ? void 0 : inputObject.spec) === null || _f === void 0 ? void 0 : _f.template) === null || _g === void 0 ? void 0 : _g.spec) {
        return inputObject.spec.template.spec.imagePullSecrets;
    }
}
exports.getImagePullSecrets = getImagePullSecrets;
function setImagePullSecrets(inputObject, newImagePullSecrets) {
    var _a, _b, _c, _d, _e, _f;
    if (!inputObject || !inputObject.spec || !newImagePullSecrets)
        return;
    if (inputObject.kind.toLowerCase() === kubernetesTypes_1.KubernetesWorkload.POD.toLowerCase()) {
        inputObject.spec.imagePullSecrets = newImagePullSecrets;
        return;
    }
    if (inputObject.kind.toLowerCase() === kubernetesTypes_1.KubernetesWorkload.CRON_JOB.toLowerCase()) {
        if ((_d = (_c = (_b = (_a = inputObject === null || inputObject === void 0 ? void 0 : inputObject.spec) === null || _a === void 0 ? void 0 : _a.jobTemplate) === null || _b === void 0 ? void 0 : _b.spec) === null || _c === void 0 ? void 0 : _c.template) === null || _d === void 0 ? void 0 : _d.spec)
            inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets =
                newImagePullSecrets;
        return;
    }
    if ((_f = (_e = inputObject === null || inputObject === void 0 ? void 0 : inputObject.spec) === null || _e === void 0 ? void 0 : _e.template) === null || _f === void 0 ? void 0 : _f.spec) {
        inputObject.spec.template.spec.imagePullSecrets = newImagePullSecrets;
        return;
    }
}
exports.setImagePullSecrets = setImagePullSecrets;
