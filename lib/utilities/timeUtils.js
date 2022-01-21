"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentTime = exports.sleep = void 0;
function sleep(timeout) {
    return new Promise((resolve) => setTimeout(resolve, timeout));
}
exports.sleep = sleep;
function getCurrentTime() {
    return new Date().getTime();
}
exports.getCurrentTime = getCurrentTime;
