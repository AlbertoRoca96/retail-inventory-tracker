// apps/mobile/src/lib/chatDateTime.ts
// Tiny date/time formatting helpers for chat UI.
// Keep this file boring and deterministic.

export function formatChatTime(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeekSunday(now: Date): Date {
  const d = startOfDay(now);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  return d;
}

export function isSameDay(a: string | Date, b: string | Date): boolean {
  const da = typeof a === 'string' ? new Date(a) : a;
  const db = typeof b === 'string' ? new Date(b) : b;
  if (!Number.isFinite(da.getTime()) || !Number.isFinite(db.getTime())) return false;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function formatChatDayLabel(d: Date, now: Date = new Date()): string {
  const startWeek = startOfWeekSunday(now);

  if (d >= startWeek) {
    // Within current week: weekday name
    const weekday = d.toLocaleDateString([], { weekday: 'short' });
    return weekday.toUpperCase();
  }

  if (d.getFullYear() === now.getFullYear()) {
    // Same year: JAN 31
    const month = d.toLocaleDateString([], { month: 'short' }).toUpperCase();
    return `${month} ${d.getDate()}`;
  }

  const month = d.toLocaleDateString([], { month: 'short' }).toUpperCase();
  return `${month} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatChatDayDivider(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const day = formatChatDayLabel(d, now);
  const time = formatChatTime(d);
  return `${day} ${time}`.trim();
}
