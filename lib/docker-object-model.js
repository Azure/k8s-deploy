"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DockerExec = void 0;
const tool_runner_1 = require("./utilities/tool-runner");
class DockerExec {
    constructor(dockerPath) {
        this.dockerPath = dockerPath;
    }
    pullImage(args, silent) {
        args = ['pull', ...args];
        var result = this.execute(args, silent);
        if (result.stderr != '' && result.code != 0) {
            throw new Error(`docker images pull failed with: ${result.stderr.match(/(.*)\s*$/)[0]}`);
        }
    }
    inspectImage(args, silent) {
        args = ['inspect --type=image', ...args];
        var result = this.execute(args, silent);
        if (result.stderr != '' && result.code != 0) {
            throw new Error(`docker inspect call failed with: ${result.stderr.match(/(.*)\s*$/)[0]}`);
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
