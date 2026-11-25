function isValidCalendarDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCFullYear(year);
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

function parseDateParts(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})$/);
  if (!match) return null;
  const p1 = parseInt(match[1], 10);
  const p2 = parseInt(match[2], 10);
  const p3 = parseInt(match[3], 10);
  let day, month, year;
  if (match[1].length === 4 || p1 > 31) {
    year = p1;
    month = p2;
    day = p3;
  } else {
    day = p1;
    month = p2;
    year = p3;
  }
  if (!isValidCalendarDate(year, month, day)) return null;
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  const yyyy = String(year).padStart(4, '0');
  return {
    day,
    month,
    year,
    formatted: `${dd}/${mm}/${yyyy}`,
    sortKey: `${yyyy}-${mm}-${dd}`,
  };
}

function formatDateDDMMYYYY(value) {
  const parsed = parseDateParts(value);
  return parsed ? parsed.formatted : String(value || '').trim();
}

function getTodayDDMMYYYY(now = new Date()) {
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear()).padStart(4, '0');
  return `${dd}/${mm}/${yyyy}`;
}

function addDaysDDMMYYYY(parsed, days = 1) {
  const d = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  d.setUTCFullYear(parsed.year);
  d.setUTCDate(d.getUTCDate() + days);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getUTCFullYear()).padStart(4, '0');
  return `${dd}/${mm}/${yyyy}`;
}

function calculateAgeFromDob(dob, refDate = new Date()) {
  const trimmed = String(dob || '').trim();
  if (!trimmed) return '';
  const currentYear = refDate.getFullYear();
  const currentMonth = refDate.getMonth() + 1;
  const currentDay = refDate.getDate();

  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(trimmed)) {
    const parsed = parseDateParts(trimmed);
    if (!parsed) return '';
    if (
      parsed.year > currentYear ||
      (parsed.year === currentYear && parsed.month > currentMonth) ||
      (parsed.year === currentYear && parsed.month === currentMonth && parsed.day > currentDay)
    ) {
      return '';
    }
    let age = currentYear - parsed.year;
    if (currentMonth < parsed.month || (currentMonth === parsed.month && currentDay < parsed.day)) {
      age -= 1;
    }
    return String(Math.max(0, age));
  }

  const yearMatch = trimmed.match(/^\s*(\d{1,4})\s*$/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (Number.isInteger(year) && year >= 1 && year <= currentYear) {
      return String(Math.max(0, currentYear - year));
    }
  }
  return '';
}

module.exports = {
  isValidCalendarDate,
  parseDateParts,
  formatDateDDMMYYYY,
  getTodayDDMMYYYY,
  addDaysDDMMYYYY,
  calculateAgeFromDob,
};
