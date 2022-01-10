"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDeploymentStrategy = exports.DeploymentStrategy = void 0;
var DeploymentStrategy;
(function (DeploymentStrategy) {
    DeploymentStrategy["CANARY"] = "canary";
    DeploymentStrategy["BLUE_GREEN"] = "blue-green";
})(DeploymentStrategy = exports.DeploymentStrategy || (exports.DeploymentStrategy = {}));
/**
 * Converts a string to the DeploymentStrategy enum
 * @param str The deployment strategy (case insensitive)
 * @returns The DeploymentStrategy enum or undefined if it can't be parsed
 */
exports.parseDeploymentStrategy = (str) => DeploymentStrategy[Object.keys(DeploymentStrategy).filter((k) => DeploymentStrategy[k].toString().toLowerCase() === str.toLowerCase())[0]];
