"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const os = require("os");
const tl = require("@actions/core");
function getExecutableExtension() {
    if (os.type().match(/^Win/)) {
        return '.exe';
    }
    return '';
}
exports.getExecutableExtension = getExecutableExtension;
function isEqual(str1, str2, ignoreCase) {
    if (str1 == null && str2 == null) {
        return true;
    }
    if (str1 == null || str2 == null) {
        return false;
    }
    if (ignoreCase) {
        return str1.toUpperCase() === str2.toUpperCase();
    }
    else {
        return str1 === str2;
    }
}
exports.isEqual = isEqual;
function checkForErrors(execResults, warnIfError) {
    if (execResults.length !== 0) {
        let stderr = '';
        execResults.forEach(result => {
            if (result.stderr) {
                if (result.code !== 0) {
                    stderr += result.stderr + '\n';
                }
                else {
                    tl.warning(result.stderr);
                }
            }
        });
        if (stderr.length > 0) {
            if (!!warnIfError) {
                tl.warning(stderr.trim());
            }
            else {
                throw new Error(stderr.trim());
            }
        }
    }
}
exports.checkForErrors = checkForErrors;
function sleep(timeout) {
    return new Promise(resolve => setTimeout(resolve, timeout));
}
exports.sleep = sleep;
