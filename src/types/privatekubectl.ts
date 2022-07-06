import { Kubectl } from "./kubectl";
import { ExecOptions, ExecOutput, getExecOutput } from "@actions/exec";
import * as core from "@actions/core";
import * as os from "os";
import * as fs from "fs";



export class PrivateKubectl extends Kubectl{

  superconstructor(
    isPrivateCluster = true
  ) {
    super.isPrivateCluster = isPrivateCluster;
  }


  public isPrivate(): boolean {
      return this.isPrivateCluster;
  }

  protected async execute(args: string[], silent: boolean = false) {
    args.unshift("/k8stools/kubectl");
    var kubectlCmd = args.join(" ");
    var addFileFlag = false;
    var eo = <ExecOptions>({ silent });

    if(this.containsFilenames(kubectlCmd)){
      core.debug("kubectl command contains filenames: " + kubectlCmd);
      kubectlCmd = kubectlCmd.replace(/[\/][t][m][p][\/]/g ,"");
      core.debug("Removing leading slashes for filenames when invoking for private clusters: " + kubectlCmd);
      addFileFlag = true;
    }

      const privateClusterArgs = ["aks", "command", "invoke", 
      "--resource-group", this.resourceGroup, 
      "--name", this.name,
      "--command", kubectlCmd 
    ];
    
    if(addFileFlag){
      var filenames = this.extractFilesnames(kubectlCmd).split(" ");
      const tempDirectory = process.env["runner.tempDirectory"] || os.tmpdir() + "/manifests";
      eo.cwd = tempDirectory;
      core.debug("ExecOptions current working directory: " + eo.cwd);
      privateClusterArgs.push(...["--file", "."]);

      var filenamesArr = filenames[0].split(",");
      for(var index = 0; index < filenamesArr.length; index++){
        var file = filenamesArr[index];
        
        if(file == null || file == undefined){
          continue;
        }

        try{
          this.moveFileToTempManifestDir(file);
        }catch(e){
          core.debug("Could not move file to temp/manifests dir: " + e);
        }
      }
    }
    
    core.debug(`private cluster Kubectl run with invoke command: ${kubectlCmd}`);
    core.debug("EO as it goes into getExec " + eo.cwd);
    return await getExecOutput("az", privateClusterArgs, eo);
  }


  public extractFilesnames(strToParse: string) {
    console.log("string to parse extractFiles: " + strToParse);
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

  private createTempManifestsDirectory(){
    if(!fs.existsSync("/tmp/manifests")){
      try{
        fs.mkdirSync("/tmp/manifests", { recursive: true });

      }catch(e){
        core.debug("could not create the directory: " + "/tmp/manifests" + ": " + e);

      }
    }
  }

  private moveFileToTempManifestDir(file: string){
    this.createTempManifestsDirectory();

    fs.rename("/tmp/" + file, "/tmp/manifests/" + file , function (err) {
      if (err) {
        core.debug("could not rename " + "/tmp/" + file + " to  " + "/tmp/manifests/" + file + " ERROR: " + err);
      
      }else{
        core.debug("Successfully moved file '" + file + "' from /tmp to /tmp/manifest directory");
      }
      
    })
  }

}