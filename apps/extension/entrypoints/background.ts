import { browser } from 'wxt/browser';
import { createSimulationController, type PageInjector } from '@/utils/controller';
import { isSimulationMessage } from '@/utils/simulation';

// Deterministic ids so clear() can find and remove the fallback nodes.
const FALLBACK_SVG_ID = 'dichroma-fallback-svg';
const FALLBACK_STYLE_ID = 'dichroma-fallback-style';

/** Real PageInjector: browser.scripting + browser.permissions. */
const injector: PageInjector = {
  async insertCss(tabId, css) {
    await browser.scripting.insertCSS({ target: { tabId }, css });
  },
  async removeCss(tabId, css) {
    // removeCSS only matches the byte-identical string that was inserted.
    await browser.scripting.removeCSS({ target: { tabId }, css });
  },
  async readRootFilter(tabId) {
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: () => getComputedStyle(document.documentElement).filter,
    });
    return (result?.result as string | undefined) ?? 'none';
  },
  async probePage(tabId) {
    try {
      const [result] = await browser.scripting.executeScript({
        target: { tabId },
        args: [FALLBACK_STYLE_ID],
        func: (styleId: string) => ({
          filter: getComputedStyle(document.documentElement).filter,
          hasFallbackNodes: !!document.getElementById(styleId),
        }),
      });
      return (result?.result as { filter: string; hasFallbackNodes: boolean } | undefined) ?? null;
    } catch {
      return null; // page not scriptable (chrome:// etc., or no permission)
    }
  },
  async injectFallback(tabId, filterMarkup, css) {
    await browser.scripting.executeScript({
      target: { tabId },
      args: [filterMarkup, css, FALLBACK_SVG_ID, FALLBACK_STYLE_ID],
      func: (markup: string, cssText: string, svgId: string, styleId: string) => {
        document.getElementById(svgId)?.remove();
        document.getElementById(styleId)?.remove();
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = svgId;
        svg.setAttribute('width', '0');
        svg.setAttribute('height', '0');
        svg.setAttribute('aria-hidden', 'true');
        svg.style.position = 'absolute';
        svg.innerHTML = markup;
        document.documentElement.append(svg);
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = cssText;
        document.documentElement.append(style);
      },
    });
  },
  async removeFallback(tabId) {
    await browser.scripting.executeScript({
      target: { tabId },
      args: [FALLBACK_SVG_ID, FALLBACK_STYLE_ID],
      func: (svgId: string, styleId: string) => {
        document.getElementById(svgId)?.remove();
        document.getElementById(styleId)?.remove();
      },
    });
  },
  async hasAllUrlsPermission() {
    return browser.permissions.contains({ origins: ['<all_urls>'] });
  },
};

export default defineBackground(() => {
  const controller = createSimulationController(injector);

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!isSimulationMessage(msg)) return;
    controller
      .handleMessage(msg)
      .then(sendResponse, (err) => sendResponse({ ok: false, error: String(err) }));
    return true; // keep the channel open for the async response
  });

  // Invoking the keyboard command grants activeTab, so this works without
  // host permissions even on pages the popup was never opened on.
  browser.commands.onCommand.addListener((command, tab) => {
    if (command === 'toggle-simulation') void controller.handleToggleCommand(tab);
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    void controller.handleTabUpdated(tabId, changeInfo);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void controller.handleTabRemoved(tabId);
  });
});
