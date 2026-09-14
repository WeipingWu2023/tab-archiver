const STORAGE_KEY = "savedSession";
const PREF_KEY = "saveAllWindowsPref";

const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("saveBtn");
const restoreBtn = document.getElementById("restoreBtn");
const allWindowsCheckbox = document.getElementById("allWindowsCheckbox");

// 页面一打开，就去读取上一次保存的记录，以及"保存范围"的偏好设置
async function init() {
  const pref = await chrome.storage.local.get(PREF_KEY);
  // 默认勾选"保存所有窗口"
  allWindowsCheckbox.checked = pref[PREF_KEY] !== false;
  await refreshStatus();
}

async function refreshStatus() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const saved = data[STORAGE_KEY];

  if (!saved) {
    statusEl.textContent = "还没有保存过标签页";
    return;
  }

  const totalTabs = saved.windows.reduce((sum, w) => sum + w.tabs.length, 0);
  const time = new Date(saved.timestamp).toLocaleString("zh-CN");
  statusEl.textContent = `上次保存：${time}\n共 ${saved.windows.length} 个窗口，${totalTabs} 个标签页`;
}

// 保存：根据勾选框，读取"当前窗口"或"所有窗口"的标签页，存到本地
async function saveSession() {
  const saveAll = allWindowsCheckbox.checked;
  await chrome.storage.local.set({ [PREF_KEY]: saveAll });

  let windows;
  if (saveAll) {
    windows = await chrome.windows.getAll({ populate: true });
  } else {
    const current = await chrome.windows.getCurrent({ populate: true });
    windows = [current];
  }

  const data = windows
    .map((win) => ({
      tabs: win.tabs
        .filter((tab) => tab.url && tab.url.startsWith("http")) // 只保存正常网页，跳过空白新标签页
        .map((tab) => ({ url: tab.url, title: tab.title })),
    }))
    .filter((win) => win.tabs.length > 0);

  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      timestamp: Date.now(),
      windows: data,
    },
  });

  statusEl.textContent = "已保存！";
  setTimeout(refreshStatus, 800);
}

// 恢复：读取保存的记录，为每一组窗口重新打开一个新窗口
// 恢复完成后，把新开的标签页 id 告诉后台脚本，由它负责暂停 YouTube 视频
async function restoreSession() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const saved = data[STORAGE_KEY];

  if (!saved || saved.windows.length === 0) {
    statusEl.textContent = "没有可恢复的记录，请先保存一次";
    return;
  }

  const newTabIds = [];

  for (const win of saved.windows) {
    const urls = win.tabs.map((t) => t.url);
    const created = await chrome.windows.create({ url: urls });
    if (created.tabs) {
      created.tabs.forEach((t) => newTabIds.push(t.id));
    }
  }

  if (newTabIds.length > 0) {
    chrome.runtime.sendMessage({
      type: "WATCH_TABS_FOR_AUTOPAUSE",
      tabIds: newTabIds,
    });
  }
}

saveBtn.addEventListener("click", saveSession);
restoreBtn.addEventListener("click", restoreSession);

init();
