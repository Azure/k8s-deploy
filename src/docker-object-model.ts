import { ToolRunner, IExecOptions, IExecSyncResult } from "./utilities/tool-runner";

export class DockerExec{
    private dockerPath: string;

    constructor(dockerPath: string) {
        this.dockerPath = dockerPath;
    }

    public pullImage(args: string[], silent?: boolean) {
        args = ['pull', ...args];
        var result: IExecSyncResult = this.execute(args,silent);
        if (result.stderr != '' && result.code != 0) {
            throw new Error(`docker images pull failed with: ${result.stderr.match(/(.*)\s*$/)![0]}`);
        }
    }

    public inspectImage(args: string[], silent?: boolean): any {
        args = ['inspect --type=image', ...args];
        var result: IExecSyncResult = this.execute(args,silent);
        if (result.stderr != '' && result.code != 0) {
            throw new Error(`docker inspect call failed with: ${result.stderr.match(/(.*)\s*$/)![0]}`);
        }
        return result.stdout;
    }

    private execute(args: string[], silent?: boolean) {
        const command = new ToolRunner(this.dockerPath);
        command.arg(args);

        return command.execSync({ silent: !!silent } as IExecOptions);
    }
}