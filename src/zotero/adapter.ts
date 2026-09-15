export interface AttachmentCandidate {
  contentType: string;
  path: string;
}

export function assertTranslatableAttachment(attachment: AttachmentCandidate): void {
  if (attachment.contentType !== 'application/pdf' && !attachment.path.toLowerCase().endsWith('.pdf')) {
    throw new Error('请选择具有可提取文字的 PDF 附件。');
  }
}

export async function uniqueOutputPath(sourcePath: string, exists: (path: string) => Promise<boolean>): Promise<string> {
  const extensionIndex = sourcePath.lastIndexOf('.');
  const extension = extensionIndex >= 0 ? sourcePath.slice(extensionIndex) : '.pdf';
  const stem = extensionIndex >= 0 ? sourcePath.slice(0, extensionIndex) : sourcePath;
  const firstCandidate = `${stem}.bilingual-zh-CN${extension}`;
  if (!await exists(firstCandidate)) return firstCandidate;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stem}.bilingual-zh-CN-${suffix}${extension}`;
    if (!await exists(candidate)) return candidate;
  }
}
