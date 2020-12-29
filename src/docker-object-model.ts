import { ToolRunner, IExecOptions, IExecSyncResult } from "./utilities/tool-runner";

export class DockerExec{
    private dockerPath: string;

    constructor(dockerPath: string){
        this.dockerPath = dockerPath;
    };

    public pull(image: string, args: string[], silent?: boolean) {
        args = ['pull', image, ...args];
        let result: IExecSyncResult = this.execute(args,silent);
        if (result.stderr != '' && result.code != 0) {
            throw new Error(`docker images pull failed with: ${result.error}`);
        }
    }

    public inspect(image: string, args: string[], silent?: boolean): any {
        args = ['inspect', image, ...args];
        let result: IExecSyncResult = this.execute(args,silent);
        if (result.stderr != '' && result.code != 0) {
            throw new Error(`docker inspect call failed with: ${result.error}`);
        }
        return result.stdout;
    }

    private execute(args: string[], silent?: boolean) {
        const command = new ToolRunner(this.dockerPath);
        command.arg(args);

        return command.execSync({ silent: !!silent } as IExecOptions);
    }
}