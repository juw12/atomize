'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const autocut = require('../engine/autocut');
const repurpose = require('../engine/repurpose');
const publish = require('../engine/publish');
const analytics = require('../engine/analytics');
const storage = require('../engine/storage');

app.setAppUserModelId('com.hazel.studio');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0e1116',
    title: 'Hazel',
    icon: path.join(__dirname, '..', 'assets', 'hazel.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC: import ---------------------------------------------------------

ipcMain.handle('video:pick', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import footage',
    properties: ['openFile'],
    filters: [
      { name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v', 'avi'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const file = result.filePaths[0];
  const info = await autocut.probe(file);
  return { path: file, name: path.basename(file), info };
});

ipcMain.handle('video:probe', async (_evt, file) => {
  return autocut.probe(file);
});

// --- IPC: auto-cut -------------------------------------------------------

ipcMain.handle('cuts:detect', async (_evt, file, opts) => {
  return autocut.detectCuts(file, opts || {}, (p) => {
    if (mainWindow) mainWindow.webContents.send('job:progress', p);
  });
});

ipcMain.handle('cuts:render', async (_evt, file, segments, opts) => {
  const outDir = path.join(os.homedir(), 'Videos', 'Hazel');
  const base = path.basename(file, path.extname(file));
  const out = path.join(outDir, `${base}-hazel.mp4`);
  const rendered = await autocut.render(file, segments, out, opts || {}, (p) => {
    if (mainWindow) mainWindow.webContents.send('job:progress', p);
  });

  let archived = null;
  if (readSettings().autoArchive) {
    const target = storage.autoArchiveTarget(file);
    if (path.dirname(file) !== target) {
      archived = storage.archiveFiles([{ path: file, name: path.basename(file) }], target);
    }
  }
  return { out: rendered, archived };
});

ipcMain.handle('video:repurpose', async (_evt, file, opts) => {
  const base = path.basename(file, path.extname(file));
  const outDir = path.join(os.homedir(), 'Videos', 'Hazel', `${base}-formats`);
  return repurpose.repurpose(file, outDir, opts || {}, (p) => {
    if (mainWindow) mainWindow.webContents.send('job:progress', p);
  });
});

ipcMain.handle('shell:reveal', async (_evt, target) => {
  shell.showItemInFolder(target);
});

// --- IPC: publish + schedule queue --------------------------------------

ipcMain.handle('publish:platforms', async () => publish.listPlatforms());

ipcMain.handle('publish:open', async (_evt, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) await shell.openExternal(url);
  return true;
});

ipcMain.handle('publish:package', async (_evt, payload) => {
  const p = publish.getPlatform(payload && payload.platform);
  if (!p) throw new Error('Unknown platform');
  const file = payload.file;
  const base = path.basename(file, path.extname(file));
  const dir = path.join(os.homedir(), 'Videos', 'Hazel', 'packages', `${base}-${p.key}`);
  fs.mkdirSync(dir, { recursive: true });

  const src = payload.formatPath && fs.existsSync(payload.formatPath) ? payload.formatPath : file;
  const videoName = `${base}-${p.ratio}${path.extname(src) || '.mp4'}`;
  const videoPath = path.join(dir, videoName);
  fs.copyFileSync(src, videoPath);

  const caption = payload.caption != null ? payload.caption : publish.buildCaption(payload.text, p.key);
  fs.writeFileSync(path.join(dir, 'caption.txt'), caption, 'utf8');
  fs.writeFileSync(path.join(dir, 'README.txt'), publish.packageReadme(p, caption, videoName), 'utf8');

  return { dir, video: videoPath, caption, uploadUrl: p.uploadUrl, platform: p };
});

function queueFile() {
  return path.join(app.getPath('userData'), 'hazel-queue.json');
}
function readQueue() {
  try { return JSON.parse(fs.readFileSync(queueFile(), 'utf8')); } catch { return []; }
}
function writeQueue(q) {
  fs.mkdirSync(path.dirname(queueFile()), { recursive: true });
  fs.writeFileSync(queueFile(), JSON.stringify(q, null, 2), 'utf8');
}

ipcMain.handle('queue:list', async () => readQueue());
ipcMain.handle('queue:add', async (_evt, item) => {
  const q = readQueue();
  const entry = Object.assign({ id: Date.now() }, item);
  q.push(entry);
  writeQueue(q);
  return entry;
});
ipcMain.handle('queue:remove', async (_evt, id) => {
  const q = readQueue().filter((x) => x.id !== id);
  writeQueue(q);
  return q;
});

// --- IPC: traffic analytics ---------------------------------------------

function analyticsFile() {
  return path.join(app.getPath('userData'), 'hazel-analytics.json');
}
function readAnalytics() {
  try { return JSON.parse(fs.readFileSync(analyticsFile(), 'utf8')); } catch { return []; }
}
function writeAnalytics(records) {
  fs.mkdirSync(path.dirname(analyticsFile()), { recursive: true });
  fs.writeFileSync(analyticsFile(), JSON.stringify(records, null, 2), 'utf8');
}

ipcMain.handle('analytics:import', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Import platform stats (CSV)',
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }, { name: 'All files', extensions: ['*'] }]
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  const file = res.filePaths[0];
  const raw = fs.readFileSync(file, 'utf8');
  const rows = analytics.parseCsv(raw);
  const defaultPlatform = path.basename(file, path.extname(file));
  const norm = analytics.normalizeRows(rows, defaultPlatform);
  writeAnalytics(norm.records);
  return { file, matched: norm.matched, mapping: norm.mapping, summary: analytics.summarize(norm.records) };
});

ipcMain.handle('analytics:summary', async () => {
  const records = readAnalytics();
  return { summary: analytics.summarize(records), count: records.length };
});

ipcMain.handle('analytics:clear', async () => {
  writeAnalytics([]);
  return { summary: analytics.summarize([]), count: 0 };
});

// --- IPC: storage + settings --------------------------------------------

function settingsFile() {
  return path.join(app.getPath('userData'), 'hazel-settings.json');
}
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}
function writeSettings(s) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2), 'utf8');
}

ipcMain.handle('settings:get', async () => readSettings());
ipcMain.handle('settings:set', async (_evt, patch) => {
  const next = Object.assign(readSettings(), patch || {});
  writeSettings(next);
  return next;
});

ipcMain.handle('storage:scan', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Scan a folder for footage',
    properties: ['openDirectory']
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  const dir = res.filePaths[0];
  const files = storage.scanDir(dir);
  const duplicates = storage.groupDuplicates(files, (f) => storage.signature(f.path));
  return { dir, files, usage: storage.summarizeUsage(files), duplicates };
});

ipcMain.handle('storage:archive', async (_evt, payload) => {
  const files = (payload && payload.files) || [];
  const target = (payload && payload.dir) || storage.autoArchiveTarget(files[0] ? files[0].path : os.homedir());
  return storage.archiveFiles(files, target);
});
