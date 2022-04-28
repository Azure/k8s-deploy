import { PrivateKubectl } from "./privatekubectl";
import * as exec from "@actions/exec";
import * as io from "@actions/io";
import * as core from "@actions/core";
import * as toolCache from "@actions/tool-cache";
import { config } from "process";

const kubectlPath = "kubectlPath";
const namespace = "namespace";
const version = "1.1";
const path = "path";

describe("Privatekubectl utilities", () => {


  it("parses a string and extracts all of the .yaml filenames", async () => {
    var testStr = "kubectl apply -f abc.yaml onetwothree.yaml ..--uyamlsdf.----"
    var privatekubectl = new PrivateKubectl(kubectlPath, namespace);
    
    var result = privatekubectl.parseYamlFiles(testStr);
    var expectation = ["abc.yaml", "onetwothree.yaml"];
    
    expect(result).toEqual(expectation);
  });
})