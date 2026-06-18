import { useState, useEffect, useCallback } from "react";

const MIN_DAYS = 3, MIN_MINS = 60;
const PASS = "streamer123";
const API = "/api/state";

function calcMins(sessions) { return sessions.reduce((a, s) => a + (s.minutes || 0), 0); }
function uniqueDays(sessions) { return [...new Set(sessions.map(s => s.date))]; }
function isEligible(v) { return uniqueDays(v.sessions).length >= MIN_DAYS && calcMins(v.sessions) >= MIN_MINS; }
function totalScore(v) { return uniqueDays(v.sessions).length * 20 + calcMins(v.sessions); }

export default function App() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("home");
  const [nick, setNick] = useState("");
  const [nickCI, setNickCI] = useState("");
  const [pass, setPass] = useState("");
  const [streamerUnlocked, setStreamerUnlocked] = useState(false);
  const [flashMsg, setFlashMsg] = useState("");
  const [flashColor, setFlashColor] = useState("#9146FF");
  const [flashTimer, setFlashTimer] = useState(null);
  const [preview, setPreview] = useState(null);
  const [acting, setActing] = useState(false);

  const flash = useCallback((msg, color = "#9146FF") => {
    setFlashMsg(msg); setFlashColor(color);
    clearTimeout(flashTimer);
    setFlashTimer(setTimeout(() => setFlashMsg(""), 3000));
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
      if (!r.ok) { flash(data.error || "Erro!", "#FF4747"); }
      else { setState(data); }
      return { ok: r.ok, data };
    } catch { flash("Erro de conexão!", "#FF4747"); return { ok: false }; }
    finally { setActing(false); }
  }, [flash]);

  // poll a cada 5s pra sincronizar viewers
  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 5000);
    return () => clearInterval(interval);
  }, [fetchState]);

  // atualiza preview quando state muda
  useEffect(() => {
    if (nick && state?.viewers) {
      const n = nick.trim().toLowerCase();
      setPreview(state.viewers[n] || null);
    }
  }, [state, nick]);

  async function doRegister() {
    const n = nick.trim().toLowerCase();
    if (!n) return flash("Digite seu nick!", "#FF4747");
    const res = await act("register", { nick: n });
    if (res.ok) { flash("Cadastrado! ✅", "#00C853"); setNick(""); }
  }

  async function doCheckin() {
    const n = nickCI.trim().toLowerCase();
    if (!n) return flash("Digite seu nick!", "#FF4747");
    const res = await act("checkin", { nick: n });
    if (res.ok) { flash("Check-in feito! ✅", "#00C853"); setNickCI(""); }
  }

  async function toggleLive() {
    if (!state.liveActive) {
      const res = await act("open_live");
      if (res.ok) flash("Live aberta! ✅", "#00C853");
    } else {
      const res = await act("close_live");
      if (res.ok) flash("Live encerrada.");
    }
  }

  async function addTime(nick, minutes) {
    await act("add_time", { nick, minutes });
  }

  async function drawWinner() {
    const res = await act("draw");
    if (res.ok) flash(`🎉 Vencedor: ${res.data.winner.nick}!`);
  }

  function unlockStreamer() {
    if (pass === PASS) { setStreamerUnlocked(true); setPass(""); }
    else flash("Senha incorreta.", "#FF4747");
  }

  async function resetAll() {
    if (!window.confirm("Zerar tudo?")) return;
    const res = await act("reset");
    if (res.ok) flash("Sistema zerado.");
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0E0E10", display: "flex", alignItems: "center", justifyContent: "center", color: "#9146FF", fontFamily: "Inter,sans-serif", fontSize: 16, gap: 12 }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="#9146FF"><path d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28H17v4.28h-1.43M7 2L3.43 5.57v12.86h4.28V22l3.58-3.57h2.85L20.57 12V2m-1.43 9.29l-2.85 2.85h-2.86l-2.5 2.5v-2.5H7.71V3.43z"/></svg>
      Carregando SorteioLive...
    </div>
  );

  const vList = state ? Object.values(state.viewers).sort((a, b) => totalScore(b) - totalScore(a)) : [];
  const eligCount = vList.filter(isEligible).length;

  const s = {
    app: { minHeight: "100vh", background: "#0E0E10", color: "#EFEFF1", fontFamily: "'Inter',sans-serif", fontSize: 14 },
    bar: { background: "#18181B", borderBottom: "2px solid #9146FF", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 },
    tabs: { display: "flex", borderBottom: "1px solid #26262C", background: "#18181B" },
    tab: (a) => ({ padding: "11px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: a ? "#9146FF" : "#ADADB8", background: "none", border: "none", borderBottom: a ? "2px solid #9146FF" : "2px solid transparent" }),
    body: { padding: 16 },
    card: { background: "#18181B", border: "1px solid #26262C", borderRadius: 10, padding: 16, marginBottom: 12 },
    label: { fontSize: 11, color: "#ADADB8", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 4, display: "block" },
    inp: { background: "#26262C", border: "1px solid #3D3D47", borderRadius: 8, padding: "9px 12px", color: "#EFEFF1", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box" },
    btn: (bg = "#9146FF") => ({ background: bg, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, cursor: acting ? "not-allowed" : "pointer", fontSize: 13, opacity: acting ? .6 : 1 }),
    btnGhost: { background: "transparent", color: "#ADADB8", border: "1px solid #3D3D47", borderRadius: 8, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 },
    row: { display: "flex", gap: 8, alignItems: "center" },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
    grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
    statBox: { background: "#26262C", borderRadius: 8, padding: 12, textAlign: "center" },
    badge: (ok) => ({ display: "inline-block", padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: ok ? "#00C85322" : "#9146FF22", color: ok ? "#00C853" : "#9146FF" }),
    prog: { background: "#26262C", borderRadius: 20, height: 6, overflow: "hidden", margin: "4px 0" },
    flash: { position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", padding: "10px 20px", borderRadius: 8, fontWeight: 700, fontSize: 13, zIndex: 9999, pointerEvents: "none", whiteSpace: "nowrap" },
    winner: { background: "#9146FF22", border: "2px solid #9146FF", borderRadius: 12, padding: 20, textAlign: "center", marginBottom: 12 },
  };

  function ViewerStatus({ v }) {
    if (!v) return null;
    const days = uniqueDays(v.sessions).length;
    const mins = calcMins(v.sessions);
    const ok = isEligible(v);
    const rank = vList.findIndex(x => x.nick === v.nick) + 1;
    return (
      <div style={{ ...s.card, borderColor: ok ? "#00C85344" : "#9146FF44" }}>
        <div style={{ ...s.row, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#9146FF33", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#9146FF" }}>{v.nick[0].toUpperCase()}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{v.nick}</div>
            <div style={{ fontSize: 11, color: "#ADADB8" }}>código: <strong style={{ color: "#9146FF" }}>{v.code}</strong> · #{rank} · {totalScore(v)} pts</div>
          </div>
          <div style={{ marginLeft: "auto" }}><span style={s.badge(ok)}>{ok ? "Elegível ✓" : "Pendente"}</span></div>
        </div>
        <div style={s.grid2}>
          {[["dias", days, MIN_DAYS], ["minutos", mins, MIN_MINS]].map(([lbl, val, min]) => (
            <div key={lbl}>
              <span style={s.label}>{lbl}</span>
              <div style={{ fontWeight: 700, fontSize: 20, color: val >= min ? "#00C853" : "#9146FF" }}>{val}<span style={{ fontSize: 12, color: "#ADADB8" }}>/{min}</span></div>
              <div style={s.prog}><div style={{ height: "100%", borderRadius: 20, width: `${Math.min(100, val / min * 100)}%`, background: val >= min ? "#00C853" : "#9146FF", transition: "width .4s" }} /></div>
            </div>
          ))}
        </div>
        {ok && <div style={{ marginTop: 12, background: "#00C85318", borderRadius: 8, padding: 10, color: "#00C853", fontWeight: 700, textAlign: "center" }}>🎉 Você está na urna do sorteio!</div>}
      </div>
    );
  }

  return (
    <div style={s.app}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      <div style={s.bar}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#9146FF"><path d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28H17v4.28h-1.43M7 2L3.43 5.57v12.86h4.28V22l3.58-3.57h2.85L20.57 12V2m-1.43 9.29l-2.85 2.85h-2.86l-2.5 2.5v-2.5H7.71V3.43z" /></svg>
        <span style={{ fontWeight: 700, fontSize: 17, color: "#9146FF" }}>SorteioLive</span>
        <span style={{ fontSize: 12, color: "#ADADB8" }}>participação verificada</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: state?.liveActive ? "#00C853" : "#ADADB8" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: state?.liveActive ? "#FF4747" : "#ADADB8", animation: state?.liveActive ? "pulse 1.5s infinite" : "none" }} />
          {state?.liveActive ? `🔴 Live ao vivo!` : "⚫ Offline"}
        </div>
      </div>

      <div style={s.tabs}>
        {[["home","Início"],["viewer","Sou Viewer"],["ranking","Ranking"],["streamer","Streamer"]].map(([id,label]) => (
          <button key={id} style={s.tab(tab===id)} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div style={s.body}>
        {tab === "home" && <>
          <div style={s.card}>
            <div style={s.grid3}>
              {[["#9146FF", vList.length, "cadastrados"],["#00C853", eligCount, "elegíveis"],["#FFB347", vList.reduce((a,v)=>a+calcMins(v.sessions),0), "minutos"]].map(([color,val,lbl]) => (
                <div key={lbl} style={s.statBox}><div style={{ fontSize: 26, fontWeight: 800, color }}>{val}</div><div style={{ fontSize: 11, color: "#ADADB8", marginTop: 2 }}>{lbl}</div></div>
              ))}
            </div>
          </div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Como participar</div>
            {["Cadastre-se na aba Sou Viewer com seu nick da Twitch","Faça check-in toda vez que entrar em uma live","Apareça em pelo menos 3 lives e acumule 60 minutos no total"].map((txt, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#9146FF", color: "#fff", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i+1}</div>
                <div style={{ fontSize: 13, color: "#ADADB8", lineHeight: 1.6 }}>{txt}</div>
              </div>
            ))}
          </div>
          <div style={{ ...s.card, borderColor: state?.liveActive ? "#00C85344" : "#26262C", textAlign: "center", padding: "20px 16px" }}>
            <div style={{ fontSize: 28 }}>{state?.liveActive ? "🔴" : "⚫"}</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 8, color: state?.liveActive ? "#00C853" : "#ADADB8" }}>
              {state?.liveActive ? "Live está acontecendo agora!" : "Nenhuma live ativa no momento"}
            </div>
            {state?.liveActive && <div style={{ fontSize: 12, color: "#ADADB8", marginTop: 4 }}>Vai na aba Sou Viewer e faz seu check-in!</div>}
          </div>
        </>}

        {tab === "viewer" && <>
          <div style={s.card}>
            <span style={s.label}>cadastro — nick da twitch</span>
            <div style={{ ...s.row, marginBottom: 12 }}>
              <input style={s.inp} placeholder="ex: xgamer123" value={nick} onChange={e => setNick(e.target.value)} onKeyDown={e => e.key === "Enter" && doRegister()} />
              <button style={s.btn()} onClick={doRegister} disabled={acting}>Cadastrar</button>
            </div>
            <div style={{ height: 1, background: "#26262C", margin: "12px 0" }} />
            <span style={s.label}>check-in na live de hoje</span>
            <div style={{ fontSize: 12, color: state?.liveActive ? "#00C853" : "#ADADB8", marginBottom: 8 }}>
              {state?.liveActive ? "● Live ativa agora! Faça seu check-in." : "Nenhuma live ativa no momento."}
            </div>
            <div style={s.row}>
              <input style={s.inp} placeholder="seu nick" value={nickCI} onChange={e => setNickCI(e.target.value)} onKeyDown={e => e.key === "Enter" && doCheckin()} />
              <button style={s.btn("#00C853")} onClick={doCheckin} disabled={acting}>Check-in</button>
            </div>
          </div>
          <ViewerStatus v={preview} />
        </>}

        {tab === "ranking" && <>
          <div style={s.card}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Ranking de engajamento</div>
            {!vList.length && <div style={{ color: "#ADADB8", textAlign: "center", padding: "30px 0" }}>Nenhum viewer ainda.</div>}
            {vList.map((v, i) => {
              const score = totalScore(v);
              const maxScore = totalScore(vList[0]) || 1;
              const ok = isEligible(v);
              const medals = ["🥇","🥈","🥉"];
              return (
                <div key={v.nick} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: i < vList.length-1 ? "1px solid #26262C22" : "none", alignItems: "center" }}>
                  <div style={{ width: 22, textAlign: "center", fontWeight: 700, color: i < 3 ? ["#FFD700","#C0C0C0","#CD7F32"][i] : "#ADADB8", fontSize: i < 3 ? 16 : 13 }}>{i < 3 ? medals[i] : `#${i+1}`}</div>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#9146FF33", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#9146FF", fontSize: 13, flexShrink: 0 }}>{v.nick[0].toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{v.nick}</span>
                      <span style={s.badge(ok)}>{ok ? "elegível" : "pendente"}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#ADADB8", marginBottom: 4 }}>{uniqueDays(v.sessions).length} dias · {calcMins(v.sessions)} min · <strong style={{ color: "#9146FF" }}>{score} pts</strong></div>
                    <div style={s.prog}><div style={{ height: "100%", borderRadius: 20, width: `${Math.round(score/maxScore*100)}%`, background: i === 0 ? "#FFD700" : "#9146FF", transition: "width .4s" }} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </>}

        {tab === "streamer" && <>
          {!streamerUnlocked ? (
            <div style={{ ...s.card, maxWidth: 340, margin: "40px auto" }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Acesso do streamer</div>
              <span style={s.label}>senha</span>
              <div style={s.row}>
                <input style={s.inp} type="password" placeholder="••••••••" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && unlockStreamer()} />
                <button style={s.btn()} onClick={unlockStreamer}>Entrar</button>
              </div>
            </div>
          ) : <>
            <div style={s.grid2}>
              <div style={s.card}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Status da live</div>
                <div style={{ fontSize: 12, color: "#ADADB8", marginBottom: 12 }}>{state?.liveActive ? `Aberta — ${state.liveDate}` : "Offline"}</div>
                <button style={{ ...s.btn(state?.liveActive ? "#FF4747" : "#00C853"), width: "100%" }} onClick={toggleLive} disabled={acting}>
                  {state?.liveActive ? "⏹ Encerrar live" : "▶ Abrir live"}
                </button>
              </div>
              <div style={s.card}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Sorteio</div>
                <div style={{ fontSize: 12, color: "#ADADB8", marginBottom: 12 }}>{eligCount} elegível(is) de {vList.length}</div>
                <button style={{ ...s.btn(), width: "100%" }} onClick={drawWinner} disabled={acting}>🎲 Sortear</button>
              </div>
            </div>

            {state?.winner && (
              <div style={s.winner}>
                <div style={{ fontSize: 11, color: "#ADADB8", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>🏆 Vencedor</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#9146FF" }}>{state.winner.nick}</div>
                <div style={{ fontSize: 12, color: "#ADADB8", marginTop: 4 }}>{uniqueDays(state.winner.sessions).length} dias · {calcMins(state.winner.sessions)} min · código: {state.winner.code}</div>
                <button style={{ ...s.btnGhost, marginTop: 12, fontSize: 12, padding: "5px 12px" }} onClick={() => act("clear_winner")}>Limpar</button>
              </div>
            )}

            <div style={s.card}>
              <div style={{ fontWeight: 700, marginBottom: 14 }}>Viewers cadastrados</div>
              {!vList.length && <div style={{ color: "#ADADB8", textAlign: "center", padding: "20px 0" }}>Nenhum viewer ainda.</div>}
              {vList.map(v => {
                const days = uniqueDays(v.sessions).length;
                const mins = calcMins(v.sessions);
                const ok = isEligible(v);
                const hasToday = v.sessions.some(s => s.date === state?.liveDate);
                return (
                  <div key={v.nick} style={{ borderBottom: "1px solid #26262C22", padding: "9px 0", display: "grid", gridTemplateColumns: "1fr 56px 56px 80px auto 28px", gap: 8, alignItems: "center", fontSize: 12 }}>
                    <span style={{ fontWeight: 700 }}>{v.nick}</span>
                    <span style={{ color: days >= MIN_DAYS ? "#00C853" : "#ADADB8" }}>{days}/{MIN_DAYS}d</span>
                    <span style={{ color: mins >= MIN_MINS ? "#00C853" : "#ADADB8" }}>{mins}min</span>
                    <span style={s.badge(ok)}>{ok ? "elegível" : "pendente"}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {state?.liveActive && hasToday ? [15,30,60].map(m => (
                        <button key={m} style={{ ...s.btnGhost, padding: "3px 7px", fontSize: 11 }} onClick={() => addTime(v.nick, m)} disabled={acting}>+{m}</button>
                      )) : <span style={{ color: "#ADADB8" }}>{state?.liveActive ? "sem checkin" : "—"}</span>}
                    </div>
                    <button onClick={() => { if (window.confirm(`Deletar ${v.nick}?`)) act("delete_viewer", { nick: v.nick }); }} disabled={acting} style={{ background: "none", border: "none", cursor: "pointer", color: "#FF474788", fontSize: 15, padding: 0, lineHeight: 1 }} title="Deletar viewer">✕</button>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...s.btnGhost, color: "#FF4747", borderColor: "#FF474744", flex: 1 }} onClick={resetAll} disabled={acting}>Resetar tudo</button>
              <button style={s.btnGhost} onClick={() => setStreamerUnlocked(false)}>Sair</button>
            </div>
          </>}
        </>}
      </div>

      {flashMsg && <div style={{ ...s.flash, background: flashColor, color: "#fff" }}>{flashMsg}</div>}
    </div>
  );
}
