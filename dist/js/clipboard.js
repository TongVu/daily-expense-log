export function legacyCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  textarea.style.fontSize = '16px';
  document.body.append(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}

export function writeClipboardText(text) {
  let clipboardWrite;
  try {
    if (navigator.clipboard?.writeText)
      clipboardWrite = navigator.clipboard.writeText(text);
  } catch {
    clipboardWrite = null;
  }
  const fallbackCopied = legacyCopyText(text);
  if (clipboardWrite)
    return clipboardWrite.then(
      () => true,
      () => fallbackCopied,
    );
  return Promise.resolve(fallbackCopied);
}
