// 后台脚本：负责在"恢复标签页"之后，把重新打开的 YouTube 视频标签静音暂停，
// 避免恢复多个窗口时所有视频同时播放、非常吵。

const PENDING_KEY = "pendingAutoPauseTabIds";

async function addPendingTabIds(ids) {
  const data = await chrome.storage.session.get(PENDING_KEY);
  const existing = data[PENDING_KEY] || [];
  await chrome.storage.session.set({
    [PENDING_KEY]: [...existing, ...ids],
  });
}

async function removePendingTabId(id) {
  const data = await chrome.storage.session.get(PENDING_KEY);
  const existing = data[PENDING_KEY] || [];
  await chrome.storage.session.set({
    [PENDING_KEY]: existing.filter((tid) => tid !== id),
  });
}

// popup.js 恢复标签页后，会把新建的标签页 id 发过来，加入"待处理"名单
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "WATCH_TABS_FOR_AUTOPAUSE") {
    addPendingTabIds(message.tabIds);
  }
});

// 监听所有标签页的加载状态，只处理在"待处理"名单里、且是 YouTube 视频页的标签
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || !tab.url.includes("youtube.com/watch")) return;

  const data = await chrome.storage.session.get(PENDING_KEY);
  const pending = data[PENDING_KEY] || [];
  if (!pending.includes(tabId)) return;

  // YouTube 播放器有时在页面"加载完成"之后才真正开始播放，
  // 所以在几秒内多试几次暂停，确保盖住它。
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          document.querySelectorAll("video").forEach((v) => v.pause());
        },
      });
    } catch (e) {
      // 标签页可能已经被关闭，忽略即可
      break;
    }
  }

  removePendingTabId(tabId);
});
