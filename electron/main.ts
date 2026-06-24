import { app, BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'
import { PythonManager } from './python-manager'

let mainWindow: BrowserWindow | null = null
const pythonManager = new PythonManager()

function createWindow(backendPort: number) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: '会议纪要助手',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

  if (isDev) {
    mainWindow.loadURL(`http://localhost:5173`)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.executeJavaScript(`window.__BACKEND_PORT__ = ${backendPort}`)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  try {
    const port = await pythonManager.start()
    console.log(`Python backend started on port ${port}`)
    createWindow(port)
  } catch (e) {
    console.error('Failed to start Python backend:', e)
    createWindow(18080)
  }
})

app.on('window-all-closed', () => {
  pythonManager.stop()
  app.quit()
})

app.on('before-quit', () => {
  pythonManager.stop()
})

ipcMain.handle('get-backend-port', () => pythonManager.getPort())
