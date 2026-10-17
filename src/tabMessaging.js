// 팝업 → content script 메시지 헬퍼
// all_frames: true 라서 유튜브 안의 iframe에도 content script가 들어간다.
// frameId 없이 보내면 영상이 없는 iframe이 먼저 { success: false } 로 응답할 수 있으므로
// 항상 최상위 프레임(frameId: 0)에만 보낸다.
export const TOP_FRAME = { frameId: 0 };

export const getActiveTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
};

export const sendToActiveTab = async (message) => {
  const tab = await getActiveTab();
  if (!tab) throw new Error('No active tab');
  return chrome.tabs.sendMessage(tab.id, message, TOP_FRAME);
};

// 확장 설치/업데이트 전에 열려 있던 탭에는 content script가 없다.
// 이 경우 새로고침 대신 content script를 직접 주입한다.
export const isMissingReceiverError = (error) =>
  !!error && /Receiving end does not exist|Could not establish connection/i.test(error.message || '');

export const injectContentScript = async (tabId) => {
  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    files: ['content.js'],
  });
};
