declare const Zotero: any;
import { translateSelectedAttachment } from './zotero/runtime.js';

const PLUGIN_ID = 'bilingual-translator@example.com';
const MENU_ID = 'bilingual-translator-menuitem';

let rootURI = '';

async function startup({ rootURI: suppliedRootURI }: { rootURI: string }): Promise<void> {
  rootURI = suppliedRootURI;
  Zotero.PreferencePanes.register({
    pluginID: PLUGIN_ID,
    src: `${rootURI}prefs.xhtml`,
  });
  for (const window of Zotero.getMainWindows()) addToWindow(window);
}

function shutdown(): void {
  for (const window of Zotero.getMainWindows()) removeFromWindow(window);
}

function install(): void {}

function uninstall(): void {}

Object.assign(globalThis, { startup, shutdown, install, uninstall });

function onMainWindowLoad({ window }: { window: Window }): void {
  addToWindow(window);
}

function onMainWindowUnload({ window }: { window: Window }): void {
  removeFromWindow(window);
}

function addToWindow(window: any): void {
  const document = window.document;
  if (document.getElementById(MENU_ID)) return;
  const item = document.createXULElement('menuitem');
  item.id = MENU_ID;
  item.setAttribute('label', '生成中英双语 PDF');
  item.addEventListener('command', async () => {
    const selected = window.ZoteroPane.getSelectedItems();
    if (selected.length !== 1 || !selected[0].isAttachment()) {
      window.alert('请先选择一个 PDF 附件。');
      return;
    }
    try {
      const output = await translateSelectedAttachment(rootURI, selected[0].id);
      window.alert(`双语 PDF 已生成：${output}`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '生成双语 PDF 时发生未知错误。');
    }
  });
  document.getElementById('zotero-itemmenu')?.appendChild(item);
}

function removeFromWindow(window: any): void {
  window.document.getElementById(MENU_ID)?.remove();
}
