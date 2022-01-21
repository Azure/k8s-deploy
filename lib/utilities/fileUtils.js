"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeManifestToFile = exports.writeObjectsToFile = exports.getTempDirectory = void 0;
const fs = require("fs");
const path = require("path");
const core = require("@actions/core");
const os = require("os");
const timeUtils_1 = require("./timeUtils");
function getTempDirectory() {
    return process.env["runner.tempDirectory"] || os.tmpdir();
}
exports.getTempDirectory = getTempDirectory;
function writeObjectsToFile(inputObjects) {
    const newFilePaths = [];
    if (!!inputObjects) {
        inputObjects.forEach((inputObject) => {
            var _a;
            try {
                const inputObjectString = JSON.stringify(inputObject);
                if ((_a = inputObject === null || inputObject === void 0 ? void 0 : inputObject.metadata) === null || _a === void 0 ? void 0 : _a.name) {
                    const fileName = getManifestFileName(inputObject.kind, inputObject.metadata.name);
                    fs.writeFileSync(path.join(fileName), inputObjectString);
                    newFilePaths.push(fileName);
                }
                else {
                    core.debug("Input object is not proper K8s resource object. Object: " +
                        inputObjectString);
                }
            }
            catch (ex) {
                core.debug(`Exception occurred while writing object to file ${inputObject}: ${ex}`);
            }
        });
    }
    return newFilePaths;
}
exports.writeObjectsToFile = writeObjectsToFile;
function writeManifestToFile(inputObjectString, kind, name) {
    if (inputObjectString) {
        try {
            const fileName = getManifestFileName(kind, name);
            fs.writeFileSync(path.join(fileName), inputObjectString);
            return fileName;
        }
        catch (ex) {
            throw Error(`Exception occurred while writing object to file: ${inputObjectString}. Exception: ${ex}`);
        }
    }
}
exports.writeManifestToFile = writeManifestToFile;
function getManifestFileName(kind, name) {
    const filePath = `${kind}_${name}_ ${timeUtils_1.getCurrentTime().toString()}`;
    const tempDirectory = getTempDirectory();
    return path.join(tempDirectory, path.basename(filePath));
}
