import { spawn } from 'node:child_process'

/** Keeps the end of a tool's stderr for error messages without unbounded memory. */
const STDERR_TAIL_BYTES = 4096

export class ToolError extends Error {
  constructor(
    readonly tool: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(`${tool} exited with ${exitCode ?? 'a signal'}: ${stderr.trim().slice(-500)}`)
    this.name = 'ToolError'
  }
}

/** Runs a command-line tool (ffmpeg/ffprobe) without a shell and returns its stdout. */
export function runTool(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_TAIL_BYTES)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(stdout).toString('utf8'))
      else reject(new ToolError(command, code, stderr))
    })
  })
}
