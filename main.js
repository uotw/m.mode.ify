const electron = require('electron')
const app = electron.app
const BrowserWindow = electron.BrowserWindow
const Menu = electron.Menu
const shell = electron.shell
// @electron/remote replaces the old built-in `remote` module (removed in Electron 14).
require('@electron/remote/main').initialize()

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let aboutWindow

const ARTICLE_URL = 'https://pubmed.ncbi.nlm.nih.gov/26764277/'

function openAbout () {
  if (aboutWindow) { aboutWindow.focus(); return }
  aboutWindow = new BrowserWindow({
    width: 600,
    height: 460,
    resizable: true,
    title: 'About M.mode.ify',
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  })
  aboutWindow.setMenuBarVisibility(false)
  aboutWindow.loadURL(`file://${__dirname}/about.html`)
  aboutWindow.on('closed', function () { aboutWindow = null })
}

function buildMenu () {
  const isMac = process.platform === 'darwin'
  const template = [
    {
      label: isMac ? app.name : 'M.mode.ify',
      submenu: [
        { label: 'About M.mode.ify', click: openAbout },
        { type: 'separator' },
        { label: 'M-mode-ify on the web', click() { shell.openExternal('https://www.ultrasoundoftheweek.com/m-mode-ify') } },
        { label: 'Original article (PMID 26764277)', click() { shell.openExternal(ARTICLE_URL) } },
        { type: 'separator' },
        isMac ? { role: 'hide' } : null,
        { role: 'quit' }
      ].filter(Boolean)
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', click() { app.relaunch(); app.exit() } },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Developer Tools', accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click() { if (mainWindow) mainWindow.webContents.openDevTools() } }
      ]
    },
    {
      role: 'help',
      submenu: [
        { label: 'About M.mode.ify', click: openAbout },
        { label: 'Original article (PMID 26764277)', click() { shell.openExternal(ARTICLE_URL) } }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow () {
  // Create the browser window. nodeIntegration + contextIsolation:false keep the
  // renderer's require()/Node API usage working as it did on Electron 1.x.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,   // reveal only once loaded, after the splash
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // Give Web Workers Node APIs (require/fs) so the magick-wasm pipeline can
      // run off the renderer's main thread (mmode-magick.worker.js). Plain
      // worker_threads can't be constructed from an Electron renderer.
      nodeIntegrationInWorker: true
    }
  })
  mainWindow.setResizable(false);

  // Let the renderer use @electron/remote on this window.
  require('@electron/remote/main').enable(mainWindow.webContents)

  // Reveal the window once its content has rendered (it opens on the in-page
  // splash animation in index.html, which then fades to reveal the interface).
  mainWindow.once('ready-to-show', function () {
    mainWindow.show()
  })

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

app.on('ready', function () {
  buildMenu()
  createWindow()
})

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
