import {getExecOutput} from '@actions/exec'

export class DockerExec {
   private readonly dockerPath: string

   constructor(dockerPath: string) {
      this.dockerPath = dockerPath
   }

   public async pull(image: string, args: string[], silent?: boolean) {
      const result = await this.execute(['pull', image, ...args], silent)
      if (result.stderr != '' || result.exitCode != 0) {
         throw new Error(`docker images pull failed: ${result.stderr}`)
      }
   }

   public async inspect(
      image: string,
      args: string[],
      silent: boolean = false
   ): Promise<string> {
      const result = await this.execute(['inspect', image, ...args], silent)
      if (result.stderr != '' || result.exitCode != 0)
         throw new Error(`docker inspect failed: ${result.stderr}`)

      return result.stdout
   }

   private async execute(args: string[], silent: boolean = false) {
      return await getExecOutput(this.dockerPath, args, {silent})
   }
}
