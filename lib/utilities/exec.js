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
exports.exec = void 0;
const aexec = require("@actions/exec");
exports.exec = (command, args = [], silent) => __awaiter(void 0, void 0, void 0, function* () {
    let stdout = '';
    let stderr = '';
    const options = {
        silent: silent,
        ignoreReturnCode: true
    };
    options.listeners = {
        stdout: (data) => {
            stdout += data.toString();
        },
        stderr: (data) => {
            stderr += data.toString();
        }
    };
    const returnCode = yield aexec.exec(command, args, options);
    return {
        success: returnCode === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim()
    };
});
