import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import { app } from 'electron'

export class PythonManager {
  private process: ChildProcess | null = null
  private port: number = 0

  getPort(): number {
    return this.port
  }

  async start(): Promise<number> {
    const isDev = !app.isPackaged
    const backendDir = isDev
      ? path.join(__dirname, '..', 'backend')
      : path.join(process.resourcesPath, 'backend')

    const pythonPath = isDev
      ? path.join(backendDir, '.venv', 'bin', 'python')
      : path.join(backendDir, '.venv', 'bin', 'python')

    const mainPy = path.join(backendDir, 'main.py')

    return new Promise((resolve, reject) => {
      this.process = spawn(pythonPath, [mainPy], {
        cwd: backendDir,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      })

      const timeout = setTimeout(() => {
        reject(new Error('Python backend startup timeout'))
      }, 30000)

      this.process.stdout?.on('data', (data: Buffer) => {
        const output = data.toString()
        console.log('[Python]', output.trim())

        const match = output.match(/PORT=(\d+)/)
        if (match) {
          this.port = parseInt(match[1])
          clearTimeout(timeout)
          resolve(this.port)
        }
      })

      this.process.stderr?.on('data', (data: Buffer) => {
        console.error('[Python Error]', data.toString().trim())
      })

      this.process.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })

      this.process.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.error(`Python process exited with code ${code}`)
        }
        this.process = null
      })
    })
  }

  stop() {
    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = null
    }
  }
}
