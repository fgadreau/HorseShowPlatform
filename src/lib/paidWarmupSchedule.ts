export type WarmupScheduleRow = { kind: 'horse' | 'drag'; number: number | null; label: string; offsetMinutes: number; durationMinutes: number; time: string };
export function buildWarmupSchedule(input: { labels: string[]; minutesPerHorse: number; dragEvery: number | null; dragMinutes: number; startTime?: string | null }): WarmupScheduleRow[] {
  if (!Number.isInteger(input.minutesPerHorse) || input.minutesPerHorse < 1 || !Number.isInteger(input.dragMinutes) || input.dragMinutes < 0 || (input.dragEvery != null && (!Number.isInteger(input.dragEvery) || input.dragEvery < 1))) throw Error('Invalid warmup durations');
  const match = input.startTime?.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (input.startTime && (!match || Number(match[1]) > 23 || Number(match[2]) > 59)) throw Error('Invalid start time');
  const start = match ? Number(match[1]) * 60 + Number(match[2]) : null;
  const result: WarmupScheduleRow[] = []; let elapsed = 0;
  const add = (kind: 'horse' | 'drag', number: number | null, label: string, durationMinutes: number) => {
    const minute = start == null ? null : start + elapsed;
    const time = minute == null ? `+${elapsed} min` : `${String(Math.floor(minute % 1440 / 60)).padStart(2,'0')}:${String(minute % 60).padStart(2,'0')}${minute >= 1440 ? ` (+${Math.floor(minute / 1440)} j/d)` : ''}`;
    result.push({kind, number, label, offsetMinutes: elapsed, durationMinutes, time}); elapsed += durationMinutes;
  };
  input.labels.forEach((label, i) => {
    add('horse', i + 1, label, input.minutesPerHorse);
    if (input.dragEvery && (i + 1) % input.dragEvery === 0 && i < input.labels.length - 1) add('drag', null, 'Préparation de piste / Arena drag', input.dragMinutes);
  });
  return result;
}
export function warmupScheduleCsv(rows: WarmupScheduleRow[]) {
  const cell = (s: string) => { const safe = /^\s*[=+@-]/.test(s) ? `'${s}` : s; return `"${safe.replace(/"/g,'""')}"`; };
  return '\uFEFF' + [['Ordre / Order','Heure approximative / Estimated time','Propriétaire et cheval / Owner and horse','Durée (min) / Duration (min)'], ...rows.map(r => [String(r.number ?? ''),r.time,r.label,String(r.durationMinutes)])].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
