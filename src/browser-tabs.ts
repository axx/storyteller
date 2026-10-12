export function waitForTabLoad(tabId: number): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      clearInterval(poll);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    };
    const finish = (error?: Error, tab?: chrome.tabs.Tab) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else if (tab) resolve(tab);
      else reject(new Error('The tab finished loading without tab details.'));
    };
    const onUpdated: Parameters<typeof chrome.tabs.onUpdated.addListener>[0] = (updatedId, changeInfo, tab) => {
      if (updatedId === tabId && changeInfo.status === 'complete') finish(undefined, tab);
    };
    const onRemoved = (removedId: number) => {
      if (removedId === tabId) finish(new Error('The tab was closed before it finished loading.'));
    };
    const timeout = setTimeout(() => finish(new Error('Timed out waiting for the tab to load.')), 30_000);
    const poll = setInterval(() => {
      void chrome.tabs.get(tabId).then(tab => {
        if (tab.status === 'complete') finish(undefined, tab);
      }, error => finish(error instanceof Error ? error : new Error('Could not read the tab status.')));
    }, 100);

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    void chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') finish(undefined, tab);
    }, error => finish(error instanceof Error ? error : new Error('Could not read the tab status.')));
  });
}
