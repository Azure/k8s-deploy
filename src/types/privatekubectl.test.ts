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


  it("parses a string and extracts all of the filenames", async () => {
    var testStrA = "kubectl apply -f abc.yaml doraymi.json onetwothree.yaml -d some other stuff we don't care about ..--uyamlsdf.----"
    var testStrB = "kubectl apply -f abc.yaml doraymi.json onetwothree.yaml"
    var testStrC = "kubectl apply -f     abc.yaml     doraymi.json  onetwothree.yaml   "
    var testStrD = "kubectl apply -filename abc.yaml     doraymi.json  onetwothree.yaml   "
    var privatekubectl = new PrivateKubectl(kubectlPath, namespace);
    
    var resultA = privatekubectl.extractFiles(testStrA);
    var resultB = privatekubectl.extractFiles(testStrB);
    var resultC = privatekubectl.extractFiles(testStrC);
    var resultD = privatekubectl.extractFiles(testStrD);

    var expectation = ["abc.yaml", "doraymi.json", "onetwothree.yaml"];

    expect(resultA).toEqual(expectation);
    expect(resultB).toEqual(expectation);
    expect(resultC).toEqual(expectation);
    expect(resultD).toEqual(expectation);
  });
})