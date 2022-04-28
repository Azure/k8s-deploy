import { Kubectl } from "./kubectl";
import { ExecOutput, getExecOutput } from "@actions/exec";
import * as core from "@actions/core";

export class PrivateKubectl extends Kubectl{
  


  protected async execute(args: string[], silent: boolean = false) {
    if (this.ignoreSSLErrors) {
      args.push("--insecure-skip-tls-verify");
    }
    args = args.concat(["--namespace", this.namespace]);
    var argsAsString = args.toString();

    // We need resources group, name, command and maybe file

    if(this.containsFilenames(argsAsString)){
      var yamlFileNames = this.parseYamlFiles(args.toString());
      // add the individual filenames in the invoke --file flag
      
    
    
    }
    
    //core.debug(`Kubectl run with command: ${this.kubectlPath} ${args}`);
    return null //await  getExecOutput(super.kubectlPath, args, { silent });

    /*
      az aks command invoke \
      --resource-group myResourceGroup \
      --name myAKSCluster \
      --command "kubectl apply -f deployment.yaml -n default" \
      --file deployment.yaml
    */
  }


  private containsFilenames(str: string){
    return str.includes("-f") && str.includes(".yaml");
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


  

  

  

  
  

  
  
 
  
  


