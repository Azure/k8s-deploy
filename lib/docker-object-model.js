"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DockerExec = void 0;
const tool_runner_1 = require("./utilities/tool-runner");
class DockerExec {
    constructor(dockerPath) {
        this.dockerPath = dockerPath;
    }
    ;
    pullImage(args, silent) {
        args = ['pull', ...args];
        var result = this.execute(args, silent);
        if (result.stderr != '' && result.code != 0) {
            throw new Error(`docker images pull failed with: ${result.error}`);
        }
    }
    inspectImage(args, silent) {
        args = ['inspect', ...args];
        var result = this.execute(args, silent);
        if (result.stderr != '' && result.code != 0) {
            throw new Error(`docker inspect call failed with: ${result.error}`);
        }
        return result.stdout;
    }
    execute(args, silent) {
        const command = new tool_runner_1.ToolRunner(this.dockerPath);
        command.arg(args);
        return command.execSync({ silent: !!silent });
    }
}
exports.DockerExec = DockerExec;
