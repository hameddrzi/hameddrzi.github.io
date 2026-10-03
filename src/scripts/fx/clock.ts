// Live Europe/Rome clocks: any [data-clock] (optional data-clock="hms" for seconds).
let started = false;
export function startClocks(): void {
  if (started) return;
  started = true;
  const fmt = (sec: boolean) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', ...(sec ? { second: '2-digit' } : {}), hour12: false,
    });
  const fHM = fmt(false);
  const fHMS = fmt(true);
  const update = () => {
    const now = new Date();
    document.querySelectorAll<HTMLElement>('[data-clock]').forEach((el) => {
      const s = el.dataset.clock === 'hms' ? fHMS.format(now) : fHM.format(now);
      if (el.textContent !== s) el.textContent = s;
      if (el instanceof HTMLTimeElement) el.dateTime = now.toISOString();
    });
  };
  update();
  window.setInterval(update, 1000);
}
