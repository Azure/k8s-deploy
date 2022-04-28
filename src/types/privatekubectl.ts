import { Kubectl } from "./kubectl";
import { ExecOutput, getExecOutput } from "@actions/exec";
import * as core from "@actions/core";

export class PrivateKubectl extends Kubectl{
  


  protected async execute(args: string[], silent: boolean = false) {
    if (this.ignoreSSLErrors) {
      args.push("--insecure-skip-tls-verify");
    }
    args = args.concat(["--namespace", this.namespace]);

    core.debug(`Kubectl run with command: ${this.kubectlPath} ${args}`);
   
    return null //await  getExecOutput(super.kubectlPath, args, { silent });
  }



  public parseYamlFiles(strToParse: string) {
    var result = Array();

    if(strToParse == null || strToParse.length == 0){
      return result;
    }

    var regex = new RegExp("([A-Za-z]*.yaml)", "g");
    var match = regex.exec(strToParse);
    
    while (match != null) {
      match = regex.exec(strToParse);

      if(match == null){
        continue;
      }
      result.push(match[0].toString);
    }
    return result;
  }
}


  

  

  

  
  

  
  
 
  
  


