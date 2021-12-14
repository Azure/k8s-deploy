import * as os from "os";

export const getTempDirectory = () =>
  process.env["runner.tempDirectory"] || os.tmpdir();
