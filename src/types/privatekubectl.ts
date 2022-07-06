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
    super.isPrivateCluster = true;
    core.debug("Executing for Private Cluster? Super:" + super.isPrivate());
    core.debug("Executing for Private Cluster? This:" + this.isPrivate());
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
      core.debug("the filenames: " + filenames);

      if(!fs.existsSync(tempDirectory)){
        try{
          fs.mkdirSync(tempDirectory, { recursive: true });

        }catch(e){
          core.debug("could not create the directory: " + tempDirectory + ": " + e);

        }
      }


      eo.cwd = tempDirectory;
      core.debug("EO current working directory:" + eo.cwd + " the tmp dir is: " + tempDirectory);
      privateClusterArgs.push(...["--file", "."]);

      /*
      fs.readdir(tempDirectory, (err, files) => {
        files.forEach(file => {
          core.debug("temp files in directory:" + tempDirectory + " temp directory: " + file);
        });
      });
*/
      core.debug("### current directory is :" + process.cwd());
      core.debug("does /tmp/manifests already exists? :" + fs.existsSync("/tmp/manifests"));

      core.debug("printing the files in /tmp" + " to prove they exists!!!");

      fs.readdir("/tmp", (err, files) => {
        files.forEach(file => {
          core.debug("files in /tmp directory: " + file);
        });
      });

      core.debug("printing the files in /tmp/manifests to see whats in there before");
      fs.readdir("/tmp/manifests", (err, files) => {
        files.forEach(file => {
          core.debug("files in /tmp/manifests directory: " + file);
        });
      });


      core.debug("going to try to move the files from /tmp to the /tmp/manifests dir");
      fs.readdir("/tmp", (err, files) => {
        files.forEach(file => {
          if(!fs.existsSync("/tmp/manifests")){
            try{
              fs.mkdirSync("/tmp/manifests", { recursive: true });
    
            }catch(e){
              core.debug("could not create the directory: " + "/tmp/manifests" + ": " + e);
    
            }
          }

            core.debug("does /tmp/manifests existes" + fs.existsSync("/tmp/manifests"));

            // check if file exists in list and only move if it does
         // core.debug("does filename array contain file: " + file + " ?: " + filenames.indexOf(file));
       
          //  for(var index = 0; index < filenames.length; index++){
              var filenamesArr = filenames[0].split(",");
              core.debug("filenamesArr: " + filenamesArr);
              for(var index = 0; index < filenamesArr.length; index++){
              fs.rename("/tmp/" + filenamesArr[index], "/tmp/manifests/" + filenamesArr[index] , function (err) {
                if (err) {
                  core.debug("could not rename " + "/tmp/" + filenamesArr[index] + " to  " + "/tmp/manifests/" + filenamesArr[index] + " ERROR: " + err);
                
                
                
                }else{
                  core.debug('Successfully renamed - AKA moved!');
                }
               
              })

           }
           

        

        
        
        });
      });

      core.debug("Sanity check:: It says the file does not exist. Using fs.existsSync  to see if /tmp/manifests/Deployment_azure-vote-back_1657041106643 exists. If true, the should be able to rename: " +  fs.existsSync("/tmp/Deployment_azure-vote-back_1657041106643"));



      core.debug("printing the files in /tmp/manifests to see whats in there AFTER");
      fs.readdir("/tmp/manifests", (err, files) => {
        files.forEach(file => {
          core.debug("files in /tmp/manifests directory: " + file);
        });
      });

      core.debug("printing the files in actual CWD to see whats in there ");
      fs.readdir(process.cwd(), (err, files) => {
        files.forEach(file => {
          core.debug("files in /tmp/manifests directory: " + file);
        });
      });
      
      

      // Maybe try to move the files at this point to tmp/manifests or something.



    }
    

    core.debug(`private cluster Kubectl run with invoke command: ${kubectlCmd}`);
    core.debug("EO as it goes into getExec " + eo.cwd);
// PRINT OUT THE FILE SYSTEM HERE TO SEE WTF IS IN HERE.



    
    //process.chdir('/tmp/manifests');
    
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

}