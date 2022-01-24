import { getKubectlPath, Kubectl } from "./kubectl";
import * as exec from "@actions/exec";
import * as io from "@actions/io";
import * as core from "@actions/core";
import * as toolCache from "@actions/tool-cache";

describe("Kubectl path", () => {
  const version = "1.1";
  const path = "path";

  it("gets the kubectl path", async () => {
    jest.spyOn(core, "getInput").mockImplementationOnce(() => undefined);
    jest.spyOn(io, "which").mockImplementationOnce(async () => path);

    expect(await getKubectlPath()).toBe(path);
  });

  it("gets the kubectl path with version", async () => {
    jest.spyOn(core, "getInput").mockImplementationOnce(() => version);
    jest.spyOn(toolCache, "find").mockImplementationOnce(() => path);

    expect(await getKubectlPath()).toBe(path);
  });

  it("throws if kubectl not found", async () => {
    // without version
    jest.spyOn(io, "which").mockImplementationOnce(async () => undefined);
    await expect(() => getKubectlPath()).rejects.toThrow();

    // with verision
    jest.spyOn(core, "getInput").mockImplementationOnce(() => undefined);
    jest.spyOn(io, "which").mockImplementationOnce(async () => undefined);
    await expect(() => getKubectlPath()).rejects.toThrow();
  });
});

const kubectlPath = "path";
const namespace = "namespace";
describe("Kubectl class", () => {
  const kubectl = new Kubectl(kubectlPath, namespace);
});
