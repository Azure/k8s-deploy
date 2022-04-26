import { Kubectl } from "./kubectl";
import { ExecOutput, getExecOutput } from "@actions/exec";
import * as core from "@actions/core";

export class PrivateKubectl extends Kubectl{
  


  protected async execute(args: string[], silent: boolean = false) {
   
    return null //await  getExecOutput(super.kubectlPath, args, { silent });
  }
}


  

  

  

  
  

  
  
 
  
  


