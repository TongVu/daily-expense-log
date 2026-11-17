export let currentLanguage = (() => {
  try {
    const saved = localStorage.getItem('daybook-language');
    if (saved === 'en' || saved === 'vi') return saved;
  } catch {}
  return 'vi';
})();
let translations = {};

export function t(english) {
  return translations[english] || english;
}

export async function loadTranslations(language = currentLanguage) {
  const response = await fetch(`./locales/${language}.json`);
  if (!response.ok) throw new Error(`Could not load ${language} translations`);
  translations = await response.json();
}

export function locale() {
  return currentLanguage === 'vi' ? 'vi-VN' : 'en-US';
}

export function formatEntryCount(count) {
  return currentLanguage === 'vi'
    ? `${count} khoản`
    : `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

export function formatExpenseCount(count) {
  return currentLanguage === 'vi'
    ? `${count} khoản chi`
    : `${count} ${count === 1 ? 'expense' : 'expenses'}`;
}

export async function toggleLanguage() {
  const nextLanguage = currentLanguage === 'vi' ? 'en' : 'vi';
  await loadTranslations(nextLanguage);
  currentLanguage = nextLanguage;
  try {
    localStorage.setItem('daybook-language', currentLanguage);
  } catch {}
}
