/* parser.js — tasksdb.md & habitdb.md 파싱/직렬화 */

const Parser = {

  /* ── tasksdb.md ─────────────────────────────── */

  parseTasks(md) {
    if (!md || !md.trim()) return [];
    return md.split('\n')
      .map(line => this._parseTaskLine(line.trim()))
      .filter(Boolean);
  },

  _parseTaskLine(line) {
    // - [ ] title / 📆date / ⏰time / 📍pin / 📝note
    const match = line.match(/^- \[([ x])\] (.+)$/);
    if (!match) return null;

    const done  = match[1] === 'x';
    const parts = match[2].split(' / ');
    const task  = {
      id   : this._uid(),
      done,
      title: parts[0].trim(),
      date : null,
      time : null,
      pin  : null,
      note : null,
    };

    for (let i = 1; i < parts.length; i++) {
      const p = parts[i].trim();
      if      (p.startsWith('📆')) task.date = p.replace(/^📆\s*/, '');
      else if (p.startsWith('⏰')) task.time = p.replace(/^⏰\s*/, '');
      else if (p.startsWith('📍')) task.pin  = p.replace(/^📍\s*/, '');
      else if (p.startsWith('📝')) task.note = p.replace(/^📝\s*/, '');
    }
    return task;
  },

  serializeTasks(tasks) {
    return tasks.map(t => this._serializeTask(t)).join('\n');
  },

  _serializeTask(t) {
    let line = `- [${t.done ? 'x' : ' '}] ${t.title}`;
    if (t.date) line += ` / 📆${t.date}`;
    if (t.time) line += ` / ⏰${t.time}`;
    if (t.pin)  line += ` / 📍${t.pin}`;
    if (t.note) line += ` / 📝${t.note}`;
    return line;
  },

  /* ── habitdb.md ──────────────────────────────── */

  parseHabits(md) {
    const result = { habits: [], weekly_record: {} };
    if (!md || !md.trim()) return result;

    // Split on "## " section headers
    const raw = '## ' + md.replace(/^##\s*/m, '');
    const sections = raw.split(/\n(?=## )/);

    for (const section of sections) {
      const lines  = section.split('\n');
      const header = lines[0].replace(/^##\s*/, '').trim();

      if (header === 'habits') {
        result.habits = lines.slice(1)
          .map(l => l.trim())
          .filter(l => l.startsWith('- ['))
          .map(l => {
            const m = l.match(/^- \[([ x])\] (.+)$/);
            if (!m) return null;
            return { id: this._uid(), done: m[1] === 'x', name: m[2].trim() };
          })
          .filter(Boolean);

      } else if (header === 'weekly_record') {
        for (const line of lines.slice(1)) {
          const m = line.trim().match(/^(\d{4}-\d{2}-\d{2}):\s*(\d+)$/);
          if (m) result.weekly_record[m[1]] = parseInt(m[2], 10);
        }
      }
    }
    return result;
  },

  serializeHabits(data) {
    let md = '## habits\n';
    if (data.habits.length) {
      md += data.habits.map(h => `- [${h.done ? 'x' : ' '}] ${h.name}`).join('\n');
    }
    md += '\n\n## weekly_record\n';
    const entries = Object.entries(data.weekly_record)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 60); // 지난 60일치만 보관
    if (entries.length) {
      md += entries.map(([date, pct]) => `${date}: ${pct}`).join('\n');
    }
    return md;
  },

  /* ── Date helpers ─────────────────────────────── */

  /** "2026-05-06" → "2026.05.06.Wed" */
  formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    const d    = new Date(dateStr + 'T00:00:00');
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}.${days[d.getDay()]}`;
  },

  /** "2026-05-06" → Date object (local midnight) */
  parseDate(dateStr) {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  },

  /** today's date string "YYYY-MM-DD" */
  todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  /* ── Private ────────────────────────────────── */
  _uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  },
};
