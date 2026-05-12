/* habit.js — Habit 탭 로직 및 This week 꺾은선 그래프 */

const HabitManager = {

  /* ── 날짜 자정 전환 처리 ─────────────────────── */

  checkDayRollover(habitData) {
    const today = Parser.todayStr();
    const last  = localStorage.getItem('habit_last_date');

    if (last && last !== today) {
      // 어제 달성률 계산 후 weekly_record에 저장
      const total   = habitData.habits.length;
      const checked = habitData.habits.filter(h => h.done).length;
      const pct     = total > 0 ? Math.round((checked / total) * 100) : 0;

      habitData.weekly_record[last] = pct;

      // 오늘 체크 초기화
      habitData.habits.forEach(h => { h.done = false; });
    }

    localStorage.setItem('habit_last_date', today);
    return habitData;
  },

  /* ── 달성률 계산 ─────────────────────────────── */

  calcPercent(habits) {
    if (!habits.length) return 0;
    const done = habits.filter(h => h.done).length;
    return Math.round((done / habits.length) * 100);
  },

  /* ── This week 데이터 ─────────────────────────── */

  getWeekData(habitData) {
    const today   = new Date();
    const dayOfWk = today.getDay(); // 0=Sun
    const mon     = new Date(today);
    mon.setDate(today.getDate() - ((dayOfWk + 6) % 7)); // 이번 주 월요일

    const labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const data   = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      const key = _dateToStr(d);

      if (key === Parser.todayStr()) {
        // 오늘: 현재 체크 상태로 계산
        data.push({ label: labels[i], pct: this.calcPercent(habitData.habits), isToday: true });
      } else if (key > Parser.todayStr()) {
        // 미래
        data.push({ label: labels[i], pct: null, isToday: false });
      } else {
        // 과거
        const pct = habitData.weekly_record[key] ?? 0;
        data.push({ label: labels[i], pct, isToday: false });
      }
    }
    return data;
  },

  /* ── Canvas 꺾은선 그래프 그리기 ─────────────── */

  drawChart(canvas, habitData) {
    // 모바일에서 레이아웃이 완성된 뒤 크기를 읽도록 requestAnimationFrame 사용
    requestAnimationFrame(() => this._renderChart(canvas, habitData));
  },

  _renderChart(canvas, habitData) {
    const ctx = canvas.getContext('2d');
    // offsetWidth가 0이면 부모 컨테이너 너비로 대체
    const W = canvas.offsetWidth  || canvas.parentElement?.offsetWidth || 300;
    const H = canvas.offsetHeight || 150;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const weekData  = this.getWeekData(habitData);
    const isDark    = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const PAD_L  = 32;
    const PAD_R  = 16;
    const PAD_T  = 24;
    const PAD_B  = 28;
    const innerW = W - PAD_L - PAD_R;
    const innerH = H - PAD_T - PAD_B;

    ctx.clearRect(0, 0, W, H);

    const lineColor  = isDark ? '#bbbbbb' : '#555555';
    const dotColor   = isDark ? '#ffffff' : '#333333';
    const textColor  = isDark ? '#cccccc' : '#444444';
    const labelColor = isDark ? '#999999' : '#888888';
    const gridColor  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

    // 유효한 포인트 (과거+오늘, null 제외)
    const validPoints = weekData
      .map((d, i) => ({ ...d, i }))
      .filter(d => d.pct !== null);

    // 배경 가이드 라인 (25%, 50%, 75%, 100%)
    [25, 50, 75, 100].forEach(pct => {
      const y = PAD_T + innerH - (pct / 100) * innerH;
      ctx.beginPath();
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(PAD_L, y);
      ctx.lineTo(PAD_L + innerW, y);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // x 좌표
    const xOf = (i) => PAD_L + (i / 6) * innerW;
    // y 좌표 — 0%도 하단에서 약간 위로 표시해 점이 잘리지 않게 PAD 적용
    const yOf = (pct) => PAD_T + innerH - Math.max(pct / 100, 0) * innerH;

    if (validPoints.length === 0) {
      ctx.fillStyle = textColor;
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('습관을 추가하고 체크해보세요!', W / 2, H / 2);
    } else {
      // 꺾은선
      ctx.beginPath();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth   = 2.5;
      ctx.lineJoin    = 'round';
      validPoints.forEach((pt, idx) => {
        const x = xOf(pt.i);
        const y = yOf(pt.pct);
        if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // 점 + 퍼센트 레이블
      validPoints.forEach(pt => {
        const x = xOf(pt.i);
        const y = yOf(pt.pct);

        // 점 외곽 흰 테두리 (가시성 향상)
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? '#2a2a2a' : '#ffffff';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();

        const labelY = y - 12 < PAD_T + 4 ? y + 18 : y - 12;
        ctx.fillStyle = textColor;
        ctx.font      = pt.isToday ? 'bold 12px sans-serif' : '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${pt.pct}%`, x, labelY);
      });
    }

    // 요일 레이블
    weekData.forEach((d, i) => {
      const x = xOf(i);
      ctx.fillStyle   = d.isToday ? textColor : labelColor;
      ctx.font        = d.isToday ? 'bold 11px sans-serif' : '10px sans-serif';
      ctx.textAlign   = 'center';
      ctx.fillText(d.label, x, H - PAD_B + 16);
    });
  },
};

function _dateToStr(date) {
  const y   = date.getFullYear();
  const m   = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
