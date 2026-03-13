const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');

const PORT = 3333;
const URL  = `http://localhost:${PORT}`;

let win;
let serverProcess;

// ── Launch the Express server in a child process ───────────────────────────
function startServer() {
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, 'server.js')
    : path.join(__dirname, 'server.js');

  serverProcess = fork(serverPath, [], {
    env: { ...process.env, ELECTRON_RUN: '1' },
    stdio: 'inherit',
  });

  serverProcess.on('error', err => console.error('Server error:', err));
}

// ── Poll until Express is ready, then open the window ─────────────────────
function waitForServer(retries = 30) {
  http.get(URL, res => {
    res.resume();
    createWindow();
  }).on('error', () => {
    if (retries > 0) setTimeout(() => waitForServer(retries - 1), 300);
    else console.error('Server did not start in time');
  });
}

// ── Create the app window ──────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Universal Translator',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
    },
    show: false,
  });

  win.loadURL(URL);

  // Show window once page has loaded (no white flash)
  win.once('ready-to-show', () => win.show());

  // Open external links in the real browser, not in the app window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => { win = null; });
}

// ── App lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startServer();
  waitForServer();
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});

app.on('activate', () => {
  if (!win) createWindow();
});
