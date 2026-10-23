'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hazel', {
  pickVideo: () => ipcRenderer.invoke('video:pick'),
  probe: (file) => ipcRenderer.invoke('video:probe', file),
  detectCuts: (file, opts) => ipcRenderer.invoke('cuts:detect', file, opts),
  renderCut: (file, segments, opts) => ipcRenderer.invoke('cuts:render', file, segments, opts),
  repurpose: (file, opts) => ipcRenderer.invoke('video:repurpose', file, opts),
  publishPlatforms: () => ipcRenderer.invoke('publish:platforms'),
  publishPackage: (payload) => ipcRenderer.invoke('publish:package', payload),
  openExternal: (url) => ipcRenderer.invoke('publish:open', url),
  queueList: () => ipcRenderer.invoke('queue:list'),
  queueAdd: (item) => ipcRenderer.invoke('queue:add', item),
  queueRemove: (id) => ipcRenderer.invoke('queue:remove', id),
  analyticsImport: () => ipcRenderer.invoke('analytics:import'),
  analyticsSummary: () => ipcRenderer.invoke('analytics:summary'),
  analyticsClear: () => ipcRenderer.invoke('analytics:clear'),
  scanStorage: () => ipcRenderer.invoke('storage:scan'),
  archiveStorage: (payload) => ipcRenderer.invoke('storage:archive', payload),
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (patch) => ipcRenderer.invoke('settings:set', patch),
  reveal: (target) => ipcRenderer.invoke('shell:reveal', target),
  onProgress: (cb) => {
    ipcRenderer.on('job:progress', (_evt, data) => cb(data));
  }
});
