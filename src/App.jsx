import { useState, useEffect, useCallback, useRef } from "react";

const CHANNEL = "otailungg";
const PASS = "3n@2ysxk";
const API = "/api/state";
const CLIENT_ID = "bso3queqhjj7epoc18d9tfomtmthbm";
const REDIRECT_URI = "https://area-tailung.vercel.app";
const MIN_MINS_LIVE = 60;
const MIN_MINS_TOTAL = 660;
const MIN_DAYS = 4;

function calcMins(sessions) { return sessions.reduce((a, s) => a + (s.minutes || 0), 0); }
function uniqueDays(sessions) { return [...new Set(sessions.map(s => s.date))]; }
function qualifiedDays(sessions) { return sessions.filter(s => s.minutes >= MIN_MINS_LIVE).length; }
// Stars redistribute excess minutes across days: 2h on one day + 30min on another = 2 stars
function calcStars(sessions) {
  const total = sessions.reduce((a, s) => a + (s.minutes || 0), 0);
  return Math.min(Math.floor(total / MIN_MINS_LIVE), sessions.length);
}
function isEligible(v) {
  return calcMins(v.sessions) >= MIN_MINS_TOTAL || calcStars(v.sessions) >= MIN_DAYS;
}
function totalScore(v) { return uniqueDays(v.sessions).length * 20 + calcMins(v.sessions); }

// ELO system — set to true to go live
const ELO_ENABLED = false;

const ELO_RANKS = [
  { name: "Sombra",            color: "#9CA3AF", bg: "#1C1C22", xpMin: 0     },
  { name: "Caçador",           color: "#4ADE80", bg: "#071A0C", xpMin: 500   },
  { name: "Guerreiro",         color: "#22D3EE", bg: "#061518", xpMin: 1700  },
  { name: "Conquistador",      color: "#60A5FA", bg: "#08111F", xpMin: 3800  },
  { name: "Élite",             color: "#C084FC", bg: "#150630", xpMin: 7000  },
  { name: "Campeão",           color: "#FB923C", bg: "#1A0900", xpMin: 13000 },
  { name: "Lendário",          color: "#FACC15", bg: "#1A1400", xpMin: 23000 },
  { name: "Imortal",           color: "#F87171", bg: "#1A0303", xpMin: 30000 },
  { name: "Lenda do Tailung",  color: "#F472B6", bg: "#1A0210", xpMin: 40000 },
];
function getElo(xp) {
  let idx = 0;
  for (let i = 0; i < ELO_RANKS.length; i++) { if (xp >= ELO_RANKS[i].xpMin) idx = i; else break; }
  return idx;
}

// XP bar thresholds (used only for progress bar calculation — levels have no names)
const LEVEL_THRESHOLDS = [0,200,500,1000,1700,2600,3800,5200,7000,9500,13000,17500,23000,30000,40000];

function calcXP(v) {
  let xp = v.permanentXP || 0; // XP acumulado de ciclos purgados (permanente)
  for (const s of v.sessions || []) {
    xp += (s.minutes||0) + 25;
    if ((s.minutes||0) >= MIN_MINS_LIVE) xp += 50;
  }
  for (const h of v.history || []) {
    xp += (h.totalMinutes||0) + (h.lives||0) * 25;
    for (const s of h.sessions || []) {
      if ((s.minutes||0) >= MIN_MINS_LIVE) xp += 50;
    }
    if (h.eligible) xp += 100;
    if (h.won) xp += 500;
  }
  return xp;
}
function getLevelInfo(xp) {
  let idx = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) { if (xp >= LEVEL_THRESHOLDS[i]) idx = i; else break; }
  const curr = LEVEL_THRESHOLDS[idx] || 0;
  const next = LEVEL_THRESHOLDS[idx + 1];
  if (!next) return { pct: 100, xpIn: 0, xpNeed: 0 };
  return { pct: Math.round((xp - curr) / (next - curr) * 100), xpIn: xp - curr, xpNeed: next - curr };
}

function eloFrameStyle(xp) {
  if (!ELO_ENABLED) return { border: "2px solid #9146FF55" };
  const idx = getElo(xp);
  const { color } = ELO_RANKS[idx];
  if (idx >= 6) return { border: `3px solid ${color}`, boxShadow: `0 0 0 1px ${color}66, 0 0 16px ${color}AA` };
  if (idx >= 4) return { border: `2.5px solid ${color}`, boxShadow: `0 0 0 1px ${color}44, 0 0 10px ${color}77` };
  return { border: `2px solid ${color}`, boxShadow: `0 0 0 1px ${color}22` };
}

function EloBadge({ xp, size = 40 }) {
  const idx = getElo(xp);
  const { color, bg } = ELO_RANKS[idx];
  const shield = "M20,2 L37,12 L33,36 L7,36 L3,12 Z";
  const hasGlow = idx >= 4;
  const glowId = `eg${idx}`;
  const icons = [
    // 0 Sombra — crescent moon
    <g key="s"><circle cx="20" cy="21" r="9" fill={color}/><circle cx="24.5" cy="17.5" r="7.5" fill={bg}/></g>,
    // 1 Caçador — arrow up
    <path key="c" d="M20,10 L28,22 L22.5,22 L22.5,31 L17.5,31 L17.5,22 L12,22 Z" fill={color}/>,
    // 2 Guerreiro — crossed swords
    <g key="g">
      <line x1="13" y1="13" x2="27" y2="28" stroke={color} strokeWidth="3" strokeLinecap="round"/>
      <line x1="27" y1="13" x2="13" y2="28" stroke={color} strokeWidth="3" strokeLinecap="round"/>
      <circle cx="20" cy="20.5" r="2.5" fill={bg} stroke={color} strokeWidth="1.5"/>
    </g>,
    // 3 Conquistador — nested shield
    <path key="co" d="M20,12 L29,17 L26.5,29 L20,33 L13.5,29 L11,17 Z" fill="none" stroke={color} strokeWidth="2.5"/>,
    // 4 Élite — 5-point star
    <path key="e" d="M20,10 L22.4,17.2 L30,17.2 L24,21.6 L26.4,28.8 L20,24.4 L13.6,28.8 L16,21.6 L10,17.2 L17.6,17.2 Z" fill={color}/>,
    // 5 Campeão — crown
    <g key="ca">
      <path d="M11.5,27 L11.5,16.5 L16,22.5 L20,12 L24,22.5 L28.5,16.5 L28.5,27 Z" fill={color}/>
      <rect x="11.5" y="26.5" width="17" height="3" rx="1.5" fill={color}/>
    </g>,
    // 6 Lendário — wings + diamond
    <g key="le">
      <path d="M20,23 C17,16 10,17 10,22 C10,27 15.5,27 20,23Z" fill={color} opacity="0.85"/>
      <path d="M20,23 C23,16 30,17 30,22 C30,27 24.5,27 20,23Z" fill={color} opacity="0.85"/>
      <path d="M20,11 L23,20 L20,23.5 L17,20 Z" fill={color}/>
    </g>,
    // 7 Imortal — flame
    <path key="i" d="M20,31 C13,31 11,24 14,18.5 C15,23 17.5,22 18,18.5 C19.5,22.5 18.5,27 20.5,27 C22.5,27 21.5,22.5 23,18.5 C23.5,22 26,23 25,18.5 C29,24 27,31 20,31Z" fill={color}/>,
    // 8 Lenda do Tailung — 8-point starburst + ring
    <g key="lt">
      <circle cx="20" cy="21" r="9.5" fill="none" stroke={color} strokeWidth="1" opacity="0.5"/>
      <path d="M20,11 L21.8,18.2 L29,20 L21.8,21.8 L20,29 L18.2,21.8 L11,20 L18.2,18.2 Z" fill={color} opacity="0.6"/>
      <path d="M20,14 L21.2,18.8 L26,20 L21.2,21.2 L20,26 L18.8,21.2 L14,20 L18.8,18.8 Z" fill={color}/>
    </g>,
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {hasGlow && <defs><filter id={glowId} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>}
      <path d={shield} fill={bg} stroke={color} strokeWidth={idx === 0 ? "1" : "1.5"} opacity={idx === 0 ? "0.7" : "1"}/>
      {idx >= 5 && <path d={shield} fill={color} opacity="0.07"/>}
      <g filter={hasGlow ? `url(#${glowId})` : undefined}>{icons[idx]}</g>
    </svg>
  );
}

function formatDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function monthLabel(d) {
  if (!d) return "";
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const [y, m] = d.split("-");
  return `${months[parseInt(m)-1]} ${y}`;
}

function monthlyEligibleCycles(v) {
  const now = new Date().toISOString().slice(0, 7);
  return (v.history || []).filter(h => h.eligible && (h.cycleEnd || "").slice(0, 7) === now).length;
}
function isMonthlyEligible(v) { return monthlyEligibleCycles(v) >= 3; }

const ACHIEVEMENTS = [
  { id: "first_step",       icon: "🎮", name: "Primeiros Passos",  desc: "Fez o primeiro check-in",                 check: v => v.sessions?.length > 0 || (v.history||[]).some(h => h.sessions?.length > 0) },
  { id: "eligible",         icon: "✅", name: "Na Urna",           desc: "Ficou elegível em um sorteio",             check: v => isEligible(v) || (v.history||[]).some(h => h.eligible) },
  { id: "champion",         icon: "🏆", name: "Campeão",           desc: "Ganhou um sorteio semanal",                check: v => (v.history||[]).some(h => h.won) },
  { id: "subscriber",       icon: "⭐", name: "Inscrito",          desc: "É inscrito do canal",                      check: v => !!v.hasSub },
  { id: "monthly_eligible", icon: "🏅", name: "Elegível Mensal",   desc: "3+ semanas elegíveis no mesmo mês",        check: v => isMonthlyEligible(v) },
  { id: "marathon",         icon: "⏱", name: "Maratonista",        desc: "Acumulou 11h em uma única semana",         check: v => calcMins(v.sessions) >= 660 || (v.history||[]).some(h => h.totalMinutes >= 660) },
  { id: "dedicated",        icon: "📅", name: "Dedicado",           desc: "4+ estrelas em uma semana",                check: v => calcStars(v.sessions) >= 4 || (v.history||[]).some(h => calcStars(h.sessions||[]) >= 4) },
  { id: "veteran",          icon: "🎖", name: "Veterano",           desc: "Participou de 5 ou mais ciclos",           check: v => (v.history?.length||0) >= 5 },
  { id: "legend",           icon: "🌟", name: "Lenda da Área",      desc: "Participou de 10 ou mais ciclos",          check: v => (v.history?.length||0) >= 10 },
  { id: "perfect_month",    icon: "💎", name: "Mês Perfeito",       desc: "4 semanas elegíveis em um mesmo mês",      check: v => { const m = {}; for (const h of v.history||[]) { if (!h.eligible) continue; const k=(h.cycleEnd||"").slice(0,7); if (!k) continue; m[k]=(m[k]||0)+1; if(m[k]>=4) return true; } return false; } },
];

function ProfileModal({ v, vList, onClose }) {
  const xp = calcXP(v);
  const li = getLevelInfo(xp);
  const eloColor = ELO_RANKS[getElo(xp)].color;
  const ok = isEligible(v);
  const rank = vList.findIndex(x => x.twitch_id === v.twitch_id) + 1;
  const monthCycles = monthlyEligibleCycles(v);
  const monthlyOk = isMonthlyEligible(v);
  const qDays = calcStars(v.sessions);
  const mins = calcMins(v.sessions);
  const days = uniqueDays(v.sessions).length;
  const history = v.history || [];
  const achievements = ACHIEVEMENTS.map(a => ({ ...a, unlocked: a.check(v) }));
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000BB", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#18181B", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 620, maxHeight: "92dvh", overflowY: "auto", paddingBottom: 32 }} onClick={e => e.stopPropagation()}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "#3D3D47" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "14px 20px 20px", background: `linear-gradient(180deg, ${eloColor}15 0%, transparent 100%)`, borderBottom: "1px solid #26262C" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 58, height: 58, borderRadius: "50%", background: `${eloColor}22`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: eloColor, fontSize: 26, flexShrink: 0, ...eloFrameStyle(xp) }}>
              {(v.display_name || v.nick)[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 19, color: "#EFEFF1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.display_name || v.nick}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 5, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "#ADADB8" }}>#{rank} ranking</span>
                {v.hasSub && <span style={{ background: "#FF69B415", color: "#FF69B4", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>⭐ sub</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: "#26262C", border: "none", borderRadius: "50%", width: 34, height: 34, color: "#ADADB8", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
          </div>
          {/* XP Bar */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#ADADB8", marginBottom: 5 }}>
              <span>{xp} XP total</span>
              {li.xpNeed > 0 && <span>faltam {li.xpNeed - li.xpIn} XP</span>}
            </div>
            <div style={{ background: "#26262C", borderRadius: 20, height: 8, overflow: "hidden" }}>
              <div style={{ width: `${li.pct}%`, height: "100%", background: `linear-gradient(90deg, ${eloColor}77, ${eloColor})`, borderRadius: 20 }} />
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 20px 0" }}>
          {/* Status Semanal + Mensal */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            <div style={{ background: ok ? "#00C85318" : "#1a1a1e", border: `1.5px solid ${ok ? "#00C85355" : "#3D3D47"}`, borderRadius: 14, padding: "14px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{ok ? "✅" : "⏳"}</div>
              <div style={{ fontWeight: 800, fontSize: 13, color: ok ? "#00C853" : "#ADADB8" }}>{ok ? "Elegível" : "Pendente"}</div>
              <div style={{ fontSize: 10, color: "#ADADB8", marginTop: 2 }}>Sorteio semanal</div>
            </div>
            <div style={{ background: monthlyOk ? "#FFD70018" : "#1a1a1e", border: `1.5px solid ${monthlyOk ? "#FFD70055" : "#3D3D47"}`, borderRadius: 14, padding: "14px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{monthlyOk ? "🏅" : monthCycles > 0 ? "🔓" : "🔒"}</div>
              <div style={{ fontWeight: 800, fontSize: 13, color: monthlyOk ? "#FFD700" : monthCycles > 0 ? "#C9A7FF" : "#ADADB8" }}>{monthCycles}/3 semanas</div>
              <div style={{ fontSize: 10, color: "#ADADB8", marginTop: 2 }}>Sorteio mensal</div>
              {/* mini progress dots */}
              <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 6 }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i < monthCycles ? "#FFD700" : "#3D3D47", transition: "background .3s" }} />)}
              </div>
            </div>
          </div>

          {/* Semana atual */}
          <div style={{ background: "#26262C", borderRadius: 14, padding: "14px", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9146FF", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>📊 Semana Atual</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
              {[["#9146FF", days, "lives"],["#00C853", `${Math.floor(mins/60)}h${mins%60}m`, "tempo"],["#FFD700", qDays, "dias qualif."]].map(([color, val, lbl]) => (
                <div key={lbl} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color }}>{val}</div>
                  <div style={{ fontSize: 10, color: "#ADADB8", marginTop: 2 }}>{lbl}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
              {Array.from({length: 4}, (_,i) => (
                <span key={i} style={{ fontSize: 20, color: i < qDays ? "#FFD700" : "#3D3D47", filter: i < qDays ? "drop-shadow(0 0 4px #FFD70088)" : "none", transition: "all .3s" }}>★</span>
              ))}
            </div>
          </div>

          {/* Conquistas */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#ADADB8", letterSpacing: 1.5, textTransform: "uppercase" }}>🏅 Conquistas</div>
              <span style={{ fontSize: 11, color: "#9146FF", fontWeight: 700 }}>{unlockedCount}/{achievements.length}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
              {achievements.map(a => (
                <div key={a.id} style={{ background: a.unlocked ? "#9146FF12" : "#1a1a1e", border: `1px solid ${a.unlocked ? "#9146FF44" : "#26262C"}`, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, opacity: a.unlocked ? 1 : 0.4, transition: "opacity .2s" }}>
                  <span style={{ fontSize: 22, flexShrink: 0, filter: a.unlocked ? "none" : "grayscale(1) brightness(.5)" }}>{a.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: a.unlocked ? "#EFEFF1" : "#ADADB8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: "#ADADB8", lineHeight: 1.4 }}>{a.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Histórico */}
          {history.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#ADADB8", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>📁 Histórico ({history.length} ciclo{history.length !== 1 ? "s" : ""})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {history.slice(0, 8).map((h, i) => (
                  <div key={i} style={{ background: "#26262C", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{h.won ? "🏆" : h.eligible ? "✅" : "⏳"}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#EFEFF1" }}>{formatDate(h.cycleEnd)}</div>
                      <div style={{ fontSize: 10, color: "#ADADB8" }}>
                        {h.lives} live(s) · {Math.floor(h.totalMinutes/60)}h{h.totalMinutes%60}m · <span style={{ color: h.eligible ? "#00C853" : "#ADADB8" }}>{h.eligible ? "elegível" : "não elegível"}</span>{h.won ? " · 🏆 ganhou!" : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PrizeCarousel({ eligCount, vList }) {
  const [slide, setSlide] = useState(0);
  const [vis, setVis] = useState(true);
  const total = 2;

  const SLIDE_LABELS = ["🎁 Prêmios Semanais", "🏅 Prêmio Mensal"];

  useEffect(() => {
    const t = setInterval(() => {
      setVis(false);
      setTimeout(() => { setSlide(s => (s+1)%total); setVis(true); }, 280);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  function goTo(i) { setVis(false); setTimeout(() => { setSlide(i); setVis(true); }, 280); }

  const CAROUSEL_H = 460;
  return (
    <div style={{ position: "relative", background: "linear-gradient(145deg, #0d0020 0%, #1a0533 55%, #0d001a 100%)", borderRadius: 14, overflow: "hidden", border: "1.5px solid #9146FF44", height: CAROUSEL_H }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 110%, #9146FF20 0%, transparent 65%)", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #9146FF22", flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9146FF", letterSpacing: 2, textTransform: "uppercase", transition: "opacity .28s", opacity: vis ? 1 : 0 }}>{SLIDE_LABELS[slide]}</div>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {Array.from({length: total}).map((_,i) => (
              <div key={i} onClick={() => goTo(i)} style={{ width: i===slide?20:7, height: 7, borderRadius: 4, background: i===slide?"#9146FF":"#3D3D47", cursor: "pointer", transition: "all .3s ease" }} />
            ))}
          </div>
        </div>
        {/* Slides — fixed inner height, no resize */}
        <div style={{ flex: 1, overflow: "hidden", transition: "opacity .28s", opacity: vis ? 1 : 0 }}>
          {/* Slide 0: Semanal */}
          <div style={{ display: slide === 0 ? "flex" : "none", flexDirection: "column", height: "100%", padding: "10px 12px 14px" }}>
            <div style={{ height: 280, flexShrink: 0, marginBottom: 12 }}>
              <img src="/premio.png" alt="Prêmio Semanal" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", borderRadius: 10 }} onError={e => { e.target.style.display="none"; }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ background: "#9146FF18", border: "1px solid #9146FF44", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#C9A7FF", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>⏱</span>
                <span><strong style={{ color: "#fff" }}>11h</strong> de live acumuladas na semana</span>
              </div>
              <div style={{ fontSize: 11, color: "#9146FF", fontWeight: 700, textAlign: "center" }}>— OU —</div>
              <div style={{ background: "#9146FF18", border: "1px solid #9146FF44", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#C9A7FF", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>📅</span>
                <span><strong style={{ color: "#fff" }}>4 dias</strong> de check-in com pelo menos 1h cada</span>
              </div>
            </div>
          </div>
          {/* Slide 1: Mensal */}
          <div style={{ display: slide === 1 ? "flex" : "none", flexDirection: "column", height: "100%", padding: "10px 12px 14px" }}>
            <div style={{ height: 280, flexShrink: 0, marginBottom: 12, position: "relative" }}>
              <img src="/premio-mensal.png" alt="Prêmio Mensal" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} onError={e => { e.target.style.display="none"; }} />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top, #0d0020, transparent)", height: 40, pointerEvents: "none" }} />
            </div>
            <div style={{ background: "#FFD70018", border: "1px solid #FFD70044", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: "#FFD700", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>🏆 Como se qualificar</div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "#C9A7FF", lineHeight: 1.6 }}>
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>📆</span>
                <span>Ter completado pelo menos <strong style={{ color: "#FFD700" }}>3 semanas elegíveis</strong> no mês</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SocialBanners() {
  const socials = [
    {
      name: "Instagram", handle: "@otailung", url: "https://www.instagram.com/otailung",
      grad: "linear-gradient(135deg, #6a11cb 0%, #c7007a 60%, #fcb045 100%)", glow: "#c7007a",
      icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="white" stroke="none"/></svg>),
    },
    {
      name: "TikTok", handle: "@otailungg", url: "https://www.tiktok.com/@otailungg",
      grad: "linear-gradient(135deg, #010101 0%, #1a1a2e 50%, #16213e 100%)", glow: "#69C9D0",
      icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.69a8.18 8.18 0 004.76 1.52V6.76a4.85 4.85 0 01-1-.07z"/></svg>),
    },
    {
      name: "YouTube", handle: "@otailungg", url: "https://www.youtube.com/@otailungg",
      grad: "linear-gradient(135deg, #1a0000 0%, #8b0000 55%, #cc0000 100%)", glow: "#FF0000",
      icon: (<svg width="20" height="20" viewBox="0 0 24 24"><path fill="white" d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 001.46 6.42 29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.4a2.78 2.78 0 001.95-1.95A29 29 0 0023 12a29 29 0 00-.46-5.58z"/><polygon fill="#cc0000" points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/></svg>),
    },
    {
      name: "Discord", handle: "Entrar no Server", url: "https://discord.gg/5mM5WyPFjr",
      grad: "linear-gradient(135deg, #1a1d2e 0%, #2c3260 55%, #5865F2 100%)", glow: "#5865F2",
      icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>),
    },
  ];
  return (
    <div className="social-grid">
      {socials.map(s => (
        <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="social-card"
          style={{ background: s.grad, border: "1px solid rgba(255,255,255,0.08)" }}
          onMouseEnter={e => { e.currentTarget.style.transform="translateY(-3px)"; e.currentTarget.style.boxShadow=`0 10px 30px ${s.glow}55`; }}
          onMouseLeave={e => { e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>{s.name}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.handle}</div>
          </div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, flexShrink: 0 }}>↗</div>
        </a>
      ))}
    </div>
  );
}

function SpinWheel({ eligible, spinSecs, onDone }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const activeRef = useRef(false);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState(null);

  const COLORS = ["#9146FF","#7B2FBE","#6D28D9","#A855F7","#5B1A99","#C084FC","#4C1A7A","#8B5CF6","#D8B4FE","#7C3AED","#3B0764","#B45FDB"];

  function drawFrame(rot, items) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const S = canvas.width;
    const cx = S / 2, cy = S / 2, r = cx - 6;
    const n = items.length;
    const arc = (2 * Math.PI) / n;
    ctx.clearRect(0, 0, S, S);
    items.forEach((item, i) => {
      const a0 = rot + i * arc, a1 = a0 + arc;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a1); ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length]; ctx.fill();
      ctx.strokeStyle = "#0E0E10"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a0 + arc / 2);
      ctx.textAlign = "right"; ctx.fillStyle = "#fff";
      ctx.font = `bold ${n > 12 ? 9 : 11}px Inter,system-ui,sans-serif`;
      ctx.shadowColor = "#00000099"; ctx.shadowBlur = 3;
      ctx.fillText((item.display_name || item.nick).slice(0, 13), r - 10, 4);
      ctx.restore();
    });
    ctx.beginPath(); ctx.arc(cx, cy, 16, 0, 2 * Math.PI);
    ctx.fillStyle = "#18181B"; ctx.fill();
    ctx.strokeStyle = "#9146FF"; ctx.lineWidth = 3; ctx.stroke();
  }

  const eligibleKey = eligible.map(v => v.twitch_id || v.nick).join(",");

  useEffect(() => {
    if (activeRef.current || !eligible.length) return;
    drawFrame(-Math.PI / 2 - (2 * Math.PI / eligible.length) / 2, eligible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleKey]);

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  function spin() {
    if (activeRef.current || !eligible.length) return;
    const n = eligible.length;
    const arc = (2 * Math.PI) / n;
    const idx = Math.floor(Math.random() * n);
    // spin forward so segment idx lands at top pointer
    // totalDelta = (numSpins+1)*2π - idx*arc brings winner to -π/2
    const numSpins = 5 + Math.floor(Math.random() * 3);
    const startRot = -Math.PI / 2 - arc / 2;
    const totalDelta = (numSpins + 1) * 2 * Math.PI - idx * arc;
    const duration = spinSecs * 1000;
    let t0 = null;

    activeRef.current = true;
    setSpinning(true);
    setWinner(null);

    function easeOut(t) { return 1 - Math.pow(1 - t, 4); }

    function frame(ts) {
      if (!t0) t0 = ts;
      const t = Math.min((ts - t0) / duration, 1);
      drawFrame(startRot + totalDelta * easeOut(t), eligible);
      if (t < 1) {
        animRef.current = requestAnimationFrame(frame);
      } else {
        activeRef.current = false;
        setSpinning(false);
        setWinner(eligible[idx]);
        onDone(eligible[idx]);
      }
    }
    animRef.current = requestAnimationFrame(frame);
  }

  if (!eligible.length) return (
    <div style={{ textAlign: "center", color: "#ADADB8", fontSize: 13, padding: "20px 0" }}>
      Nenhum viewer elegível ainda.
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{ position: "relative" }}>
        <div style={{
          position: "absolute", top: -2, left: "50%", transform: "translateX(-50%)", zIndex: 2,
          width: 0, height: 0,
          borderLeft: "10px solid transparent", borderRight: "10px solid transparent",
          borderTop: "20px solid #FFD700",
          filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))"
        }} />
        <canvas ref={canvasRef} width={280} height={280}
          style={{ display: "block", borderRadius: "50%", border: "2px solid #9146FF44" }} />
      </div>
      {winner && !spinning && (
        <div style={{ textAlign: "center" }} className="fade-up">
          <div style={{ fontSize: 10, color: "#ADADB8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>🏆 Caiu em</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#9146FF" }}>{winner.display_name || winner.nick}</div>
        </div>
      )}
      <button className="btn btn-full" onClick={spin} disabled={spinning} style={{ maxWidth: 280 }}>
        {spinning ? "🎡 Girando..." : "🎡 Girar Roleta"}
      </button>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("home");
  const [adminTab, setAdminTab] = useState("live");
  const [pass, setPass] = useState("");
  const [streamerUnlocked, setStreamerUnlocked] = useState(false);
  const [flashMsg, setFlashMsg] = useState("");
  const [flashColor, setFlashColor] = useState("#9146FF");
  const [flashTimer, setFlashTimer] = useState(null);
  const [acting, setActing] = useState(false);
  const [twitchUser, setTwitchUser] = useState(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [prizeWinnerId, setPrizeWinnerId] = useState("");
  const [prizeGiftcard, setPrizeGiftcard] = useState("");
  const [xpTarget, setXpTarget] = useState("");
  const [xpAmount, setXpAmount] = useState(500);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('20:00');
  const [redeemedCode, setRedeemedCode] = useState(null);
  const [adminPrizeCode, setAdminPrizeCode] = useState(null);
  const [streamerToken, setStreamerToken] = useState('');
  const [streamerTwitchId, setStreamerTwitchId] = useState('');
  const [streamerLogin, setStreamerLogin] = useState('');
  const [botActive, setBotActive] = useState(false);
  const botTimerRef = useRef(null);
  const nextBotMsgAtRef = useRef(null);
  const [botCountdown, setBotCountdown] = useState('');
  const [botIntervalMins, setBotIntervalMins] = useState(() => Number(localStorage.getItem('bot_interval_mins')) || 7);
  const botIntervalRef = useRef(Number(localStorage.getItem('bot_interval_mins')) || 7);
  const ircRef = useRef(null);
  const ircReconnectRef = useRef(false);
  const [spinSecs, setSpinSecs] = useState(8);
  const [ircLog, setIrcLog] = useState([]);
  const [liveTitle, setLiveTitle] = useState('');
  const [liveTestMode, setLiveTestMode] = useState(false);
  const [profileViewer, setProfileViewer] = useState(null);

  const flash = useCallback((msg, color = "#9146FF") => {
    setFlashMsg(msg); setFlashColor(color);
    clearTimeout(flashTimer);
    setFlashTimer(setTimeout(() => setFlashMsg(""), 3500));
  }, [flashTimer]);

  const fetchState = useCallback(async () => {
    try {
      const r = await fetch(API);
      const data = await r.json();
      setState(data);
    } catch { }
    setLoading(false);
  }, []);

  const act = useCallback(async (action, payload = {}) => {
    setActing(true);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      const data = await r.json();
      if (!r.ok) flash(data.error || "Erro!", "#FF4747");
      else setState(data);
      return { ok: r.ok, data };
    } catch { flash("Erro de conexão!", "#FF4747"); return { ok: false }; }
    finally { setActing(false); }
  }, [flash]);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 5000);
    return () => clearInterval(interval);
  }, [fetchState]);

  useEffect(() => {
    // Restore bot token
    const t = localStorage.getItem('bot_token');
    const id = localStorage.getItem('bot_uid');
    const login = localStorage.getItem('bot_login');
    if (t && id) { setStreamerToken(t); setStreamerTwitchId(id); }
    if (login) setStreamerLogin(login);
    // Restore admin session
    if (sessionStorage.getItem('admin_unlocked') === '1') setStreamerUnlocked(true);
    // Restore viewer Twitch session
    try {
      const u = localStorage.getItem('twitch_user');
      if (u) setTwitchUser(JSON.parse(u));
    } catch {}
    // Restore redeemed prize code
    const code = localStorage.getItem('redeemed_code');
    if (code) setRedeemedCode(code);
  }, []);

  useEffect(() => {
    if (!twitchUser || !state) return;
    const prize = state.prize;
    // Clear stale local code if prize is gone or belongs to someone else
    if ((!prize || prize.twitch_id !== twitchUser.id) && redeemedCode) {
      setRedeemedCode(null);
      localStorage.removeItem('redeemed_code');
    }
  }, [state?.prize, twitchUser?.id]);

  useEffect(() => {
    if (!botActive) { setBotCountdown(''); return; }
    const tick = () => {
      const remaining = nextBotMsgAtRef.current ? Math.max(0, nextBotMsgAtRef.current - Date.now()) : 0;
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setBotCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [botActive]);

  // Reconecta bot/IRC quando o usuário volta à aba (browser pausa setInterval em background)
  useEffect(() => {
    if (!botActive) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      // Reagenda o timer com o tempo correto restante
      clearInterval(botTimerRef.current);
      clearTimeout(botTimerRef.current);
      const now = Date.now();
      const nextAt = nextBotMsgAtRef.current ?? (now + botIntervalRef.current * 60 * 1000);
      const delay = Math.max(0, nextAt - now);
      if (delay === 0) {
        sendBotMessage();
        botTimerRef.current = setInterval(sendBotMessage, botIntervalRef.current * 60 * 1000);
      } else {
        botTimerRef.current = setTimeout(() => {
          sendBotMessage();
          botTimerRef.current = setInterval(sendBotMessage, botIntervalRef.current * 60 * 1000);
        }, delay);
      }
      // Reconecta IRC se caiu
      if (ircReconnectRef.current && (!ircRef.current || ircRef.current.readyState > 1)) {
        connectIRC(streamerToken, streamerLogin);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [botActive, streamerToken, streamerLogin]);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token")) {
      window.history.replaceState({}, "", "/");
      const params = new URLSearchParams(hash.slice(1));
      const token = params.get("access_token");
      const oauthState = params.get("state");
      if (token) {
        if (oauthState === "streamer") handleStreamerToken(token);
        else handleToken(token);
      }
    }
  }, []);

  async function handleToken(token) {
    setLoggingIn(true);
    try {
      const userRes = await fetch("https://api.twitch.tv/helix/users", {
        headers: { Authorization: `Bearer ${token}`, "Client-Id": CLIENT_ID },
      });
      const { data } = await userRes.json();
      const u = data[0];
      setTwitchUser(u);
      localStorage.setItem('twitch_user', JSON.stringify({ id: u.id, login: u.login, display_name: u.display_name }));
      setTab("viewer");
      await act("register", { twitch_id: u.id, nick: u.login, display_name: u.display_name });
      flash(`Bem-vindo, ${u.display_name}! ✅`, "#00C853");
    } catch { flash("Erro ao fazer login. Tente novamente.", "#FF4747"); }
    finally { setLoggingIn(false); }
  }

  function loginWithTwitch() {
    const p = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "token",
      scope: "user:read:email",
      state: "viewer",
    });
    window.location.href = `https://id.twitch.tv/oauth2/authorize?${p}`;
  }

  async function handleStreamerToken(token) {
    try {
      const userRes = await fetch("https://api.twitch.tv/helix/users", {
        headers: { Authorization: `Bearer ${token}`, "Client-Id": CLIENT_ID },
      });
      const { data } = await userRes.json();
      const u = data[0];
      setStreamerToken(token);
      setStreamerTwitchId(u.id);
      setStreamerLogin(u.login);
      localStorage.setItem('bot_token', token);
      localStorage.setItem('bot_uid', u.id);
      localStorage.setItem('bot_login', u.login);
      setTab("streamer");
      flash(`Bot conectado como @${u.login}! Entre com a senha para continuar.`, "#00C853");
    } catch { flash("Erro ao conectar bot Twitch.", "#FF4747"); }
  }

  function loginStreamerBot() {
    const p = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "token",
      scope: "chat:read chat:edit user:write:chat user:read:chat channel:read:subscriptions",
      state: "streamer",
    });
    window.location.href = `https://id.twitch.tv/oauth2/authorize?${p}`;
  }

  async function sendBotMessage() {
    if (!streamerToken || !streamerTwitchId) return;
    nextBotMsgAtRef.current = Date.now() + botIntervalRef.current * 60 * 1000;
    localStorage.setItem('bot_next_msg', String(nextBotMsgAtRef.current));
    try {
      // Open new credit window before sending message
      await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tick_cycle", payload: { botIntervalMins: botIntervalRef.current } }),
      });
      await fetch("/api/bot-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: streamerToken, broadcaster_id: streamerTwitchId, sender_id: streamerTwitchId }),
      });
    } catch {}
  }

  async function subscribeEventSub() {
    if (!streamerToken || !streamerTwitchId) return;
    try {
      const r = await fetch("/api/twitch-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: streamerToken, broadcaster_id: streamerTwitchId, user_id: streamerTwitchId }),
      });
      const data = await r.json();
      if (data.error) {
        flash(`Webhook erro: ${data.error}`, "#FF4747");
      } else if (!data.ok && data.errors?.length) {
        const e = data.errors[0];
        flash(`Webhook falhou (${e.type}): ${e.data?.message || e.httpStatus}`, "#FF4747");
      }
    } catch (e) {
      flash(`Erro ao registrar webhooks: ${e.message}`, "#FF4747");
    }
  }

  function addLog(type, msg) {
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setIrcLog(prev => [{ time, type, msg }, ...prev].slice(0, 50));
  }

  function connectIRC(token, login) {
    if (!token || !login) return;
    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    ws.onopen = () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send(`PASS oauth:${token}`);
      ws.send(`NICK ${login}`);
      ws.send(`JOIN #${login}`);
      addLog('info', `Conectado ao chat de #${login}`);
    };
    ws.onmessage = (event) => {
      const lines = event.data.split('\r\n').filter(Boolean);
      for (const line of lines) {
        if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); continue; }

        // Log auth errors and notices from Twitch
        if (line.includes('NOTICE') || line.includes('ERROR') || line.includes('Login authentication failed')) {
          addLog('err', line.replace(/^@[^ ]+ /, '').slice(0, 120));
          if (line.includes('Login unsuccessful') || line.includes('Login authentication failed')) {
            ircReconnectRef.current = false;
            ws.close();
            addLog('err', '⚠ Token inválido — clique em Desconectar e reconecte o bot Twitch.');
          }
        }

        if (line.includes('PRIVMSG')) {
          const displayName = line.match(/display-name=([^;]+)/)?.[1] || '?';
          const msgText = line.split('PRIVMSG')[1]?.split(':').slice(1).join(':').trim();
          const lower = msgText?.toLowerCase() || '';

          if (lower.includes('#tailung')) {
            const m = line.match(/user-id=(\d+)/);
            addLog('tailung', `${displayName}: "${msgText}"`);
            if (m) {
              fetch('/api/chat-credit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ viewer_id: m[1] }),
              }).then(r => r.json()).then(d => {
                if (d.ok) addLog('ok', `+15min para ${displayName}`);
                else addLog('skip', `${displayName} ignorado: ${d.reason}`);
              }).catch(() => addLog('err', `Erro ao creditar ${displayName}`));
            }
          }
        }

        if (line.includes('USERNOTICE')) {
          const msgId = line.match(/msg-id=([^;]+)/)?.[1];
          if (msgId === 'sub' || msgId === 'resub') {
            const userId = line.match(/user-id=(\d+)/)?.[1];
            const displayName = line.match(/display-name=([^;]+)/)?.[1] || userId;
            addLog('sub', `${displayName} sub/resub detectado`);
            if (userId) {
              fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'set_sub', payload: { twitch_id: userId } }),
              }).catch(() => {});
            }
          }
        }
      }
    };
    ws.onclose = () => {
      ircRef.current = null;
      addLog('info', 'IRC desconectado' + (ircReconnectRef.current ? ' — reconectando em 5s...' : ''));
      if (ircReconnectRef.current) setTimeout(() => connectIRC(token, login), 5000);
    };
    ws.onerror = () => addLog('err', 'Erro na conexão IRC');
    ircRef.current = ws;
  }

  function startBot() {
    nextBotMsgAtRef.current = Date.now() + botIntervalRef.current * 60 * 1000;
    localStorage.setItem('bot_next_msg', String(nextBotMsgAtRef.current));
    localStorage.setItem('bot_active', '1');
    botTimerRef.current = setInterval(sendBotMessage, botIntervalRef.current * 60 * 1000);
    setBotActive(true);
    ircReconnectRef.current = true;
    connectIRC(streamerToken, streamerLogin);
    flash(`Bot iniciado! Primeira mensagem em ${botIntervalRef.current} minutos. 🤖`, "#00C853");
  }

  function stopBot() {
    clearInterval(botTimerRef.current);
    clearTimeout(botTimerRef.current);
    botTimerRef.current = null;
    localStorage.removeItem('bot_active');
    localStorage.removeItem('bot_next_msg');
    setBotActive(false);
    ircReconnectRef.current = false;
    if (ircRef.current) { ircRef.current.close(); ircRef.current = null; }
  }

  function disconnectBot() {
    stopBot();
    setStreamerTwitchId('');
    setStreamerToken('');
    setStreamerLogin('');
    setWebhookSubs(null);
    localStorage.removeItem('bot_token');
    localStorage.removeItem('bot_uid');
    localStorage.removeItem('bot_login');
  }


  async function doCheckin() {
    if (!twitchUser) return flash("Faça login com Twitch primeiro!", "#FF4747");
    const res = await act("checkin", { twitch_id: twitchUser.id });
    if (res.ok) flash("Check-in feito! ✅", "#00C853");
  }

  async function toggleLive() {
    if (!state.liveActive) {
      const res = await act("open_live", { liveTitle: liveTitle.trim(), testMode: liveTestMode });
      if (res.ok) flash(liveTestMode ? "Live de teste aberta (sem Discord) ✅" : "Live aberta! ✅", "#00C853");
    } else {
      const res = await act("close_live");
      if (res.ok) flash("Live encerrada.");
    }
  }

  async function addTime(twitch_id, minutes) {
    await act("add_time", { twitch_id, minutes });
  }

  async function drawWinner() {
    const res = await act("draw");
    if (res.ok) flash(`🎉 Vencedor: ${res.data.winner?.display_name || res.data.winner?.nick}!`);
  }

  async function drawSpecific(twitch_id) {
    const res = await act("draw_specific", { twitch_id });
    if (res.ok) flash(`🏆 ${res.data.winner?.display_name || res.data.winner?.nick} é o vencedor!`);
  }

  async function endCycle() {
    if (!window.confirm("Encerrar ciclo semanal? Isso vai salvar o histórico e resetar os pontos de todos os viewers.")) return;
    const res = await act("end_cycle");
    if (res.ok) { flash("Ciclo encerrado! Histórico salvo. ✅", "#00C853"); setAdminTab("historico"); }
  }

  function unlockStreamer() {
    if (pass === PASS) { setStreamerUnlocked(true); sessionStorage.setItem('admin_unlocked', '1'); setPass(""); }
    else flash("Senha incorreta.", "#FF4747");
  }

  async function fetchPrizeCode() {
    setActing(true);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_prize_code", payload: {} }),
      });
      const data = await r.json();
      if (r.ok) setAdminPrizeCode(data.giftcard);
      else flash(data.error || "Erro!", "#FF4747");
    } catch { flash("Erro de conexão!", "#FF4747"); }
    finally { setActing(false); }
  }

  async function savePrize() {
    const winner = vList.find(v => v.twitch_id === prizeWinnerId);
    if (!prizeWinnerId || !prizeGiftcard.trim()) return flash("Preencha o vencedor e o código.", "#FF4747");
    const res = await act("set_prize", { twitch_id: prizeWinnerId, display_name: winner?.display_name || winner?.nick || prizeWinnerId, giftcard: prizeGiftcard.trim() });
    if (res.ok) { flash("Prêmio salvo! ✅", "#00C853"); setPrizeGiftcard(""); }
  }

  async function redeemPrize() {
    if (!twitchUser) return;
    setActing(true);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "redeem_prize", payload: { twitch_id: twitchUser.id } }),
      });
      const data = await r.json();
      if (!r.ok) flash(data.error || "Erro!", "#FF4747");
      else { setRedeemedCode(data.giftcard); localStorage.setItem('redeemed_code', data.giftcard); flash("Prêmio resgatado! 🎉", "#00C853"); }
    } catch { flash("Erro de conexão!", "#FF4747"); }
    finally { setActing(false); }
  }

  async function resetAll() {
    if (!window.confirm("Zerar TUDO incluindo histórico? Não tem como desfazer.")) return;
    const res = await act("reset");
    if (res.ok) flash("Sistema zerado.");
  }

  if (loading || loggingIn) return (
    <div className="splash">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="#9146FF"><path d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28H17v4.28h-1.43M7 2L3.43 5.57v12.86h4.28V22l3.58-3.57h2.85L20.57 12V2m-1.43 9.29l-2.85 2.85h-2.86l-2.5 2.5v-2.5H7.71V3.43z"/></svg>
      <span>{loggingIn ? "Conectando com Twitch..." : "Carregando..."}</span>
    </div>
  );

  const vList = state ? Object.values(state.viewers).sort((a, b) => {
    const ma = monthlyEligibleCycles(a), mb = monthlyEligibleCycles(b);
    if (mb !== ma) return mb - ma;
    const sa = calcStars(a.sessions), sb = calcStars(b.sessions);
    if (sb !== sa) return sb - sa;
    const xa = calcXP(a), xb = calcXP(b);
    if (xb !== xa) return xb - xa;
    const minA = calcMins(a.sessions), minB = calcMins(b.sessions);
    if (minB !== minA) return minB - minA;
    return Number(a.twitch_id) - Number(b.twitch_id);
  }) : [];
  const eligCount = vList.filter(isEligible).length;
  const myViewer = twitchUser ? state?.viewers?.[twitchUser.id] : null;
  const history = state?.cycleHistory || [];

  const filteredHistory = historyFilter === "all" ? history : history.filter(c => {
    const d = c.endDate || "";
    if (historyFilter === "month") return d.slice(0, 7) === new Date().toISOString().slice(0, 7);
    if (historyFilter === "year") return d.slice(0, 4) === new Date().toISOString().slice(0, 4);
    return true;
  });

  const cumulativeStats = filteredHistory.reduce((acc, c) => ({
    lives: acc.lives + (c.stats?.totalLives || 0),
    minutes: acc.minutes + (c.stats?.totalMinutes || 0),
    viewers: Math.max(acc.viewers, c.stats?.totalViewers || 0),
    cycles: acc.cycles + 1,
  }), { lives: 0, minutes: 0, viewers: 0, cycles: 0 });

  return (
    <div className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0E0E10; overscroll-behavior: none; }
        .app { min-height: 100dvh; background: #0E0E10; color: #EFEFF1; font-family: 'Inter', system-ui, sans-serif; font-size: 14px; }
        .splash { min-height: 100dvh; background: #0E0E10; display: flex; align-items: center; justify-content: center; color: #9146FF; gap: 12px; font-size: 16px; font-family: system-ui; }
        .navbar { background: #18181B; position: sticky; top: 0; z-index: 100; box-shadow: 0 1px 0 #9146FF33, 0 4px 40px rgba(145,70,255,0.10); }
        .navbar-top { display: flex; align-items: center; padding: 0 16px; height: 58px; gap: 12px; }
        .logo-badge { width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; filter: drop-shadow(0 0 10px #9146FF77); }
        .logo-text { line-height: 1; }
        .logo-name { font-family: 'Orbitron', sans-serif; font-weight: 900; font-size: 13px; background: linear-gradient(135deg, #C9A7FF 0%, #9146FF 60%, #BF94FF 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: .5px; }
        .logo-sub { font-size: 9px; color: #9146FF; letter-spacing: 1.8px; text-transform: uppercase; font-weight: 700; margin-top: 2px; }
        .navbar-nav { display: none; }
        .nav-item { position: relative; padding: 7px 15px; border-radius: 8px; font-size: 13px; font-weight: 600; color: #ADADB8; background: none; border: 1px solid transparent; cursor: pointer; transition: color .2s, border-color .2s, background .2s, box-shadow .2s; white-space: nowrap; letter-spacing: .3px; }
        .nav-item:hover { color: #EFEFF1; border-color: #9146FF44; background: #9146FF0D; }
        .nav-item.active { color: #BF94FF; background: #9146FF1A; border-color: #9146FF55; box-shadow: 0 0 0 1px #9146FF22, 0 2px 14px #9146FF33; }
        .live-pill { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; padding: 5px 11px; border-radius: 20px; border: 1px solid; white-space: nowrap; }
        .navbar-tabs { display: flex; overflow-x: auto; scrollbar-width: none; border-top: 1px solid #26262C; }
        .navbar-tabs::-webkit-scrollbar { display: none; }
        .nav-tab { flex: 1; min-width: 72px; padding: 11px 8px; font-size: 12px; font-weight: 700; color: #ADADB8; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap; transition: color .2s, border-color .2s, text-shadow .2s; letter-spacing: .3px; }
        .nav-tab.active { color: #9146FF; border-bottom-color: #9146FF; text-shadow: 0 0 12px #9146FF88; }
        @media (min-width: 768px) {
          .navbar-top { padding: 0 32px; height: 64px; max-width: 1400px; margin: 0 auto; }
          .navbar-nav { display: flex; align-items: center; gap: 6px; margin-left: 28px; flex: 1; }
          .navbar-tabs { display: none; }
          .navbar > .navbar-top { max-width: unset; }
        }
        /* Page layout — single col mobile, main+sidebar desktop */
        .page-layout { display: grid; grid-template-columns: 1fr; max-width: 1400px; margin: 0 auto; }
        .body { padding: 14px; padding-bottom: 32px; min-width: 0; }
        .sidebar { display: none; }
        @media (min-width: 1100px) {
          .page-layout { grid-template-columns: 1fr 300px; align-items: start; padding: 0 32px; }
          .body { padding: 24px 20px 48px 0; }
          .sidebar { display: flex; flex-direction: column; gap: 12px; padding: 24px 0 48px 4px; position: sticky; top: 72px; align-self: start; }
        }
        .card { background: #18181B; border: 1px solid #26262C; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
        .card-title { font-weight: 700; font-size: 15px; margin-bottom: 14px; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .stat-box { background: #26262C; border-radius: 10px; padding: 12px 8px; text-align: center; }
        .stat-val { font-size: 24px; font-weight: 800; line-height: 1.1; }
        .stat-lbl { font-size: 10px; color: #ADADB8; margin-top: 3px; letter-spacing: .5px; text-transform: uppercase; font-weight: 600; }
        .inp { background: #26262C; border: 1.5px solid #3D3D47; border-radius: 10px; padding: 11px 14px; color: #EFEFF1; font-size: 14px; width: 100%; outline: none; transition: border-color .15s; -webkit-appearance: none; }
        .inp:focus { border-color: #9146FF; }
        .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #9146FF; color: #fff; border: none; border-radius: 10px; padding: 11px 18px; font-weight: 700; cursor: pointer; font-size: 14px; transition: opacity .15s, transform .1s; -webkit-appearance: none; }
        .btn:active { transform: scale(.97); }
        .btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }
        .btn-green { background: #00C853; }
        .btn-red { background: #FF4747; }
        .btn-ghost { background: transparent; color: #ADADB8; border: 1.5px solid #3D3D47; border-radius: 10px; padding: 11px 16px; font-weight: 600; cursor: pointer; font-size: 13px; }
        .btn-full { width: 100%; }
        .row { display: flex; gap: 8px; align-items: center; }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .badge-ok { background: #00C85320; color: #00C853; }
        .badge-pend { background: #9146FF20; color: #9146FF; }
        .prog-wrap { background: #26262C; border-radius: 20px; height: 6px; overflow: hidden; margin: 5px 0; }
        .prog-bar { height: 100%; border-radius: 20px; transition: width .4s; }
        .divider { height: 1px; background: #26262C; margin: 14px 0; }
        .label { font-size: 11px; color: #ADADB8; font-weight: 700; text-transform: uppercase; letter-spacing: .7px; margin-bottom: 6px; display: block; }
        .live-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .winner-box { background: #9146FF18; border: 2px solid #9146FF; border-radius: 14px; padding: 22px; text-align: center; margin-bottom: 12px; }
        .admin-tabs { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
        .admin-tab { padding: 7px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; cursor: pointer; border: none; }
        .admin-tab.active { background: #9146FF; color: #fff; }
        .admin-tab:not(.active) { background: #26262C; color: #ADADB8; }
        .history-item { border-bottom: 1px solid #26262C22; padding: 12px 0; }
        .history-item:last-child { border-bottom: none; }
        .hist-filter { display: flex; gap: 6px; margin-bottom: 12px; }
        .hist-filter button { padding: 5px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; cursor: pointer; border: none; }
        .viewer-row { border-bottom: 1px solid #26262C15; padding: 10px 0; display: flex; align-items: center; gap: 8px; font-size: 12px; }
        .viewer-row:last-child { border-bottom: none; }
        .step-num { width: 24px; height: 24px; border-radius: 50%; background: #9146FF; color: #fff; font-weight: 700; font-size: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .fade-up { animation: fadeUp .25s ease; }
        @media (max-width: 400px) {
          .grid3 { grid-template-columns: 1fr 1fr; }
          .stat-val { font-size: 20px; }
        }
        @media (min-width: 768px) {
          .prize-img { max-height: 480px; object-fit: contain; background: #1a0533; }
        }
        /* Home layout */
        .home-live-row { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; height: auto; }
        .home-player-col { flex: 1; }
        .home-chat-col { height: 260px; }
        @media (min-width: 768px) {
          .home-live-row { flex-direction: row; height: 300px; }
          .home-player-col { flex: 3; }
          .home-chat-col { flex: 2; height: auto; }
        }
        /* Social banners */
        .social-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
        @media (min-width: 640px) { .social-grid { grid-template-columns: repeat(4, 1fr); } }
        .social-card { text-decoration: none; display: flex; align-items: center; gap: 10px; border-radius: 14px; padding: 13px 12px; transition: transform .15s, box-shadow .15s; }
        /* Level XP bar */
        @keyframes lvGlow { 0%,100%{opacity:.7} 50%{opacity:1} }
        .lv-bar-fill { animation: lvGlow 2.5s ease-in-out infinite; }
        @keyframes eloFramePulse { 0%,100%{box-shadow:0 0 0 1px var(--ef-c,#fff3) ,0 0 10px var(--ef-c,#fff4)} 50%{box-shadow:0 0 0 2px var(--ef-c,#fff5),0 0 20px var(--ef-c,#fff6)} }
      `}</style>

      {/* Navbar */}
      <div className="navbar">
        <div className="navbar-top">
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div className="logo-badge">
              <img src="/logo.png" alt="Tailung" style={{ width: 42, height: 42, objectFit: "contain", display: "block" }} />
            </div>
            <div className="logo-text">
              <div className="logo-name">Area do Tailung</div>
            </div>
          </div>

          {/* Nav inline — desktop only */}
          <nav className="navbar-nav">
            {[["home","Início"],["viewer","Participar"],["ranking","Ranking"],["cronograma","Cronograma"],["streamer","Streamer"]].map(([id,label]) => (
              <button key={id} className={`nav-item${tab===id?" active":""}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>

          {/* Right side */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {twitchUser && (
              <div style={{ fontSize: 12, fontWeight: 700, color: "#9146FF", background: "#9146FF15", padding: "5px 10px", borderRadius: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#9146FF"><path d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28H17v4.28h-1.43M7 2L3.43 5.57v12.86h4.28V22l3.58-3.57h2.85L20.57 12V2m-1.43 9.29l-2.85 2.85h-2.86l-2.5 2.5v-2.5H7.71V3.43z"/></svg>
                {twitchUser.display_name || twitchUser.login}
              </div>
            )}
            <div className="live-pill" style={{ color: state?.liveActive ? "#FF4747" : "#ADADB8", borderColor: state?.liveActive ? "#FF474744" : "#3D3D47", background: state?.liveActive ? "#FF474712" : "#26262C" }}>
              <div className="live-dot" style={{ background: state?.liveActive ? "#FF4747" : "#3D3D47", animation: state?.liveActive ? "pulse 1.5s infinite" : "none" }} />
              {state?.liveActive ? "AO VIVO" : "OFFLINE"}
            </div>
          </div>
        </div>

        {/* Tabs row — mobile only */}
        <div className="navbar-tabs">
          {[["home","Início"],["viewer","Participar"],["ranking","Ranking"],["cronograma","Cronograma"],["streamer","Streamer"]].map(([id,label]) => (
            <button key={id} className={`nav-tab${tab===id?" active":""}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="page-layout">
      <div className="body">

        {/* HOME */}
        {tab === "home" && <div className="fade-up">

          {/* Prize Carousel — largura total, altura fixa */}
          <div style={{ marginBottom: 12 }}>
            <PrizeCarousel eligCount={eligCount} vList={vList} />
          </div>

          {/* Live + Chat — numa row */}
          <div className="home-live-row">
            {/* Player */}
            <div className="home-player-col">
              <div style={{ background: "#18181B", border: `1px solid ${state?.liveActive ? "#FF474744" : "#26262C"}`, borderRadius: 12, overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
                <div style={{ background: "linear-gradient(135deg, #18181B, #26262C)", padding: "8px 12px", borderBottom: "1px solid #26262C", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="#9146FF"><path d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28H17v4.28h-1.43M7 2L3.43 5.57v12.86h4.28V22l3.58-3.57h2.85L20.57 12V2m-1.43 9.29l-2.85 2.85h-2.86l-2.5 2.5v-2.5H7.71V3.43z"/></svg>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#EFEFF1" }}>{CHANNEL}</span>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: state?.liveActive ? "#FF4747" : "#ADADB8" }}>
                    <div className="live-dot" style={{ background: state?.liveActive ? "#FF4747" : "#3D3D47", animation: state?.liveActive ? "pulse 1.5s infinite" : "none" }} />
                    {state?.liveActive ? "AO VIVO" : "OFFLINE"}
                  </div>
                </div>
                <div style={{ flex: 1, position: "relative", background: "#0E0E10" }}>
                  <iframe
                    src={`https://player.twitch.tv/?channel=${CHANNEL}&parent=area-tailung.vercel.app&autoplay=false&muted=false`}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                    allowFullScreen
                    title="oTaiLungg Live"
                  />
                </div>
                {/* Footer: participar ou próxima live */}
                {state?.liveActive ? (
                  <div style={{ padding: "8px 12px", fontSize: 11, color: "#ADADB8", borderTop: "1px solid #26262C", flexShrink: 0 }}>
                    🔴 Live rolando! <strong style={{ color: "#9146FF", cursor: "pointer" }} onClick={() => setTab("viewer")}>Participar →</strong>
                  </div>
                ) : (() => {
                  const next = (state?.schedule || []).filter(e => new Date(`${e.date}T${e.time}`) > new Date()).sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time))[0];
                  if (!next) return null;
                  const dt = new Date(`${next.date}T${next.time}`);
                  return (
                    <div style={{ padding: "8px 12px", borderTop: "1px solid #26262C", flexShrink: 0, cursor: "pointer" }} onClick={() => setTab("cronograma")}>
                      <div style={{ fontSize: 9, color: "#ADADB8", marginBottom: 2, textTransform: "uppercase", letterSpacing: .6, fontWeight: 700 }}>📅 Próxima live</div>
                      <div style={{ fontWeight: 800, fontSize: 12, color: "#EFEFF1" }}>{next.title}</div>
                      <div style={{ fontSize: 10, color: "#9146FF" }}>{dt.toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'})} · {next.time}</div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Chat */}
            <div className="home-chat-col">
              <div style={{ background: "#18181B", border: "1px solid #26262C", borderRadius: 12, overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "8px 12px", borderBottom: "1px solid #26262C", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, background: "linear-gradient(135deg,#18181B,#26262C)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9146FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#EFEFF1" }}>Chat</span>
                </div>
                <iframe
                  src={`https://www.twitch.tv/embed/${CHANNEL}/chat?parent=area-tailung.vercel.app&darkpopout`}
                  style={{ flex: 1, border: "none", width: "100%", height: "100%" }}
                  title="Chat oTaiLungg"
                />
              </div>
            </div>
          </div>

          {/* Redes Sociais */}
          <SocialBanners />

          <div className="card">
            <div className="card-title">Como participar</div>
            {["Entre na aba Participar e conecte sua conta Twitch","Faça check-in em cada live que você assistir","Fique elegível: acumule 11h no total na semana OU apareça em 4 lives com pelo menos 1h em cada"].map((txt, i) => (
              <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
                <div className="step-num">{i+1}</div>
                <div style={{ fontSize: 13, color: "#ADADB8", lineHeight: 1.6, paddingTop: 2 }}>{txt}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="card" style={{ background: "#9146FF10", borderColor: "#9146FF33", marginBottom: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9146FF", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>🎁 Sorteio Semanal</div>
              <div style={{ fontSize: 12, color: "#C9A7FF", lineHeight: 1.7 }}>
                Para ser elegível você precisa cumprir <strong>uma</strong> das condições abaixo:<br />
                <span style={{ paddingLeft: 8, display: "block", marginTop: 4 }}>✅ <strong>11 horas de live</strong> acumuladas no total na semana</span>
                <span style={{ paddingLeft: 8, display: "block", marginTop: 2 }}>✅ <strong>4 dias de check-in</strong> com no mínimo 1h em cada dia (incluindo o dia do sorteio)</span>
              </div>
            </div>
            <div className="card" style={{ background: "#FFD70010", borderColor: "#FFD70033", marginBottom: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#FFD700", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>🏅 Sorteio Mensal</div>
              <div style={{ fontSize: 12, color: "#C9A7FF", lineHeight: 1.7 }}>
                Para se qualificar ao prêmio mensal:<br />
                <span style={{ paddingLeft: 8, display: "block", marginTop: 4 }}>✅ Ter completado pelo menos <strong>3 semanas elegíveis</strong> no mês</span>
              </div>
            </div>
          </div>

        </div>}

        {/* VIEWER */}
        {tab === "viewer" && <div className="fade-up">
          {/* Prize redemption banner */}
          {twitchUser && state?.prize?.twitch_id === twitchUser.id && (!state.prize.redeemed || redeemedCode) && (
            <div style={{ background: "#9146FF18", border: "2px solid #9146FF", borderRadius: 12, padding: "16px", marginBottom: 12, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🎁</div>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Você ganhou um prêmio!</div>
              {(redeemedCode && state.prize.redeemed) ? (
                <div>
                  <div style={{ fontSize: 12, color: "#ADADB8", marginBottom: 10 }}>Seu código gift card:</div>
                  <div style={{ background: "#26262C", borderRadius: 8, padding: "12px 16px", fontSize: 18, fontWeight: 800, color: "#9146FF", letterSpacing: 2, wordBreak: "break-all", marginBottom: 10 }}>{redeemedCode}</div>
                  <button className="btn btn-full" style={{ background: "#26262C", color: "#9146FF", border: "1.5px solid #9146FF55", marginBottom: 8 }} onClick={() => navigator.clipboard.writeText(redeemedCode).then(() => flash("Código copiado! ✓", "#00C853"))}>
                    📋 Copiar código
                  </button>
                  <div style={{ fontSize: 11, color: "#ADADB8" }}>Código salvo neste dispositivo. Copie e guarde em local seguro!</div>
                </div>
              ) : state.prize.enabled ? (
                <div>
                  <div style={{ fontSize: 12, color: "#ADADB8", marginBottom: 14 }}>Seu prêmio está disponível para resgate!</div>
                  <button className="btn btn-full" style={{ background: "#9146FF", fontSize: 15, padding: "13px 20px" }} onClick={redeemPrize} disabled={acting}>🎁 Resgatar Prêmio</button>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#ADADB8" }}>Aguarde o streamer habilitar o resgate...</div>
              )}
            </div>
          )}
          {!twitchUser ? (
            <div className="card" style={{ textAlign: "center", padding: "44px 20px" }}>
              <svg width="52" height="52" viewBox="0 0 24 24" fill="#9146FF" style={{ marginBottom: 18 }}><path d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28H17v4.28h-1.43M7 2L3.43 5.57v12.86h4.28V22l3.58-3.57h2.85L20.57 12V2m-1.43 9.29l-2.85 2.85h-2.86l-2.5 2.5v-2.5H7.71V3.43z"/></svg>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>Conecte sua Twitch</div>
              <div style={{ color: "#ADADB8", fontSize: 13, marginBottom: 28, lineHeight: 1.7 }}>
                Login obrigatório para garantir que<br/>cada pessoa participe apenas uma vez.
              </div>
              <button className="btn btn-full" style={{ fontSize: 15, padding: "14px 20px", maxWidth: 280, margin: "0 auto" }} onClick={loginWithTwitch}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28H17v4.28h-1.43M7 2L3.43 5.57v12.86h4.28V22l3.58-3.57h2.85L20.57 12V2m-1.43 9.29l-2.85 2.85h-2.86l-2.5 2.5v-2.5H7.71V3.43z"/></svg>
                Entrar com Twitch
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 12 }}>
                {/* Card nick + check-in */}
                <div className="card" style={{ marginBottom: 0 }}>
                  <div className="row" style={{ marginBottom: 16 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#9146FF22", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#9146FF", fontSize: 20, flexShrink: 0, ...eloFrameStyle(myViewer ? calcXP(myViewer) : 0) }}>{twitchUser.display_name[0].toUpperCase()}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{twitchUser.display_name}</div>
                      <div style={{ fontSize: 11, color: "#00C853", marginTop: 1 }}>✓ Twitch verificado · @{twitchUser.login}</div>
                    </div>
                    <button className="btn-ghost" style={{ padding: "7px 12px", fontSize: 12 }} onClick={() => { setTwitchUser(null); localStorage.removeItem('twitch_user'); }}>Sair</button>
                  </div>
                  <div className="divider" />
                  <span className="label">check-in na live de hoje</span>
                  <div style={{ fontSize: 12, color: state?.liveActive ? "#00C853" : "#ADADB8", marginBottom: 12, fontWeight: 600 }}>
                    {state?.liveActive ? "● Live ativa agora!" : "○ Nenhuma live ativa no momento"}
                  </div>
                  <button
                    className={`btn btn-full${myViewer?.checkedInToday ? "" : " btn-green"}`}
                    style={myViewer?.checkedInToday ? { background: "#26262C", color: "#ADADB8", cursor: "default" } : {}}
                    onClick={doCheckin}
                    disabled={acting || !state?.liveActive || myViewer?.checkedInToday}
                  >
                    {myViewer?.checkedInToday ? "✓ Check-in feito hoje" : "Fazer Check-in"}
                  </button>
                </div>

                {/* Card ELO */}
                {ELO_ENABLED ? (() => {
                  const eloXp = myViewer ? calcXP(myViewer) : 0;
                  const eloIdx = getElo(eloXp);
                  const elo = ELO_RANKS[eloIdx];
                  const nextElo = ELO_RANKS[eloIdx + 1];
                  const progress = nextElo ? Math.min(100, Math.round(((eloXp - elo.xpMin) / (nextElo.xpMin - elo.xpMin)) * 100)) : 100;
                  return (
                    <div className="card" style={{ marginBottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "28px 20px", background: elo.bg, borderColor: `${elo.color}33` }}>
                      <EloBadge xp={eloXp} size={88}/>
                      <div style={{ fontWeight: 900, fontSize: 17, color: elo.color, letterSpacing: .8, marginTop: 12, marginBottom: 2 }}>{elo.name}</div>
                      <div style={{ fontSize: 11, color: "#ADADB8", marginBottom: 10 }}>{eloXp.toLocaleString()} XP</div>
                      {nextElo && (
                        <div style={{ width: "100%", maxWidth: 140 }}>
                          <div style={{ height: 4, borderRadius: 4, background: "#ffffff15", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${progress}%`, background: elo.color, borderRadius: 4, transition: "width .4s" }}/>
                          </div>
                          <div style={{ fontSize: 10, color: "#ADADB8", marginTop: 4 }}>{progress}% → {nextElo.name}</div>
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <div className="card" style={{ marginBottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "28px 20px" }}>
                    <svg width="88" height="100" viewBox="0 0 88 100" fill="none">
                      <path d="M44 4L80 20V52C80 72 64 86 44 96C24 86 8 72 8 52V20L44 4Z" fill="#1a1a1e" stroke="#3D3D4788" strokeWidth="2"/>
                      <path d="M44 14L72 27V52C72 68 59 80 44 88C29 80 16 68 16 52V27L44 14Z" fill="#26262C" stroke="#3D3D4744" strokeWidth="1.5"/>
                      <text x="44" y="60" textAnchor="middle" fill="#3D3D47" fontSize="32" fontWeight="900" fontFamily="Inter,system-ui,sans-serif">?</text>
                    </svg>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#ADADB8", letterSpacing: .5, marginTop: 14, marginBottom: 4 }}>ELO</div>
                    <div style={{ fontSize: 11, color: "#3D3D47", marginBottom: 12 }}>Sistema em desenvolvimento</div>
                    <span style={{ background: "#9146FF15", border: "1px solid #9146FF44", borderRadius: 20, padding: "4px 14px", fontSize: 11, color: "#9146FF", fontWeight: 700 }}>Em breve</span>
                  </div>
                )}
              </div>
              {myViewer && <ViewerCard v={myViewer} vList={vList} />}
            </>
          )}

          {/* Sistema de Niveis e ELO */}
          <div className="card" style={{ marginTop: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#EFEFF1", marginBottom: 18, letterSpacing: .3 }}>XP & ELO</div>

            {/* Como ganhar XP */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#FFD700" stroke="#FFD700" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <span style={{ fontWeight: 700, fontSize: 13, color: "#EFEFF1" }}>Como ganhar XP</span>
              </div>
              <div style={{ fontSize: 12, color: "#ADADB8", lineHeight: 1.7, marginBottom: 12 }}>
                Acumule XP assistindo as lives do Tailung. Quanto mais você participar, mais alto sobe no ELO.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  [<svg key="c" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9146FF" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, "Minutos assistidos", "+XP por hora"],
                  [<svg key="k" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00C853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>, "Check-in feito", "+XP por presença"],
                  [<svg key="s" width="16" height="16" viewBox="0 0 24 24" fill="#FFD700" stroke="#FFD700" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, "Dia qualificado (≥1h)", "Bônus de XP"],
                  [<svg key="t" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>, "Ganhar sorteio", "XP extra"],
                ].map(([icon, lbl, val], i) => (
                  <div key={i} style={{ background: "#26262C", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                    {icon}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#EFEFF1" }}>{lbl}</div>
                      <div style={{ fontSize: 10, color: "#9146FF" }}>{val}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="divider" />

            {/* ELO */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00BFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span style={{ fontWeight: 700, fontSize: 13, color: "#EFEFF1" }}>Sistema de ELO</span>
                {!ELO_ENABLED && <span style={{ background: "#9146FF15", border: "1px solid #9146FF44", borderRadius: 20, padding: "2px 10px", fontSize: 10, color: "#9146FF", fontWeight: 700 }}>Em breve</span>}
              </div>
              {ELO_ENABLED ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {ELO_RANKS.map((elo, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: `${elo.color}08`, border: `1px solid ${elo.color}22` }}>
                      <EloBadge xp={elo.xpMin} size={32}/>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: elo.color }}>{elo.name}</span>
                      </div>
                      <span style={{ fontSize: 11, color: "#ADADB8", fontFamily: "'Orbitron',sans-serif" }}>{elo.xpMin.toLocaleString()} XP</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#ADADB8", lineHeight: 1.7 }}>
                  Sistema de elos em desenvolvimento. Em breve você poderá visualizar seu rank e competir com outros espectadores.
                </div>
              )}
            </div>

            <div className="divider" />

            {/* Recompensas */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFD700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
                <span style={{ fontWeight: 700, fontSize: 13, color: "#EFEFF1" }}>Recompensas por Nível</span>
                <span style={{ background: "#FFD70015", border: "1px solid #FFD70044", borderRadius: 20, padding: "2px 10px", fontSize: 10, color: "#FFD700", fontWeight: 700 }}>Em breve</span>
              </div>
              <div style={{ fontSize: 12, color: "#ADADB8", lineHeight: 1.7 }}>
                Conforme você sobe de nível e ELO, irá desbloquear <strong style={{ color: "#FFD700" }}>recompensas exclusivas</strong> da comunidade do Tailung. Quanto maior o nível, melhores as recompensas!
              </div>
            </div>
          </div>
        </div>}

        {/* RANKING */}
        {tab === "ranking" && <div className="fade-up">
          {/* Header do mês */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18, color: "#EFEFF1" }}>Ranking Mensal</div>
              <div style={{ fontSize: 12, color: "#ADADB8", marginTop: 2 }}>{monthLabel(new Date().toISOString().slice(0,10))} · reseta todo mês</div>
            </div>
            <div style={{ background: "#9146FF18", border: "1px solid #9146FF33", borderRadius: 10, padding: "6px 12px", fontSize: 11, color: "#C9A7FF", textAlign: "right" }}>
              <div style={{ fontWeight: 700 }}>{eligCount} elegíveis</div>
              <div style={{ color: "#ADADB8" }}>esta semana</div>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {!vList.length && <div style={{ color: "#ADADB8", textAlign: "center", padding: "30px 0", fontSize: 13 }}>Nenhum participante ainda.</div>}
            {vList.map((v, i) => {
              const ok = isEligible(v);
              const qDays = calcStars(v.sessions);
              const monthlyOk = isMonthlyEligible(v);
              const monthCycles = monthlyEligibleCycles(v);
              const medals = ["🥇","🥈","🥉"];
              const rowBg = i % 2 === 0 ? "transparent" : "#26262C18";
              return (
                <div key={v.twitch_id || v.nick}
                  style={{ display: "flex", gap: 10, padding: "12px 16px", background: rowBg, borderBottom: i < vList.length-1 ? "1px solid #26262C22" : "none", alignItems: "center", cursor: "pointer", transition: "background .15s" }}
                  onMouseEnter={e => e.currentTarget.style.background="#9146FF0A"}
                  onMouseLeave={e => e.currentTarget.style.background=rowBg}
                  onClick={() => setProfileViewer(v)}>
                  {/* Posição */}
                  <div style={{ width: 28, textAlign: "center", fontWeight: 800, color: i < 3 ? ["#FFD700","#C0C0C0","#CD7F32"][i] : "#ADADB8", fontSize: i < 3 ? 18 : 13, flexShrink: 0 }}>{i < 3 ? medals[i] : `#${i+1}`}</div>
                  {/* ELO badge */}
                  {ELO_ENABLED && (
                    <div style={{ flexShrink: 0 }} title={ELO_RANKS[getElo(calcXP(v))].name}>
                      <EloBadge xp={calcXP(v)} size={36}/>
                    </div>
                  )}
                  {/* Info principal */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.display_name || v.nick}</span>
                      {v.hasSub && <span style={{ background: "#FF69B415", color: "#FF69B4", borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>⭐ sub</span>}
                    </div>
                    {/* Estrelas da semana */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                      <div style={{ display: "flex", gap: 2 }}>
                        {Array.from({length: MIN_DAYS}, (_, idx) => (
                          <span key={idx} style={{ fontSize: 13, color: idx < qDays ? "#FFD700" : "#3D3D47", filter: idx < qDays ? "drop-shadow(0 0 3px #FFD70066)" : "none" }}>★</span>
                        ))}
                      </div>
                      <span style={{ fontSize: 10, color: "#ADADB8" }}>
                        {ok && <span style={{ color: "#00C853", fontWeight: 700 }}>✓ elegível · </span>}
                        {`${Math.floor(calcMins(v.sessions)/60)}h${calcMins(v.sessions)%60}m`}
                      </span>
                    </div>
                  </div>
                  {/* Progresso mensal */}
                  <div style={{ flexShrink: 0, textAlign: "center", minWidth: 52 }}>
                    <div style={{ display: "flex", gap: 3, justifyContent: "center", marginBottom: 3 }}>
                      {[0,1,2].map(idx => (
                        <div key={idx} style={{ width: 12, height: 12, borderRadius: "50%", background: idx < monthCycles ? (monthlyOk ? "#FFD700" : "#FFB347") : "#3D3D47", border: `1.5px solid ${idx < monthCycles ? (monthlyOk ? "#FFD70066" : "#FFB34766") : "#26262C"}`, transition: "all .3s" }} />
                      ))}
                    </div>
                    <div style={{ fontSize: 9, color: monthlyOk ? "#FFD700" : "#ADADB8", fontWeight: 700, letterSpacing: .3 }}>{monthlyOk ? "🏅 mensal" : `${monthCycles}/3`}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "#3D3D47", textAlign: "center", marginTop: 8 }}>
            ★ = dias qualificados nesta semana · ●●● = semanas elegíveis neste mês
          </div>
        </div>}

        {/* CRONOGRAMA */}
        {tab === "cronograma" && <div className="fade-up">
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: "#EFEFF1", marginBottom: 4 }}>Cronograma de Lives</div>
            <div style={{ fontSize: 12, color: "#ADADB8" }}>Fique por dentro das próximas lives do oTaiLungg</div>
          </div>
          {(() => {
            const now = new Date();
            const all = (state?.schedule || []).slice().sort((a, b) => (a.date+a.time).localeCompare(b.date+b.time));
            const upcoming = all.filter(e => new Date(`${e.date}T${e.time}`) > now);
            const past = all.filter(e => new Date(`${e.date}T${e.time}`) <= now);
            if (!all.length) return (
              <div className="card" style={{ textAlign: "center", padding: "40px 20px", color: "#ADADB8" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Nenhuma live agendada</div>
                <div style={{ fontSize: 12 }}>Em breve novas datas serão anunciadas!</div>
              </div>
            );
            const renderEntry = (e, isPast) => {
              const dt = new Date(`${e.date}T${e.time}`);
              const dayName = dt.toLocaleDateString('pt-BR', { weekday: 'long' });
              const dayFmt = dt.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
              const isToday = e.date === now.toISOString().slice(0,10);
              return (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 12, background: isPast ? "#18181B" : isToday ? "#9146FF18" : "#1E1E22", border: `1px solid ${isPast ? "#26262C" : isToday ? "#9146FF55" : "#26262C"}`, opacity: isPast ? 0.5 : 1, marginBottom: 8 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 10, background: isPast ? "#26262C" : isToday ? "#9146FF22" : "#26262C", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: isPast ? "#3D3D47" : isToday ? "#9146FF" : "#EFEFF1", lineHeight: 1 }}>{dt.getDate()}</div>
                    <div style={{ fontSize: 9, color: "#ADADB8", textTransform: "uppercase", letterSpacing: .5 }}>{dt.toLocaleDateString('pt-BR', { month: 'short' })}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: isPast ? "#ADADB8" : "#EFEFF1", marginBottom: 2 }}>{e.title}</div>
                    <div style={{ fontSize: 11, color: "#ADADB8" }}>{dayName} · {e.time}</div>
                  </div>
                  {isToday && <span style={{ background: "#FF474711", border: "1px solid #FF474744", borderRadius: 20, padding: "3px 10px", fontSize: 10, color: "#FF4747", fontWeight: 700, flexShrink: 0 }}>HOJE</span>}
                  {!isPast && !isToday && <span style={{ background: "#9146FF11", border: "1px solid #9146FF33", borderRadius: 20, padding: "3px 10px", fontSize: 10, color: "#9146FF", fontWeight: 700, flexShrink: 0 }}>{e.time}</span>}
                </div>
              );
            };
            return <>
              {upcoming.length > 0 && <>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#ADADB8", textTransform: "uppercase", letterSpacing: .8, marginBottom: 10 }}>Próximas</div>
                {upcoming.map(e => renderEntry(e, false))}
              </>}
              {past.length > 0 && <>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#3D3D47", textTransform: "uppercase", letterSpacing: .8, margin: "16px 0 10px" }}>Encerradas</div>
                {past.map(e => renderEntry(e, true))}
              </>}
            </>;
          })()}
        </div>}

        {/* STREAMER */}
        {tab === "streamer" && <div className="fade-up">
          {!streamerUnlocked ? (
            <div className="card" style={{ maxWidth: 360, margin: "40px auto" }}>
              <div className="card-title" style={{ textAlign: "center" }}>🔒 Acesso do Streamer</div>
              <span className="label">senha</span>
              <div className="row">
                <input className="inp" type="password" placeholder="••••••••" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && unlockStreamer()} />
                <button className="btn" onClick={unlockStreamer}>Entrar</button>
              </div>
            </div>
          ) : <>
            <div className="admin-tabs">
              {[["live","Live"],["ciclo","Ciclo"],["viewers","Viewers"],["premio","Prêmio"],["historico","Histórico"],["cronograma","Cronograma"]].map(([id,label]) => (
                <button key={id} className={`admin-tab${adminTab===id?" active":""}`} onClick={() => setAdminTab(id)}>{label}</button>
              ))}
            </div>

            {/* ADMIN: LIVE */}
            {adminTab === "live" && <>
              <div className="grid2">
                <div className="card">
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Status da live</div>
                  <div style={{ fontSize: 12, color: "#ADADB8", marginBottom: 14 }}>{state?.liveActive ? `Aberta — ${formatDate(state.liveDate)}` : "Offline"}</div>
                  {!state?.liveActive && (
                    <>
                      <span className="label">Título da live (Discord)</span>
                      <input
                        className="inp"
                        style={{ marginBottom: 10 }}
                        placeholder="ex: Jogando Valorant — Ranked ao vivo!"
                        value={liveTitle}
                        onChange={e => setLiveTitle(e.target.value)}
                      />
                      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer", userSelect: "none" }}>
                        <input
                          type="checkbox"
                          checked={liveTestMode}
                          onChange={e => setLiveTestMode(e.target.checked)}
                          style={{ width: 15, height: 15, accentColor: "#FF9800", cursor: "pointer" }}
                        />
                        <span style={{ fontSize: 12, color: liveTestMode ? "#FF9800" : "#ADADB8", fontWeight: liveTestMode ? 700 : 400 }}>
                          Modo teste — sem notificação no Discord
                        </span>
                      </label>
                    </>
                  )}
                  <button
                    className={`btn btn-full${state?.liveActive ? " btn-red" : ""}`}
                    style={!state?.liveActive ? { background: liveTestMode ? "#FF9800" : "#00C853" } : {}}
                    onClick={toggleLive}
                    disabled={acting}
                  >
                    {state?.liveActive ? "⏹ Encerrar live" : liveTestMode ? "▶ Abrir live de teste" : "▶ Abrir live"}
                  </button>
                </div>
                <div className="card">
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Sorteio</div>
                  <div style={{ fontSize: 12, color: "#ADADB8", marginBottom: 14 }}>{eligCount} elegível(is) de {vList.length}</div>
                  <button className="btn btn-full" onClick={drawWinner} disabled={acting}>🎲 Sortear</button>
                </div>
              </div>
              {state?.winner && (
                <div className="winner-box">
                  <div style={{ fontSize: 11, color: "#ADADB8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>🏆 Vencedor</div>
                  <div style={{ fontSize: 30, fontWeight: 900, color: "#9146FF" }}>{state.winner.display_name || state.winner.nick}</div>
                  <div style={{ fontSize: 12, color: "#ADADB8", marginTop: 6 }}>{uniqueDays(state.winner.sessions).length} lives · {Math.floor(calcMins(state.winner.sessions)/60)}h{calcMins(state.winner.sessions)%60}m · código: <strong style={{ color: "#9146FF" }}>{state.winner.code}</strong></div>
                  <button className="btn-ghost" style={{ marginTop: 14, fontSize: 12, padding: "6px 14px" }} onClick={() => act("clear_winner")}>Limpar</button>
                </div>
              )}

              {/* Roleta */}
              <div className="card">
                <div style={{ fontWeight: 700, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  🎡 Roleta
                  <span style={{ fontSize: 11, color: "#9146FF", background: "#9146FF15", padding: "2px 8px", borderRadius: 10 }}>
                    {eligCount} elegíve{eligCount === 1 ? "l" : "is"}
                  </span>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <span className="label">Tempo de giro: <strong style={{ color: "#9146FF" }}>{spinSecs}s</strong></span>
                  <input
                    type="range" min={3} max={100} step={1} value={spinSecs}
                    onChange={e => setSpinSecs(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "#9146FF", cursor: "pointer", marginTop: 6 }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#ADADB8", marginTop: 3 }}>
                    <span>3s</span><span>100s</span>
                  </div>
                </div>
                <SpinWheel
                  eligible={vList.filter(isEligible)}
                  spinSecs={spinSecs}
                  onDone={w => drawSpecific(w.twitch_id || w.nick)}
                />
              </div>

              {/* Bot do Chat */}
              <div className="card">
                <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  🤖 Bot do Chat
                  {botActive && <span style={{ fontSize: 11, color: "#00C853", background: "#00C85318", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>● ATIVO</span>}
                  {botActive && botCountdown && (
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#ADADB8", background: "#26262C", padding: "2px 10px", borderRadius: 10, fontFamily: "monospace", fontWeight: 700 }}>
                      próx. msg <span style={{ color: "#FFD700" }}>{botCountdown}</span>
                    </span>
                  )}
                </div>
                {!streamerTwitchId ? (
                  <>
                    <div style={{ fontSize: 12, color: "#ADADB8", marginBottom: 12, lineHeight: 1.7 }}>
                      Conecte sua conta Twitch para o bot postar <strong style={{ color: "#EFEFF1" }}>#tailung</strong> no chat a cada {botIntervalMins}min. Viewers que responderem ganham +15min automaticamente.
                    </div>
                    <button className="btn btn-full" onClick={loginStreamerBot}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28H17v4.28h-1.43M7 2L3.43 5.57v12.86h4.28V22l3.58-3.57h2.85L20.57 12V2m-1.43 9.29l-2.85 2.85h-2.86l-2.5 2.5v-2.5H7.71V3.43z"/></svg>
                      Conectar Twitch (Bot)
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: "#00C853", marginBottom: 10 }}>✓ Twitch conectado</div>
                    <div style={{ fontSize: 12, color: "#ADADB8", marginBottom: 12, lineHeight: 1.7 }}>
                      {botActive
                        ? `Bot ativo: postando #tailung no chat a cada ${botIntervalMins}min e somando tempo automaticamente.`
                        : `Bot pronto. Inicie para postar no chat a cada ${botIntervalMins}min e capturar as respostas dos viewers.`}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <label style={{ fontSize: 12, color: "#ADADB8", whiteSpace: "nowrap" }}>Intervalo (min):</label>
                      <input
                        type="number" min={1} max={60}
                        value={botIntervalMins}
                        disabled={botActive}
                        onChange={e => {
                          const v = Math.max(1, Math.min(60, Number(e.target.value) || 7));
                          setBotIntervalMins(v);
                          botIntervalRef.current = v;
                          localStorage.setItem('bot_interval_mins', String(v));
                        }}
                        style={{ width: 60, background: "#18181B", border: "1px solid #3D3D47", borderRadius: 6, color: "#EFEFF1", padding: "4px 8px", fontSize: 13, opacity: botActive ? 0.5 : 1 }}
                      />
                    </div>
                    <div className="row">
                      {!botActive
                        ? <button className="btn btn-green btn-full" onClick={startBot} disabled={!state?.liveActive}>▶ Iniciar Bot</button>
                        : <button className="btn btn-red btn-full" onClick={stopBot}>⏹ Parar Bot</button>}
                      <button className="btn-ghost" onClick={disconnectBot} style={{ whiteSpace: "nowrap" }}>Desconectar</button>
                    </div>
                    {!state?.liveActive && !botActive && <div style={{ fontSize: 11, color: "#ADADB8", marginTop: 8 }}>Abra a live para ativar o bot.</div>}
                    <div style={{ marginTop: 10, fontSize: 11, color: "#ADADB8", lineHeight: 1.6 }}>
                      📡 Conectado via IRC — captura <strong style={{ color: "#EFEFF1" }}>#tailung</strong> e subs em tempo real.
                    </div>
                    {botActive && (
                      <div style={{ marginTop: 12, borderTop: "1px solid #26262C", paddingTop: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#ADADB8", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                          <span>📋 Log IRC</span>
                          <span style={{ cursor: "pointer", color: "#9146FF" }} onClick={() => setIrcLog([])}>limpar</span>
                        </div>
                        <div style={{ background: "#0E0E10", borderRadius: 8, padding: "8px 10px", maxHeight: 200, overflowY: "auto", fontFamily: "monospace", fontSize: 11 }}>
                          {ircLog.length === 0 && <div style={{ color: "#3D3D47" }}>Aguardando eventos...</div>}
                          {ircLog.map((e, i) => {
                            const colors = { ok: "#00C853", skip: "#ADADB8", tailung: "#9146FF", sub: "#FF69B4", err: "#FF4747", info: "#FFB347" };
                            return (
                              <div key={i} style={{ color: colors[e.type] || "#EFEFF1", marginBottom: 3 }}>
                                <span style={{ color: "#3D3D47", marginRight: 6 }}>{e.time}</span>{e.msg}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>}

            {/* ADMIN: CICLO */}
            {adminTab === "ciclo" && <>
              <div className="card">
                <div className="card-title">Semana atual</div>
                <div className="grid3" style={{ marginBottom: 16 }}>
                  {[["#9146FF", vList.length, "viewers"],["#00C853", eligCount, "elegíveis"],["#FFB347", Math.floor(vList.reduce((a,v)=>a+calcMins(v.sessions),0)/60)+"h", "acumulado"]].map(([color,val,lbl]) => (
                    <div key={lbl} className="stat-box"><div className="stat-val" style={{ color }}>{val}</div><div className="stat-lbl">{lbl}</div></div>
                  ))}
                </div>
                <div style={{ background: "#FF474710", border: "1px solid #FF474740", borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontSize: 13, color: "#FF8080", lineHeight: 1.6 }}>
                  ⚠️ Encerrar o ciclo vai <strong>resetar todos os pontos e sessões</strong> da semana atual. O histórico é salvo automaticamente.
                </div>
                <button className="btn btn-full btn-red" onClick={endCycle} disabled={acting}>
                  🏁 Encerrar ciclo semanal
                </button>
              </div>
              <div className="card">
                <div className="card-title">Histórico rápido</div>
                <div style={{ fontSize: 13, color: "#ADADB8" }}>{history.length} ciclo(s) encerrado(s) · <span style={{ color: "#9146FF", cursor: "pointer" }} onClick={() => setAdminTab("historico")}>Ver tudo →</span></div>
              </div>
            </>}

            {/* ADMIN: VIEWERS */}
            {adminTab === "viewers" && <>
              <div className="card" style={{ borderColor: "#FF630022" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 15 }}>🔧</span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Adicionar XP</span>
                  <span style={{ fontSize: 11, color: "#ADADB8", background: "#26262C", borderRadius: 6, padding: "2px 8px" }}>debug</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <select
                    value={xpTarget}
                    onChange={e => setXpTarget(e.target.value)}
                    style={{ flex: 2, minWidth: 140, background: "#26262C", border: "1.5px solid #3D3D47", borderRadius: 10, color: "#EFEFF1", padding: "10px 12px", fontSize: 13, outline: "none" }}>
                    <option value="">Selecionar viewer...</option>
                    {vList.map(v => (
                      <option key={v.twitch_id} value={v.twitch_id}>
                        {v.display_name || v.nick} — {calcXP(v)} XP
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={xpAmount}
                    onChange={e => setXpAmount(Number(e.target.value))}
                    min={-99999} max={99999}
                    style={{ width: 90, background: "#26262C", border: "1.5px solid #3D3D47", borderRadius: 10, color: "#EFEFF1", padding: "10px 12px", fontSize: 13, outline: "none" }}
                  />
                  <button
                    className="btn"
                    style={{ background: "#FF6300", flexShrink: 0 }}
                    disabled={acting || !xpTarget || !xpAmount}
                    onClick={() => {
                      const v = vList.find(v => v.twitch_id === xpTarget);
                      const label = v ? (v.display_name || v.nick) : xpTarget;
                      if (window.confirm(`Adicionar ${xpAmount} XP para ${label}?`))
                        act("add_xp", { twitch_id: xpTarget, xp: xpAmount });
                    }}>
                    Aplicar XP
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "#ADADB8", marginTop: 8 }}>XP negativo remove. Vai para permanentXP, não reseta no ciclo.</div>
              </div>

              <div className="card">
                <div className="card-title">Viewers cadastrados</div>
                {!vList.length && <div style={{ color: "#ADADB8", textAlign: "center", padding: "20px 0", fontSize: 13 }}>Nenhum viewer ainda.</div>}
                {vList.map(v => {
                  const days = uniqueDays(v.sessions).length;
                  const mins = calcMins(v.sessions);
                  const ok = isEligible(v);
                  const monthlyOk = isMonthlyEligible(v);
                  const monthCycles = monthlyEligibleCycles(v);
                  const hasToday = v.sessions.some(s => s.date === state?.liveDate);
                  return (
                    <div key={v.twitch_id || v.nick} className="viewer-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.display_name || v.nick}</span>
                          {monthlyOk && <span style={{ background: "#FFD70020", color: "#FFD700", borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 700, border: "1px solid #FFD70044", flexShrink: 0 }}>🏅 mensal</span>}
                          {!monthlyOk && monthCycles > 0 && <span style={{ background: "#FFD70010", color: "#FFD70099", borderRadius: 20, padding: "1px 6px", fontSize: 10, fontWeight: 600, flexShrink: 0 }}>{monthCycles}/3 🏅</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "#ADADB8", marginTop: 2 }}>{days} lives · {Math.floor(mins/60)}h{mins%60}m · <span className={`badge ${ok?"badge-ok":"badge-pend"}`}>{ok?"elegível":"pendente"}</span>{v.hasSub && <span className="badge" style={{ background: "#FF69B415", color: "#FF69B4", marginLeft: 4 }}>★ sub</span>}</div>
                      </div>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
                        <button onClick={() => setProfileViewer(v)} style={{ background: "#9146FF22", border: "1px solid #9146FF44", borderRadius: 8, padding: "4px 8px", fontSize: 13, cursor: "pointer", color: "#9146FF", lineHeight: 1 }} title="Ver perfil">👁</button>
                        {hasToday ? [15,30,60].map(m => (
                          <button key={m} className="btn-ghost" style={{ padding: "4px 8px", fontSize: 11, borderRadius: 8 }} onClick={() => addTime(v.twitch_id, m)} disabled={acting}>+{m}</button>
                        )) : <span style={{ color: "#3D3D47", fontSize: 11 }}>{state?.liveActive ? "sem checkin" : "—"}</span>}
                        <button onClick={() => { if (window.confirm(`Deletar ${v.display_name || v.nick}?`)) act("delete_viewer", { twitch_id: v.twitch_id || v.nick }); }} disabled={acting} style={{ background: "none", border: "none", cursor: "pointer", color: "#FF474755", fontSize: 16, padding: "2px 4px", lineHeight: 1 }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-ghost" style={{ flex: 1, color: "#FF4747", borderColor: "#FF474744" }} onClick={resetAll} disabled={acting}>Resetar tudo</button>
                <button className="btn-ghost" onClick={() => { setStreamerUnlocked(false); sessionStorage.removeItem('admin_unlocked'); }}>Sair</button>
              </div>
            </>}

            {/* ADMIN: PRÊMIO */}
            {adminTab === "premio" && <>
              {/* Prêmio ativo — mostrado como histórico, não bloqueia novo */}
              {state?.prize && (
                <div className="card" style={{ borderColor: state.prize.redeemed ? "#00C85344" : state.prize.enabled ? "#9146FF44" : "#3D3D47" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#ADADB8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Prêmio atual</div>
                  <div style={{ background: state.prize.redeemed ? "#00C85315" : state.prize.enabled ? "#9146FF15" : "#26262C", border: `1px solid ${state.prize.redeemed ? "#00C85344" : state.prize.enabled ? "#9146FF44" : "#3D3D47"}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{state.prize.display_name}</div>
                    <div style={{ fontSize: 12, color: "#ADADB8", marginBottom: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      Código:&nbsp;
                      {adminPrizeCode
                        ? <span style={{ background: "#26262C", borderRadius: 6, padding: "3px 10px", color: "#9146FF", fontWeight: 800, letterSpacing: 1, wordBreak: "break-all", whiteSpace: "pre-line" }}>{adminPrizeCode}</span>
                        : <button onClick={fetchPrizeCode} disabled={acting} style={{ background: "none", border: "1px solid #9146FF44", borderRadius: 6, padding: "3px 10px", color: "#9146FF", fontSize: 12, cursor: "pointer" }}>👁 Ver código</button>
                      }
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span className={`badge ${state.prize.redeemed ? "badge-ok" : state.prize.enabled ? "badge-ok" : "badge-pend"}`}>
                        {state.prize.redeemed ? "✓ Resgatado" : state.prize.enabled ? "● Resgate habilitado" : "○ Aguardando habilitação"}
                      </span>
                      {state.prize.redeemed && <span style={{ fontSize: 11, color: "#ADADB8" }}>em {new Date(state.prize.redeemedAt).toLocaleDateString("pt-BR")}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {!state.prize.redeemed && (
                      <button className={`btn btn-full${state.prize.enabled ? " btn-red" : ""}`} style={!state.prize.enabled ? { background: "#00C853" } : {}} onClick={() => act("toggle_prize")} disabled={acting}>
                        {state.prize.enabled ? "⏸ Desabilitar resgate" : "▶ Habilitar resgate"}
                      </button>
                    )}
                    <button className="btn-ghost" onClick={() => { if (window.confirm("Remover prêmio atual?")) act("clear_prize"); }} disabled={acting}>Remover</button>
                  </div>
                </div>
              )}

              {/* Formulário sempre disponível para dar novo prêmio */}
              <div className="card">
                <div className="card-title">🎁 {state?.prize ? "Dar prêmio para outro viewer" : "Configurar prêmio"}</div>
                <span className="label">Vencedor</span>
                <select className="inp" style={{ marginBottom: 10, cursor: "pointer" }} value={prizeWinnerId} onChange={e => setPrizeWinnerId(e.target.value)}>
                  <option value="">Selecione o viewer...</option>
                  {vList.map(v => <option key={v.twitch_id || v.nick} value={v.twitch_id || v.nick}>{v.display_name || v.nick}</option>)}
                </select>
                <span className="label">Código(s) do Gift Card</span>
                <textarea
                  className="inp"
                  style={{ marginBottom: 14, minHeight: 80, resize: "vertical", lineHeight: 1.7, fontFamily: "monospace", whiteSpace: "pre" }}
                  placeholder={"ex: XXXX-XXXX-XXXX-XXXX\n(Alt+Enter para múltiplos códigos)"}
                  value={prizeGiftcard}
                  onChange={e => setPrizeGiftcard(e.target.value)}
                />
                <button className="btn btn-full" onClick={savePrize} disabled={acting}>💾 Salvar prêmio</button>
                <div style={{ fontSize: 11, color: "#ADADB8", marginTop: 10, lineHeight: 1.6 }}>O código fica oculto até o viewer resgatar. Você habilita o resgate quando quiser.</div>
              </div>
            </>}

            {/* ADMIN: HISTÓRICO */}
            {adminTab === "historico" && <>
              <div className="card">
                <div className="card-title">Histórico de ciclos</div>
                <div className="hist-filter">
                  {[["all","Tudo"],["year","Este ano"],["month","Este mês"]].map(([v,l]) => (
                    <button key={v} onClick={() => setHistoryFilter(v)} style={{ background: historyFilter===v?"#9146FF":"#26262C", color: historyFilter===v?"#fff":"#ADADB8" }}>{l}</button>
                  ))}
                </div>
                {filteredHistory.length > 0 && (
                  <div className="grid3" style={{ marginBottom: 16 }}>
                    {[["#9146FF", cumulativeStats.cycles, "ciclos"],["#00C853", cumulativeStats.lives, "lives"],["#FFB347", Math.floor(cumulativeStats.minutes/60)+"h", "total"]].map(([color,val,lbl]) => (
                      <div key={lbl} className="stat-box"><div className="stat-val" style={{ color, fontSize: 20 }}>{val}</div><div className="stat-lbl">{lbl}</div></div>
                    ))}
                  </div>
                )}
                {!filteredHistory.length && <div style={{ color: "#ADADB8", textAlign: "center", padding: "20px 0", fontSize: 13 }}>Nenhum ciclo encerrado ainda.</div>}
                {filteredHistory.map((c, i) => (
                  <div key={i} className="history-item">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>Ciclo #{history.length - history.indexOf(c)}</div>
                        <div style={{ fontSize: 11, color: "#ADADB8" }}>{monthLabel(c.endDate)} · encerrado em {formatDate(c.endDate)}</div>
                      </div>
                      {c.winner && <span className="badge badge-ok" style={{ fontSize: 10 }}>🏆 {c.winner.display_name || c.winner.nick}</span>}
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#ADADB8" }}>
                      <span>👥 {c.stats?.totalViewers || 0} viewers</span>
                      <span>✅ {c.stats?.eligibleViewers || 0} elegíveis</span>
                      <span>📺 {c.stats?.totalLives || 0} lives</span>
                      <span>⏱ {Math.floor((c.stats?.totalMinutes||0)/60)}h</span>
                    </div>
                  </div>
                ))}
              </div>
            </>}

            {/* ADMIN: CRONOGRAMA */}
            {adminTab === "cronograma" && <>
              <div className="card">
                <div className="card-title">Adicionar live</div>
                <span className="label">Título / Jogo</span>
                <input className="inp" style={{ marginBottom: 10 }} placeholder="ex: Minecraft, Just Chatting..." value={schedTitle} onChange={e => setSchedTitle(e.target.value)} />
                <div className="grid2" style={{ marginBottom: 10 }}>
                  <div>
                    <span className="label">Data</span>
                    <input className="inp" type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} />
                  </div>
                  <div>
                    <span className="label">Horário</span>
                    <input className="inp" type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} />
                  </div>
                </div>
                <button className="btn btn-full" onClick={async () => {
                  if (!schedTitle || !schedDate || !schedTime) { flash("Preencha todos os campos.", "#FF4747"); return; }
                  await act("add_schedule", { title: schedTitle, date: schedDate, time: schedTime });
                  setSchedTitle(''); setSchedDate(''); setSchedTime('20:00');
                }}>Adicionar</button>
              </div>
              <div className="card">
                <div className="card-title">Cronograma atual</div>
                {!state?.schedule?.length ? (
                  <div style={{ color: "#ADADB8", textAlign: "center", padding: "20px 0", fontSize: 12 }}>Nenhuma live agendada.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(state.schedule || []).map(e => {
                      const dt = new Date(`${e.date}T${e.time}`);
                      const isPast = dt < new Date();
                      return (
                        <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: isPast ? "#26262C" : "#9146FF11", border: `1px solid ${isPast ? "#3D3D47" : "#9146FF33"}`, opacity: isPast ? 0.5 : 1 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: isPast ? "#ADADB8" : "#EFEFF1" }}>{e.title}</div>
                            <div style={{ fontSize: 11, color: "#ADADB8" }}>{dt.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })} · {e.time}</div>
                          </div>
                          <button onClick={() => act("remove_schedule", { id: e.id })} style={{ background: "#FF474711", border: "1px solid #FF474733", color: "#FF4747", borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>}

          </>}
        </div>}

      </div>{/* end .body */}

        {/* SIDEBAR — visível só em desktop (≥1100px via CSS) */}
        <aside className="sidebar">
          {/* Stats rápidos */}
          <div style={{ background: "#18181B", border: "1px solid #26262C", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9146FF", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>📊 Status da semana</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#ADADB8" }}>Participantes</span>
                <span style={{ fontWeight: 800, fontSize: 14, color: "#9146FF" }}>{vList.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#ADADB8" }}>Elegíveis</span>
                <span style={{ fontWeight: 800, fontSize: 14, color: "#00C853" }}>{eligCount}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#ADADB8" }}>Horas acumuladas</span>
                <span style={{ fontWeight: 800, fontSize: 14, color: "#FFB347" }}>{Math.floor(vList.reduce((a,v)=>a+calcMins(v.sessions),0)/60)}h</span>
              </div>
              <div style={{ height: 1, background: "#26262C", margin: "4px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#ADADB8" }}>Live</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700, fontSize: 12, color: state?.liveActive ? "#FF4747" : "#ADADB8" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: state?.liveActive ? "#FF4747" : "#3D3D47", display: "inline-block", animation: state?.liveActive ? "pulse 1.5s infinite" : "none" }} />
                  {state?.liveActive ? "Ao vivo" : "Offline"}
                </span>
              </div>
            </div>
          </div>

          {/* Parceiros */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#ADADB8", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10, paddingLeft: 2 }}>🤝 Parceiros</div>
            <a href="https://copa.mentora.gg/" target="_blank" rel="noopener noreferrer"
              style={{ display: "block", textDecoration: "none", background: "#000", border: "1.5px solid #00C85344", borderRadius: 14, overflow: "hidden", transition: "transform .18s, box-shadow .18s" }}
              onMouseEnter={e => { e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 8px 32px #00C85344"; }}
              onMouseLeave={e => { e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}>
              {/* Logo banner */}
              <div style={{ background: "#000", padding: "18px 20px 14px", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid #00C85322" }}>
                <img src="/mentora.png" alt="Mentora" style={{ height: 32, objectFit: "contain", display: "block" }} onError={e => { e.target.style.display="none"; e.target.nextSibling.style.display="block"; }} />
                <span style={{ display: "none", fontWeight: 900, fontSize: 20, color: "#fff", letterSpacing: 3, textTransform: "uppercase" }}>MENTORA</span>
              </div>
              {/* Badge parceiro */}
              <div style={{ padding: "10px 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#00C853", letterSpacing: 1.2, textTransform: "uppercase", background: "#00C85318", border: "1px solid #00C85333", borderRadius: 20, padding: "3px 10px" }}>✦ Parceiro Oficial</span>
                <span style={{ color: "#00C85388", fontSize: 14 }}>↗</span>
              </div>
              <div style={{ padding: "0 16px 10px", fontSize: 12, color: "#7AE09A", lineHeight: 1.6 }}>
                Lobbys e campeonatos em parceria com a comunidade do Tailung.
              </div>
              <div style={{ background: "#00C8530D", borderTop: "1px solid #00C85322", padding: "9px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#4D4D4D" }}>copa.mentora.gg</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#00C853" }}>Criar conta →</span>
              </div>
            </a>
          </div>
        </aside>

      </div>{/* end .page-layout */}

      {profileViewer && <ProfileModal v={profileViewer} vList={vList} onClose={() => setProfileViewer(null)} />}

      {flashMsg && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: flashColor, color: "#fff", padding: "11px 22px", borderRadius: 10, fontWeight: 700, fontSize: 13, zIndex: 9999, pointerEvents: "none", whiteSpace: "nowrap", boxShadow: "0 4px 20px #0008" }}>
          {flashMsg}
        </div>
      )}
    </div>
  );
}

function ViewerCard({ v, vList }) {
  const [histTab, setHistTab] = useState("semana");
  const days = uniqueDays(v.sessions).length;
  const mins = calcMins(v.sessions);
  const ok = isEligible(v);
  const rank = vList.findIndex(x => x.twitch_id === v.twitch_id) + 1;
  const history = v.history || [];
  const qDays = calcStars(v.sessions);
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySession = v.sessions.find(s => s.date === todayStr);
  const todayGoalMet = (todaySession?.minutes || 0) >= MIN_MINS_LIVE;

  const now = new Date().toISOString().slice(0, 7);
  const monthHistory = history.filter(h => (h.cycleEnd || "").slice(0, 7) === now);
  const monthCycles = monthlyEligibleCycles(v);
  const monthlyOk = isMonthlyEligible(v);
  const xp = calcXP(v);
  const li = getLevelInfo(xp);

  return (
    <div className="card fade-up" style={{ borderColor: ok ? "#00C85344" : "#9146FF33" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#9146FF22", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#9146FF", fontSize: 16, ...eloFrameStyle(xp) }}>{(v.display_name || v.nick)[0].toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{v.display_name || v.nick}</div>
          <div style={{ fontSize: 11, color: "#ADADB8" }}>#{rank} no ranking · {calcXP(v)} XP · código: <strong style={{ color: "#9146FF" }}>{v.code}</strong></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          <span className={`badge ${ok?"badge-ok":"badge-pend"}`}>{ok ? "Elegível ✓" : "Pendente"}</span>
          {monthlyOk && <span style={{ background: "#FFD70020", color: "#FFD700", borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 700, border: "1px solid #FFD70044" }}>🏅 Mensal</span>}
          {!monthlyOk && monthCycles > 0 && <span style={{ background: "#FFD70010", color: "#FFD70099", borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>{monthCycles}/3 🏅</span>}
          {v.hasSub && <span className="badge" style={{ background: "#FF69B415", color: "#FF69B4" }}>★ Inscrito</span>}
        </div>
      </div>

      {/* XP Bar */}
      {(() => {
        const eloC = ELO_RANKS[getElo(xp)].color;
        return (
          <div style={{ background: `${eloC}10`, border: `1px solid ${eloC}33`, borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#ADADB8", marginBottom: 6 }}>
              <span>{xp} XP total</span>
              {li.xpNeed > 0 && <span>faltam {li.xpNeed - li.xpIn} XP</span>}
            </div>
            <div style={{ background: "#1a1a1e", borderRadius: 20, height: 9, overflow: "hidden" }}>
              <div className="lv-bar-fill" style={{ width: `${li.pct}%`, height: "100%", background: `linear-gradient(90deg, ${eloC}55, ${eloC})`, borderRadius: 20, transition: "width .6s ease" }} />
            </div>
          </div>
        );
      })()}

      {/* mini tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["semana","Semana atual"],["mensal","Este mês"],["historico","Histórico"]].map(([id,lbl]) => (
          <button key={id} onClick={() => setHistTab(id)} style={{ padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none", background: histTab===id?"#9146FF":"#26262C", color: histTab===id?"#fff":"#ADADB8" }}>{lbl}</button>
        ))}
      </div>

      {/* Semana atual */}
      {histTab === "semana" && <>
        {/* Daily goal callout */}
        {todayGoalMet && (
          <div style={{ background: "#FFD70010", border: "1px solid #FFD70033", borderRadius: 10, padding: "9px 13px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>★</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 12, color: "#FFD700" }}>Meta diária atingida!</div>
              <div style={{ fontSize: 11, color: "#ADADB8" }}>Você assistiu 1h+ hoje — +1 dia qualificado nesta semana</div>
            </div>
          </div>
        )}
        <div className="grid2" style={{ marginBottom: 12 }}>
          <div>
            <span className="label">dias qualificados</span>
            <div style={{ display: "flex", gap: 5, margin: "6px 0" }}>
              {Array.from({length: MIN_DAYS}, (_, idx) => (
                <div key={idx} style={{ width: 30, height: 30, borderRadius: 8, background: idx < qDays ? "#FFD70018" : "#1a1a1e", border: `1.5px solid ${idx < qDays ? "#FFD700" : "#3D3D47"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 15, color: idx < qDays ? "#FFD700" : "#3D3D47" }}>★</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: "#ADADB8" }}>{qDays}/{MIN_DAYS} estrelas · meta: 4 estrelas (minutos acumulados ÷ 60)</div>
          </div>
          <div>
            <span className="label">total acumulado</span>
            <div style={{ fontWeight: 800, fontSize: 22, color: mins >= MIN_MINS_TOTAL ? "#00C853" : "#9146FF" }}>{Math.floor(mins/60)}h{mins%60}m</div>
            <div className="prog-wrap"><div className="prog-bar" style={{ width: `${Math.min(100, mins/MIN_MINS_TOTAL*100)}%`, background: mins >= MIN_MINS_TOTAL ? "#00C853" : "#9146FF" }} /></div>
            <div style={{ fontSize: 10, color: "#ADADB8", marginTop: 2 }}>meta: 11h no total</div>
          </div>
        </div>
        {v.sessions.length > 0 && (
          <div style={{ background: "#26262C", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: "#ADADB8", fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>Check-ins desta semana</div>
            {v.sessions.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: i < v.sessions.length-1 ? "1px solid #3D3D4722" : "none" }}>
                <span style={{ color: "#EFEFF1" }}>📅 {formatDate(s.date)}</span>
                <span style={{ fontWeight: 700, color: s.minutes >= MIN_MINS_LIVE ? "#FFD700" : "#9146FF" }}>{Math.floor(s.minutes/60)}h{s.minutes%60}m {s.minutes >= MIN_MINS_LIVE ? "★" : ""}</span>
              </div>
            ))}
          </div>
        )}
        {v.sessions.length === 0 && <div style={{ fontSize: 12, color: "#ADADB8", textAlign: "center", padding: "10px 0" }}>Nenhum check-in nesta semana ainda.</div>}
        {ok && <div style={{ marginTop: 12, background: "#00C85315", borderRadius: 10, padding: "10px 14px", color: "#00C853", fontWeight: 700, textAlign: "center", fontSize: 13 }}>🎉 Você está na urna do sorteio!</div>}
      </>}

      {/* Este mês */}
      {histTab === "mensal" && <>
        {/* Progresso mensal */}
        <div style={{ background: monthlyOk ? "#FFD70015" : "#1a1a1e", border: `1.5px solid ${monthlyOk ? "#FFD70055" : "#3D3D47"}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: monthlyOk ? "#FFD700" : "#ADADB8" }}>{monthlyOk ? "🏅 Elegível Mensal!" : "Progresso Mensal"}</div>
            <span style={{ fontSize: 12, fontWeight: 700, color: monthlyOk ? "#FFD700" : "#C9A7FF" }}>{monthCycles}/3 semanas</span>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ flex: 1, height: 10, borderRadius: 20, background: i < monthCycles ? "linear-gradient(90deg, #FFB30088, #FFD700)" : "#26262C", transition: "background .4s", border: `1px solid ${i < monthCycles ? "#FFD70044" : "#3D3D47"}` }} />
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#ADADB8" }}>
            {monthlyOk ? "Você está qualificado para o sorteio mensal! 🎉" : `Faltam ${3 - monthCycles} semana(s) elegível(is) para o sorteio mensal`}
          </div>
        </div>
        {monthHistory.length === 0 && <div style={{ fontSize: 12, color: "#ADADB8", textAlign: "center", padding: "10px 0" }}>Nenhum ciclo encerrado este mês.</div>}
        {monthHistory.map((h, i) => <CycleEntry key={i} h={h} />)}
      </>}

      {/* Histórico completo */}
      {histTab === "historico" && <>
        {history.length === 0 && <div style={{ fontSize: 12, color: "#ADADB8", textAlign: "center", padding: "16px 0" }}>Nenhum histórico ainda.<br/><span style={{ fontSize: 11 }}>Disponível após o primeiro ciclo encerrado.</span></div>}
        {history.map((h, i) => <CycleEntry key={i} h={h} />)}
        {history.length > 0 && <div style={{ fontSize: 10, color: "#3D3D47", textAlign: "center", marginTop: 10 }}>Histórico mantido por 2 meses</div>}
      </>}
    </div>
  );
}

function CycleEntry({ h }) {
  const [open, setOpen] = useState(false);
  const mins = h.totalMinutes || 0;
  return (
    <div style={{ background: "#26262C", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Ciclo encerrado em {formatDate(h.cycleEnd)}</div>
          <div style={{ fontSize: 11, color: "#ADADB8", marginTop: 2 }}>{h.lives} live(s) · {Math.floor(mins/60)}h{mins%60}m · {h.eligible ? <span style={{ color: "#00C853" }}>elegível ✓</span> : <span style={{ color: "#ADADB8" }}>não elegível</span>} {h.won ? "· 🏆 Ganhou!" : ""}</div>
        </div>
        <span style={{ color: "#ADADB8", fontSize: 14 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && h.sessions?.length > 0 && (
        <div style={{ marginTop: 10, borderTop: "1px solid #3D3D4744", paddingTop: 10 }}>
          {h.sessions.map((s, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 0", color: "#ADADB8" }}>
              <span>📅 {formatDate(s.date)}</span>
              <span style={{ fontWeight: 700, color: s.minutes >= MIN_MINS_LIVE ? "#00C853" : "#EFEFF1" }}>{Math.floor(s.minutes/60)}h{s.minutes%60}m</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
