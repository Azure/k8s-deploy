import { Kubectl } from "./kubectl";
import { ExecOutput, getExecOutput } from "@actions/exec";
import * as core from "@actions/core";

export class PrivateKubectl extends Kubectl{
  

  protected async execute(args: string[], silent: boolean = false) {
    if (this.ignoreSSLErrors) {
      args.push("--insecure-skip-tls-verify");
    }

    var command = "az aks command invoke";
    args = args.concat(["--namespace", this.namespace]);
    
    var argsAsString = args.toString();

    

    if(this.containsFilenames(argsAsString)){
      var yamlFileNames = this.parseYamlFiles(args.toString());
      args = args.concat(["--name", this.name]);
      args = args.concat(["--resource-group", this.resourceGroup]);
      args = args.concat(["--command", argsAsString]);
      args = args.concat(["--file", yamlFileNames.join(" ")]);
      core.debug(`private cluster Kubectl run with invoke command: ${this.kubectlPath} ${command}`);
      return await getExecOutput(command, args, { silent });
    }
    
    return null // Still need to build out this case

    /*
      az aks command invoke \
      --resource-group myResourceGroup \
      --name myAKSCluster \
      --command "kubectl apply -f deployment.yaml -n default" \
      --file deployment.yaml
    */
  }


  private containsFilenames(str: string){
    return str.includes("-f ");
  }

  public parseYamlFiles(strToParse: string) {
    var result = Array();

    if(strToParse == null || strToParse.length == 0){
      return result;
    }

    var start = strToParse.indexOf("-f" ); + 3

    if(start == -1){
      return result;
    }

    var temp = strToParse.substring(start);
    var end = temp.indexOf(" -");
    
    // End could be case where the -f flag was last, or -f is followed by some additonal flag and it's arguments
    return temp.substring(3, end == -1 ? temp.length : end).trim().split("\\s");
  }
}


  

  

  

  
  

  
  
 
  
  


