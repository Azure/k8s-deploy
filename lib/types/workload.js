"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setImagePullSecrets = exports.isWorkload = exports.parseWorkload = exports.Workload = void 0;
const core = require("@actions/core");
var Workload;
(function (Workload) {
    Workload["DEPLOYMENT"] = "deployment";
    Workload["REPLICASET"] = "replicaset";
    Workload["DAEMONSET"] = "daemonset";
    Workload["POD"] = "pod";
    Workload["STATEFULSET"] = "statefulset";
    Workload["JOB"] = "job";
    Workload["CRONJJOB"] = "cronjob";
})(Workload = exports.Workload || (exports.Workload = {}));
/**
 * Converts a string to the Workload enum
 * @param str The workload type (case insensitive)
 * @returns The Workload enum or undefined if it can't be parsed
 */
exports.parseWorkload = (str) => Workload[Object.keys(Workload).filter((k) => Workload[k].toString().toLowerCase() === str.toLowerCase())[0]];
exports.isWorkload = (kind) => exports.parseWorkload(kind) !== undefined;
exports.setImagePullSecrets = (k, newSecrets, override = false) => {
    switch (exports.parseWorkload(k.kind)) {
        case Workload.POD: {
            if (k && k.spec && k.spec.imagePullSecrets)
                k.spec.imagePullSecrets = getOverriddenSecrets(k.spec.imagePullSecrets, newSecrets, override);
            else
                throw ManifestSecretError;
            break;
        }
        case Workload.CRONJJOB: {
            if (k &&
                k.spec &&
                k.spec.jobTemplate &&
                k.spec.jobTemplate.spec &&
                k.spec.jobTemplate.spec.template &&
                k.spec.jobTemplate.spec.template.spec &&
                k.spec.jobTemplate.spec.template.spec.imagePullSecrets)
                k.spec.jobTemplate.spec.template.spec.imagePullSecrets =
                    getOverriddenSecrets(k.spec.jobTemplate.spec.template.spec.imagePullSecrets, newSecrets, override);
            else
                throw ManifestSecretError;
            break;
        }
        case undefined: {
            core.debug(`Can't set secrets for manifests of kind ${k.kind}.`);
            break;
        }
        default: {
            if (k && k.spec && k.spec.template && k.spec.template.imagePullSecrets)
                k.spec.template.spec.imagePullSecrets = getOverriddenSecrets(k.spec.template.spec.imagePullSecrets, newSecrets, override);
            else
                throw ManifestSecretError;
            break;
        }
    }
    return k;
};
const getOverriddenSecrets = (oldSecrets, newSecrets, override) => {
    if (override)
        return newSecrets;
    return oldSecrets.concat(newSecrets);
};
const ManifestSecretError = Error(`Can't update secret of manifest due to improper format`);
