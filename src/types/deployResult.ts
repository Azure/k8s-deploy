import { ExecOutput } from "@actions/exec";

export interface DeployResult{
    result: ExecOutput,
    manifestFiles: string[]
}