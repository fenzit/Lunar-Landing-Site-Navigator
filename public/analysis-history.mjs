const storageKey = 'lunarpilot-analysis-history-v1';
export const historyLimit = 5;
const clone = value => JSON.parse(JSON.stringify(value));

function usable(record) {
  const data = record?.analysis;
  return typeof record?.id === 'string' && record.required > 0 &&
    Number.isFinite(data?.site?.lat) && Number.isFinite(data?.site?.lon) &&
    Number.isFinite(data?.period?.start) && data.period.end > data.period.start && data.period.stepMinutes > 0 &&
    data.samples?.length >= 2 && ['sun', 'earth', 'both'].every(key => Array.isArray(data.windows?.[key])) &&
    Number.isFinite(data.summary?.totalMs) && Number.isFinite(data.summary?.longestMs) &&
    ['sun', 'earth'].every(key => typeof data.source?.records?.[key]?.url === 'string');
}

// Full results keep restored charts, window actions and the selected site on
// the same UTC timeline. Storage failure leaves the current session usable.
export class AnalysisHistory {
  constructor(storage) {
    this.storage = storage;
    this.records = [];
    this.persistent = Boolean(storage);
    try {
      const saved = JSON.parse(storage?.getItem(storageKey) ?? 'null');
      if (saved?.version === 1 && Array.isArray(saved.records)) {
        this.records = saved.records.filter(usable).slice(0, historyLimit);
      }
    } catch { this.persistent = false; }
  }

  save(analysis, { site, selection, required }) {
    const id = JSON.stringify([
      analysis.site.lat, analysis.site.lon, analysis.period.start, analysis.period.end,
      analysis.period.stepMinutes, analysis.terrain?.receiverHeight ?? 2, required,
    ]);
    const record = clone({ id, analysis, site, selection, required });
    this.records = [record, ...this.records.filter(item => item.id !== id)].slice(0, historyLimit);
    try {
      this.storage?.setItem(storageKey, JSON.stringify({ version: 1, records: this.records }));
      this.persistent = Boolean(this.storage);
    } catch { this.persistent = false; }
    return id;
  }

  get(id) {
    const record = this.records.find(item => item.id === id);
    return record ? clone(record) : null;
  }
}
