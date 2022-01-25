"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkDockerPath = exports.getDeploymentConfig = void 0;
const io = require("@actions/io");
const core = require("@actions/core");
const docker_1 = require("../types/docker");
const githubUtils_1 = require("./githubUtils");
function getDeploymentConfig() {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        let helmChartPaths = ((_b = (_a = process.env) === null || _a === void 0 ? void 0 : _a.HELM_CHART_PATHS) === null || _b === void 0 ? void 0 : _b.split(";").filter((path) => path != "")) ||
            [];
        helmChartPaths = helmChartPaths.map((helmchart) => githubUtils_1.getNormalizedPath(helmchart.trim()));
        let inputManifestFiles = core
            .getInput("manifests")
            .split(/[\n,;]+/)
            .filter((manifest) => manifest.trim().length > 0) || [];
        if ((helmChartPaths === null || helmChartPaths === void 0 ? void 0 : helmChartPaths.length) == 0) {
            inputManifestFiles = inputManifestFiles.map((manifestFile) => githubUtils_1.getNormalizedPath(manifestFile));
        }
        const imageNames = core.getInput("images").split("\n") || [];
        const imageDockerfilePathMap = {};
        //Fetching from image label if available
        for (const image of imageNames) {
            try {
                imageDockerfilePathMap[image] = yield getDockerfilePath(image);
            }
            catch (ex) {
                core.warning(`Failed to get dockerfile path for image ${image.toString()}: ${ex} `);
            }
        }
        return Promise.resolve({
            manifestFilePaths: inputManifestFiles,
            helmChartFilePaths: helmChartPaths,
            dockerfilePaths: imageDockerfilePathMap,
        });
    });
}
exports.getDeploymentConfig = getDeploymentConfig;
function getDockerfilePath(image) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        yield checkDockerPath();
        const dockerExec = new docker_1.DockerExec("docker");
        yield dockerExec.pull(image, [], true);
        const imageInspectResult = yield dockerExec.inspect(image, [], true);
        const imageConfig = JSON.parse(imageInspectResult)[0];
        const DOCKERFILE_PATH_LABEL_KEY = "dockerfile-path";
        let pathValue = "";
        if ((_a = imageConfig === null || imageConfig === void 0 ? void 0 : imageConfig.Config) === null || _a === void 0 ? void 0 : _a.Labels[DOCKERFILE_PATH_LABEL_KEY]) {
            const pathLabel = imageConfig.Config.Labels[DOCKERFILE_PATH_LABEL_KEY];
            pathValue = githubUtils_1.getNormalizedPath(pathLabel);
        }
        return Promise.resolve(pathValue);
    });
}
function checkDockerPath() {
    return __awaiter(this, void 0, void 0, function* () {
        const dockerPath = yield io.which("docker", false);
        if (!dockerPath) {
            throw new Error("Docker is not installed.");
        }
    });
}
exports.checkDockerPath = checkDockerPath;
