"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const os = require("os");
function isEqual(str1, str2) {
    if (!str1)
        str1 = "";
    if (!str2)
        str2 = "";
    return str1.toLowerCase() === str2.toLowerCase();
}
exports.isEqual = isEqual;
function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}
exports.getRandomInt = getRandomInt;
function getExecutableExtension() {
    if (os.type().match(/^Win/)) {
        return '.exe';
    }
    return '';
}
exports.getExecutableExtension = getExecutableExtension;
function getCurrentTime() {
    return new Date().getTime();
}
exports.getCurrentTime = getCurrentTime;
