# Zotero 双语 PDF 翻译

为 Zotero 7 的 PDF 附件生成“原文段落 + 简体中文译文”交替排版的 A4 PDF。

## 安装

1. 运行 `npm install && npm run package`。
2. 在 Zotero 中打开“工具 → 插件”，点击齿轮并选择“从文件安装插件”。
3. 选择 `dist/zotero-bilingual-translator-0.1.0.xpi`。
4. 在“设置 → 双语 PDF 翻译”中填写 DeepSeek API Key。

## 使用

在 Zotero 主窗口选择一个 PDF 附件，右键菜单选择“生成中英双语 PDF”。结果保存在原 PDF 同一目录，文件名为 `原文件名.bilingual-zh-CN.pdf`；如有同名文件，自动增加序号。生成成功后，新 PDF 会作为同一父条目的链接附件出现。

## 限制与隐私

- 仅支持具有可提取文字的 PDF；扫描件和受密码保护文件不支持。
- 文档段落会发送到 DeepSeek API，请确认其适合你的资料保密要求。
- 第一版优先可读性，不复刻复杂表格、批注或原始双栏版式。
- 翻译缓存当前只在 Zotero 进程内保留；关闭 Zotero 后重新运行会重新请求尚未写入的内容。
