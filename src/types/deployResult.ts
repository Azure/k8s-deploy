import {ExecOutput} from '@actions/exec'

export interface DeployResult {
   execResult: ExecOutput
   manifestFiles: string[]
}
