"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DockerExec = void 0;
const tool_runner_1 = require("./utilities/tool-runner");
class DockerExec {
    constructor(dockerPath) {
        this.dockerPath = dockerPath;
    }
    ;
    pull(image, args, silent) {
        args = ['pull', image, ...args];
        let result = this.execute(args, silent);
        if (result.stderr != '' && result.code != 0) {
            throw new Error(`docker images pull failed with: ${result.error}`);
        }
    }
    inspect(image, args, silent) {
        args = ['inspect', image, ...args];
        let result = this.execute(args, silent);
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
