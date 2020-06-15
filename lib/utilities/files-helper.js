'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeManifestToFile = exports.writeObjectsToFile = exports.assertFileExists = exports.ensureDirExists = exports.getNewUserDirPath = exports.getTempDirectory = void 0;
const fs = require("fs");
const path = require("path");
const core = require("@actions/core");
const os = require("os");
function getTempDirectory() {
    return process.env['runner.tempDirectory'] || os.tmpdir();
}
exports.getTempDirectory = getTempDirectory;
function getNewUserDirPath() {
    let userDir = path.join(getTempDirectory(), 'kubectlTask');
    ensureDirExists(userDir);
    userDir = path.join(userDir, getCurrentTime().toString());
    ensureDirExists(userDir);
    return userDir;
}
exports.getNewUserDirPath = getNewUserDirPath;
function ensureDirExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath);
    }
}
exports.ensureDirExists = ensureDirExists;
function assertFileExists(path) {
    if (!fs.existsSync(path)) {
        core.error(`FileNotFoundException : ${path}`);
        throw new Error(`FileNotFoundException:  ${path}`);
    }
}
exports.assertFileExists = assertFileExists;
function writeObjectsToFile(inputObjects) {
    const newFilePaths = [];
    if (!!inputObjects) {
        inputObjects.forEach((inputObject) => {
            try {
                const inputObjectString = JSON.stringify(inputObject);
                if (!!inputObject.kind && !!inputObject.metadata && !!inputObject.metadata.name) {
                    const fileName = getManifestFileName(inputObject.kind, inputObject.metadata.name);
                    fs.writeFileSync(path.join(fileName), inputObjectString);
                    newFilePaths.push(fileName);
                }
                else {
                    core.debug('Input object is not proper K8s resource object. Object: ' + inputObjectString);
                }
            }
            catch (ex) {
                core.debug('Exception occurred while writing object to file : ' + inputObject + ' . Exception: ' + ex);
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
            core.debug('Exception occurred while writing object to file : ' + inputObjectString + ' . Exception: ' + ex);
        }
    }
    return '';
}
exports.writeManifestToFile = writeManifestToFile;
function getManifestFileName(kind, name) {
    const filePath = kind + '_' + name + '_' + getCurrentTime().toString();
    const tempDirectory = getTempDirectory();
    const fileName = path.join(tempDirectory, path.basename(filePath));
    return fileName;
}
function getCurrentTime() {
    return new Date().getTime();
}
