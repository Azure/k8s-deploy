"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setSpecSelectorLabels = exports.getSpecSelectorLabels = exports.updateSpecLabels = void 0;
const kubernetesTypes_1 = require("../types/kubernetesTypes");
function updateSpecLabels(inputObject, newLabels, override) {
    if (!inputObject)
        throw kubernetesTypes_1.NullInputObjectError;
    if (!inputObject.kind)
        throw kubernetesTypes_1.InputObjectKindNotDefinedError;
    if (!newLabels)
        return;
    let existingLabels = getSpecLabels(inputObject);
    if (override) {
        existingLabels = newLabels;
    }
    else {
        existingLabels = existingLabels || new Map();
        Object.keys(newLabels).forEach((key) => (existingLabels[key] = newLabels[key]));
    }
    setSpecLabels(inputObject, existingLabels);
}
exports.updateSpecLabels = updateSpecLabels;
function getSpecLabels(inputObject) {
    var _a, _b;
    if (!inputObject)
        return null;
    if (inputObject.kind.toLowerCase() === kubernetesTypes_1.KubernetesWorkload.POD.toLowerCase())
        return inputObject.metadata.labels;
    if ((_b = (_a = inputObject === null || inputObject === void 0 ? void 0 : inputObject.spec) === null || _a === void 0 ? void 0 : _a.template) === null || _b === void 0 ? void 0 : _b.metadata)
        return inputObject.spec.template.metadata.labels;
    return null;
}
function setSpecLabels(inputObject, newLabels) {
    var _a, _b;
    if (!inputObject || !newLabels)
        return null;
    if (inputObject.kind.toLowerCase() === kubernetesTypes_1.KubernetesWorkload.POD.toLowerCase()) {
        inputObject.metadata.labels = newLabels;
        return;
    }
    if ((_b = (_a = inputObject === null || inputObject === void 0 ? void 0 : inputObject.spec) === null || _a === void 0 ? void 0 : _a.template) === null || _b === void 0 ? void 0 : _b.metatada) {
        inputObject.spec.template.metatada.labels = newLabels;
        return;
    }
}
function getSpecSelectorLabels(inputObject) {
    var _a;
    if ((_a = inputObject === null || inputObject === void 0 ? void 0 : inputObject.spec) === null || _a === void 0 ? void 0 : _a.selector) {
        if (kubernetesTypes_1.isServiceEntity(inputObject.kind))
            return inputObject.spec.selector;
        else
            return inputObject.spec.selector.matchLabels;
    }
}
exports.getSpecSelectorLabels = getSpecSelectorLabels;
function setSpecSelectorLabels(inputObject, newLabels) {
    var _a;
    if ((_a = inputObject === null || inputObject === void 0 ? void 0 : inputObject.spec) === null || _a === void 0 ? void 0 : _a.selector) {
        if (kubernetesTypes_1.isServiceEntity(inputObject.kind))
            inputObject.spec.selector = newLabels;
        else
            inputObject.spec.selector.matchLabels = newLabels;
    }
}
exports.setSpecSelectorLabels = setSpecSelectorLabels;
