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
exports.DockerExec = void 0;
const exec_1 = require("@actions/exec");
class DockerExec {
    constructor(dockerPath) {
        this.dockerPath = dockerPath;
    }
    pull(image, args, silent) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.execute(["pull", image, ...args], silent);
            if (result.stderr != "" || result.exitCode != 0) {
                throw new Error(`docker images pull failed: ${result.stderr}`);
            }
        });
    }
    inspect(image, args, silent = false) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.execute(["inspect", image, ...args], silent);
            if (result.stderr != "" || result.exitCode != 0)
                throw new Error(`docker inspect failed: ${result.stderr}`);
            return result.stdout;
        });
    }
    execute(args, silent = false) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield exec_1.getExecOutput(this.dockerPath, args, { silent });
        });
    }
}
exports.DockerExec = DockerExec;
