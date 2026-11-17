import { locale } from './i18n.js';

export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function fromKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDate(
  date,
  options = { weekday: 'long', month: 'long', day: 'numeric' },
) {
  return new Intl.DateTimeFormat(locale(), options).format(date);
}

export function formatAmount(amount) {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(
    amount,
  );
}
