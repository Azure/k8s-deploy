import { Kubectl } from "./kubectl";
import { ExecOutput, getExecOutput } from "@actions/exec";
import * as core from "@actions/core";


export class PrivateKubectl extends Kubectl{
  protected async execute(args: string[], silent: boolean = false) {
    core.debug("executing for Private Cluster");
    args.unshift("/k8stools/kubectl");
    var kubectlCmd = args.join(" ");
    var addFileFlag = false;

    if(this.containsFilenames(kubectlCmd)){
      core.debug("kubectl command contains filenames: " + kubectlCmd);
      //kubectlCmd = kubectlCmd.replace(/[\/][t][m][p]/g ,"./tmp");
      core.debug("Removing leading slashes for filenames when invoking for private clusters: " + kubectlCmd);
      addFileFlag = true;
    }

      const privateClusterArgs = ["aks", "command", "invoke", 
      "--resource-group", this.resourceGroup, 
      "--name", this.name,
      "--command", kubectlCmd 
    ];
    
    if(addFileFlag){
      var filenames = this.extractFilesnames(kubectlCmd); //.split(" ");
      privateClusterArgs.push(...["--file", ...filenames]);
    }
    
    core.debug(`private cluster Kubectl run with invoke command: ${kubectlCmd}`);
    return await getExecOutput("az", privateClusterArgs, { silent });
  }



  public extractFilesnames(strToParse: string) {
    console.log("String to parse extractFiles: " + strToParse);
    var start = strToParse.indexOf("-filename"); 
    var offset = 7;

    if(start == -1){
      start = strToParse.indexOf("-f");
      
      if(start == -1){
        return "";
      }
      offset = 0;
    }

    
    var temp = strToParse.substring(start + offset);
    var end = temp.indexOf(" -");
    
    //End could be case where the -f flag was last, or -f is followed by some additonal flag and it's arguments
    return temp.substring(3, end == -1 ? temp.length : end).trim(); //.replace(/[\,]/g ," ");
  }


  private containsFilenames(str: string) {
    return str.includes("-f ") || str.includes("filename ");
  }

}