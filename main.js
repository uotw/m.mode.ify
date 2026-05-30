const electron = require('electron')
const app = electron.app
const BrowserWindow = electron.BrowserWindow
const { ipcMain, desktopCapturer } = electron

// @electron/remote replaces the old built-in `remote` module (removed in Electron 14).
require('@electron/remote/main').initialize()

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

function createWindow () {
  // Create the browser window. nodeIntegration + contextIsolation:false keep the
  // renderer's require()/Node API usage working as it did on Electron 1.x.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  mainWindow.setResizable(false);

  // Let the renderer use @electron/remote on this window.
  require('@electron/remote/main').enable(mainWindow.webContents)

  // and load the index.html of the app.
  mainWindow.loadURL(`file://${__dirname}/index.html`)

  //initialize GLOBAL WORKING DIR VARIABLE
  global.workdirObj = {prop1: null};
  mainWindow.on('close', function (event) {
    //event.preventDefault();
    if (global.workdirObj.prop1) {
      console.log('removing the ' + global.workdirObj.prop1 + ' directory.');
      const spawnsync = require('child_process').spawnSync;
      spawnsync("rm",['-rf', global.workdirObj.prop1]);
    }});

  // Open the DevTools.
  //mainWindow.webContents.openDevTools()

  mainWindow.on('closed', function () {
    mainWindow = null
  })
}

// desktopCapturer is main-process-only since Electron 17. Expose the source
// list to the renderer over IPC (it matches by name and uses the id for capture).
ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] })
  return sources.map(s => ({ id: s.id, name: s.name }))
})

app.on('ready', createWindow)

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
