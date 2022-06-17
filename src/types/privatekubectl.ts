import { Kubectl } from "./kubectl";
import { ExecOutput, getExecOutput } from "@actions/exec";
import * as core from "@actions/core";


export class PrivateKubectl extends Kubectl{
  protected async execute(args: string[], silent: boolean = false) {
    if (this.ignoreSSLErrors) {
     // args.push("--insecure-skip-tls-verify");
    }

    //args = args.concat(["--namespace", this.namespace]);
    args.unshift("/k8stools/kubectl");
    const kubectlCmd = args.join(" ");

/*
Ok, so the kubectlmd needs to be altered in a such a way that the files do not have leading /'s. 
The think is that its not the --file arg that needs it, it's the kubectl inside --command


*/

    const privateClusterArgs = ["aks", "command", "invoke", 
      "--resource-group", this.resourceGroup, 
      "--name", this.name,
      "--command", kubectlCmd 
    ]
    if(this.containsFilenames(kubectlCmd)) {
      core.debug("Before call to extractFiles:" + kubectlCmd);
      const fileNames = this.extractFiles(kubectlCmd);
      core.debug("After call to extractFiles");
      
       var removedLeadingSlashes = fileNames.join().replace(/tmp,/g, "tmp");
       core.debug("Filenames should have no leading slashes: " + removedLeadingSlashes);

      privateClusterArgs.push(...["--file", "."]);
    }

  core.debug(`private cluster Kubectl run with invoke command: ${kubectlCmd}`);
  return await getExecOutput("az", privateClusterArgs, { silent });
  }


  private containsFilenames(str: string) {
    return str.includes("-f ") || str.includes("filename ");
  }

  public extractFiles(strToParse: string) {
    core.debug("Inside extractFiles...");
    var result = [];
    var start = strToParse.indexOf("-filename"); 
    var offset = 7;

    core.debug("before offset check");
    if(start == -1){
      start = strToParse.indexOf("-f");
      
      if(start == -1){
        return result;
      }
      offset = 0;
    }

    core.debug("after offset check");    
    var temp = strToParse.substring(start + offset);
    var end = temp.indexOf(" -");
    
    // End could be case where the -f flag was last, or -f is followed by some additonal flag and it's arguments
    result = temp.substring(3, end == -1 ? temp.length : end).trim().split(/[\s]+/);
    core.debug("Before removingLeadingSlashes");
    return result; //this.removeLeadingSlashesFromFilenames(result);
  }



  private removeLeadingSlashesFromFilenames(arr: string[]){
    console.log("Inside removeLeadingSlashesFromFilenames");
    if(arr == null || arr.length == 0){
      console.log("Attempting to remove leading slashes, but the input was null or empty");
      return arr;
    }
    
    for(var index = 0; index < arr.length; index++){
      console.log("First char of " + arr[index] + " is : " + arr[index].charAt(0));
      // Skip if no leading slash
      if(arr[index].charAt(0) != "/"){
        console.log("skipping because " + arr[index] + " has no leading slash");
        continue;
      }
      arr[index] = arr[index].substring(1);
    }
    console.log("removed leading slashes: " + arr);
    return arr;
  }
}