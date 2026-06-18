import { useState, useEffect, useCallback, useRef } from "react";

const PASS = "3n@2ysxk";
const API = "/api/state";
const CLIENT_ID = "bso3queqhjj7epoc18d9tfomtmthbm";
const REDIRECT_URI = "https://sorteio-twitch.vercel.app";
const MIN_MINS_LIVE = 60;
const MIN_MINS_TOTAL = 480;

function calcMins(sessions) { return sessions.reduce((a, s) => a + (s.minutes || 0), 0); }
function uniqueDays(sessions) { return [...new Set(sessions.map(s => s.date))]; }
function isEligible(v) {
  return v.sessions.some(s => s.minutes >= MIN_MINS_LIVE) || calcMins(v.sessions) >= MIN_MINS_TOTAL;
}
function totalScore(v) { return uniqueDays(v.sessions).length * 20 + calcMins(v.sessions); }

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
  const [redeemedCode, setRedeemedCode] = useState(null);
  const [adminPrizeCode, setAdminPrizeCode] = useState(null);
  const [streamerToken, setStreamerToken] = useState('');
  const [streamerTwitchId, setStreamerTwitchId] = useState('');
  const [botActive, setBotActive] = useState(false);
  const botTimerRef = useRef(null);
  const [spinSecs, setSpinSecs] = useState(8);

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
    if (t && id) { setStreamerToken(t); setStreamerTwitchId(id); }
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
      localStorage.setItem('bot_token', token);
      localStorage.setItem('bot_uid', u.id);
      setTab("streamer");
      flash(`Bot conectado como @${u.login}! Entre com a senha para continuar.`, "#00C853");
    } catch { flash("Erro ao conectar bot Twitch.", "#FF4747"); }
  }

  function loginStreamerBot() {
    const p = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "token",
      scope: "user:write:chat user:read:chat channel:read:subscriptions",
      state: "streamer",
    });
    window.location.href = `https://id.twitch.tv/oauth2/authorize?${p}`;
  }

  async function sendBotMessage() {
    if (!streamerToken || !streamerTwitchId) return;
    try {
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
      await fetch("/api/twitch-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: streamerToken, broadcaster_id: streamerTwitchId, user_id: streamerTwitchId }),
      });
    } catch {}
  }

  function startBot() {
    sendBotMessage();
    subscribeEventSub();
    botTimerRef.current = setInterval(sendBotMessage, 15 * 60 * 1000);
    setBotActive(true);
    flash("Bot iniciado! Mensagem enviada no chat. 🤖", "#00C853");
  }

  function stopBot() {
    clearInterval(botTimerRef.current);
    botTimerRef.current = null;
    setBotActive(false);
  }

  function disconnectBot() {
    stopBot();
    setStreamerTwitchId('');
    setStreamerToken('');
    localStorage.removeItem('bot_token');
    localStorage.removeItem('bot_uid');
  }

  async function doCheckin() {
    if (!twitchUser) return flash("Faça login com Twitch primeiro!", "#FF4747");
    const res = await act("checkin", { twitch_id: twitchUser.id });
    if (res.ok) flash("Check-in feito! ✅", "#00C853");
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

  const vList = state ? Object.values(state.viewers).sort((a, b) => totalScore(b) - totalScore(a)) : [];
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
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0E0E10; overscroll-behavior: none; }
        .app { min-height: 100dvh; background: #0E0E10; color: #EFEFF1; font-family: 'Inter', system-ui, sans-serif; font-size: 14px; }
        .splash { min-height: 100dvh; background: #0E0E10; display: flex; align-items: center; justify-content: center; color: #9146FF; gap: 12px; font-size: 16px; font-family: system-ui; }
        .navbar { background: #18181B; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 0 #9146FF44, 0 4px 32px rgba(145,70,255,0.12); }
        .navbar-top { display: flex; align-items: center; padding: 0 16px; height: 56px; gap: 12px; }
        .logo-badge { background: linear-gradient(135deg, #9146FF 0%, #5B1A99 100%); border-radius: 9px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 0 12px #9146FF55; }
        .logo-text { line-height: 1; }
        .logo-name { font-weight: 900; font-size: 15px; color: #EFEFF1; letter-spacing: -.3px; }
        .logo-sub { font-size: 9px; color: #9146FF; letter-spacing: 1.8px; text-transform: uppercase; font-weight: 700; margin-top: 2px; }
        .navbar-nav { display: none; }
        .nav-item { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; color: #ADADB8; background: none; border: none; cursor: pointer; transition: color .15s, background .15s; white-space: nowrap; }
        .nav-item:hover { color: #EFEFF1; background: #26262C; }
        .nav-item.active { color: #9146FF; background: #9146FF18; }
        .live-pill { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; padding: 5px 11px; border-radius: 20px; border: 1px solid; white-space: nowrap; }
        .navbar-tabs { display: flex; overflow-x: auto; scrollbar-width: none; border-top: 1px solid #26262C; }
        .navbar-tabs::-webkit-scrollbar { display: none; }
        .nav-tab { flex: 1; min-width: 72px; padding: 11px 8px; font-size: 12px; font-weight: 700; color: #ADADB8; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap; transition: color .15s; letter-spacing: .3px; }
        .nav-tab.active { color: #9146FF; border-bottom-color: #9146FF; }
        @media (min-width: 768px) {
          .navbar-top { padding: 0 32px; height: 62px; max-width: 1100px; margin: 0 auto; }
          .navbar-nav { display: flex; align-items: center; gap: 4px; margin-left: 24px; flex: 1; }
          .navbar-tabs { display: none; }
          .navbar > .navbar-top { max-width: unset; }
        }
        .body { padding: 14px; max-width: 600px; margin: 0 auto; padding-bottom: 32px; }
        @media (min-width: 768px) { .body { max-width: 900px; padding: 24px 32px 48px; } }
        @media (min-width: 1200px) { .body { max-width: 1100px; } }
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
      `}</style>

      {/* Navbar */}
      <div className="navbar">
        <div className="navbar-top">
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div className="logo-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28H17v4.28h-1.43M7 2L3.43 5.57v12.86h4.28V22l3.58-3.57h2.85L20.57 12V2m-1.43 9.29l-2.85 2.85h-2.86l-2.5 2.5v-2.5H7.71V3.43z"/></svg>
            </div>
            <div className="logo-text">
              <div className="logo-name">Area do Tailung</div>
              <div className="logo-sub">Sorteio</div>
            </div>
          </div>

          {/* Nav inline — desktop only */}
          <nav className="navbar-nav">
            {[["home","Início"],["viewer","Participar"],["ranking","Ranking"],["streamer","Streamer"]].map(([id,label]) => (
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
          {[["home","Início"],["viewer","Participar"],["ranking","Ranking"],["streamer","Streamer"]].map(([id,label]) => (
            <button key={id} className={`nav-tab${tab===id?" active":""}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="body">

        {/* HOME */}
        {tab === "home" && <div className="fade-up">
          <div className="card">
            <div className="grid3">
              <div className="stat-box">
                <div className="stat-val" style={{ color: "#9146FF" }}>{vList.length}</div>
                <div className="stat-lbl">Galera do Tailung</div>
              </div>
              <div className="stat-box">
                <div className="stat-val" style={{ color: "#00C853" }}>{eligCount}</div>
                <div className="stat-lbl">Elegíveis</div>
              </div>
              <div className="stat-box">
                <div className="stat-val" style={{ color: "#FFB347" }}>{Math.floor(vList.reduce((a,v)=>a+calcMins(v.sessions),0)/60)}h</div>
                <div className="stat-lbl">Total horas</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ borderColor: state?.liveActive ? "#00C85344" : "#26262C", textAlign: "center", padding: "22px 16px" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>{state?.liveActive ? "🔴" : "⚫"}</div>
            <div style={{ fontWeight: 800, fontSize: 17, color: state?.liveActive ? "#00C853" : "#ADADB8" }}>
              {state?.liveActive ? "Live acontecendo agora!" : "Nenhuma live no momento"}
            </div>
            {state?.liveActive && <div style={{ fontSize: 12, color: "#ADADB8", marginTop: 6 }}>Vai na aba Participar e faz seu check-in!</div>}
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden", borderColor: "#9146FF55" }}>
            <div style={{ background: "linear-gradient(135deg, #1a0533 0%, #2d1060 100%)", padding: "14px 16px 10px", borderBottom: "1px solid #9146FF33" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9146FF", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>🎁 Prêmio Semanal</div>
            </div>
            <img
              src="/premio.png"
              alt="Prêmio Semanal"
              className="prize-img"
              style={{ width: "100%", height: "auto", display: "block" }}
              onError={e => { e.target.style.display = "none"; }}
            />
          </div>

          <div className="card">
            <div className="card-title">Como participar</div>
            {["Entre na aba Participar e conecte sua conta Twitch","Faça check-in em cada live que você assistir","Acumule 1h em qualquer live ou 8h no total da semana para entrar no sorteio"].map((txt, i) => (
              <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
                <div className="step-num">{i+1}</div>
                <div style={{ fontSize: 13, color: "#ADADB8", lineHeight: 1.6, paddingTop: 2 }}>{txt}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ background: "#9146FF10", borderColor: "#9146FF33" }}>
            <div style={{ fontSize: 12, color: "#C9A7FF", lineHeight: 1.7 }}>
              <strong style={{ color: "#9146FF" }}>Regra do sorteio:</strong> Acumule <strong>1 hora em qualquer live</strong> (mesmo que seja de forma picada) ou <strong>8 horas no total</strong> entre todas as lives da semana para se tornar elegível.
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
              {redeemedCode ? (
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
              <div className="card">
                <div className="row" style={{ marginBottom: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#9146FF22", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#9146FF", fontSize: 20, flexShrink: 0 }}>{twitchUser.display_name[0].toUpperCase()}</div>
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
              {myViewer && <ViewerCard v={myViewer} vList={vList} />}
            </>
          )}
        </div>}

        {/* RANKING */}
        {tab === "ranking" && <div className="fade-up">
          <div className="card">
            <div className="card-title">Ranking semanal</div>
            {!vList.length && <div style={{ color: "#ADADB8", textAlign: "center", padding: "30px 0", fontSize: 13 }}>Nenhum viewer ainda.</div>}
            {vList.map((v, i) => {
              const score = totalScore(v);
              const maxScore = totalScore(vList[0]) || 1;
              const ok = isEligible(v);
              const medals = ["🥇","🥈","🥉"];
              return (
                <div key={v.twitch_id || v.nick} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: i < vList.length-1 ? "1px solid #26262C22" : "none", alignItems: "center" }}>
                  <div style={{ width: 26, textAlign: "center", fontWeight: 700, color: i < 3 ? ["#FFD700","#C0C0C0","#CD7F32"][i] : "#ADADB8", fontSize: i < 3 ? 18 : 13 }}>{i < 3 ? medals[i] : `#${i+1}`}</div>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#9146FF22", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#9146FF", fontSize: 14, flexShrink: 0 }}>{(v.display_name || v.nick)[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.display_name || v.nick}</span>
                      <span className={`badge ${ok?"badge-ok":"badge-pend"}`}>{ok ? "elegível" : "pendente"}</span>
                      {v.hasSub && <span className="badge" style={{ background: "#FF69B415", color: "#FF69B4" }}>★ sub</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#ADADB8", marginBottom: 4 }}>{uniqueDays(v.sessions).length} lives · {Math.floor(calcMins(v.sessions)/60)}h{calcMins(v.sessions)%60}m · <strong style={{ color: "#9146FF" }}>{score} pts</strong></div>
                    <div className="prog-wrap"><div className="prog-bar" style={{ width: `${Math.round(score/maxScore*100)}%`, background: i === 0 ? "#FFD700" : "#9146FF" }} /></div>
                  </div>
                </div>
              );
            })}
          </div>
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
              {[["live","Live"],["ciclo","Ciclo"],["viewers","Viewers"],["premio","Prêmio"],["historico","Histórico"]].map(([id,label]) => (
                <button key={id} className={`admin-tab${adminTab===id?" active":""}`} onClick={() => setAdminTab(id)}>{label}</button>
              ))}
            </div>

            {/* ADMIN: LIVE */}
            {adminTab === "live" && <>
              <div className="grid2">
                <div className="card">
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Status da live</div>
                  <div style={{ fontSize: 12, color: "#ADADB8", marginBottom: 14 }}>{state?.liveActive ? `Aberta — ${formatDate(state.liveDate)}` : "Offline"}</div>
                  <button className={`btn btn-full${state?.liveActive?" btn-red":""}`} style={!state?.liveActive?{background:"#00C853"}:{}} onClick={toggleLive} disabled={acting}>
                    {state?.liveActive ? "⏹ Encerrar live" : "▶ Abrir live"}
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
                <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  🤖 Bot do Chat
                  {botActive && <span style={{ fontSize: 11, color: "#00C853", background: "#00C85318", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>● ATIVO</span>}
                </div>
                {!streamerTwitchId ? (
                  <>
                    <div style={{ fontSize: 12, color: "#ADADB8", marginBottom: 12, lineHeight: 1.7 }}>
                      Conecte sua conta Twitch para o bot postar <strong style={{ color: "#EFEFF1" }}>#tailung</strong> no chat a cada 15min. Viewers que responderem ganham +15min automaticamente.
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
                        ? "Bot ativo: postando #tailung no chat a cada 15min e somando tempo automaticamente."
                        : "Bot pronto. Inicie para postar no chat a cada 15min e capturar as respostas dos viewers."}
                    </div>
                    <div className="row">
                      {!botActive
                        ? <button className="btn btn-green btn-full" onClick={startBot} disabled={!state?.liveActive}>▶ Iniciar Bot</button>
                        : <button className="btn btn-red btn-full" onClick={stopBot}>⏹ Parar Bot</button>}
                      <button className="btn-ghost" onClick={disconnectBot} style={{ whiteSpace: "nowrap" }}>Desconectar</button>
                    </div>
                    {!state?.liveActive && !botActive && <div style={{ fontSize: 11, color: "#ADADB8", marginTop: 8 }}>Abra a live para ativar o bot.</div>}
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
              <div className="card">
                <div className="card-title">Viewers cadastrados</div>
                {!vList.length && <div style={{ color: "#ADADB8", textAlign: "center", padding: "20px 0", fontSize: 13 }}>Nenhum viewer ainda.</div>}
                {vList.map(v => {
                  const days = uniqueDays(v.sessions).length;
                  const mins = calcMins(v.sessions);
                  const ok = isEligible(v);
                  const hasToday = v.sessions.some(s => s.date === state?.liveDate);
                  return (
                    <div key={v.twitch_id || v.nick} className="viewer-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.display_name || v.nick}</div>
                        <div style={{ fontSize: 11, color: "#ADADB8", marginTop: 2 }}>{days} lives · {Math.floor(mins/60)}h{mins%60}m · <span className={`badge ${ok?"badge-ok":"badge-pend"}`}>{ok?"elegível":"pendente"}</span>{v.hasSub && <span className="badge" style={{ background: "#FF69B415", color: "#FF69B4", marginLeft: 4 }}>★ sub</span>}</div>
                      </div>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
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
              <div className="card">
                <div className="card-title">🎁 Configurar prêmio</div>
                {state?.prize ? (
                  <>
                    <div style={{ background: state.prize.redeemed ? "#00C85315" : state.prize.enabled ? "#9146FF15" : "#26262C", border: `1px solid ${state.prize.redeemed ? "#00C85344" : state.prize.enabled ? "#9146FF44" : "#3D3D47"}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{state.prize.display_name}</div>
                      <div style={{ fontSize: 12, color: "#ADADB8", marginBottom: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        Código:&nbsp;
                        {adminPrizeCode
                          ? <span style={{ background: "#26262C", borderRadius: 6, padding: "3px 10px", color: "#9146FF", fontWeight: 800, letterSpacing: 1, wordBreak: "break-all" }}>{adminPrizeCode}</span>
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
                  </>
                ) : (
                  <>
                    <span className="label">Vencedor</span>
                    <select className="inp" style={{ marginBottom: 10, cursor: "pointer" }} value={prizeWinnerId} onChange={e => setPrizeWinnerId(e.target.value)}>
                      <option value="">Selecione o viewer...</option>
                      {vList.map(v => <option key={v.twitch_id || v.nick} value={v.twitch_id || v.nick}>{v.display_name || v.nick}</option>)}
                    </select>
                    <span className="label">Código do Gift Card</span>
                    <input className="inp" style={{ marginBottom: 14 }} placeholder="ex: XXXX-XXXX-XXXX-XXXX" value={prizeGiftcard} onChange={e => setPrizeGiftcard(e.target.value)} />
                    <button className="btn btn-full" onClick={savePrize} disabled={acting}>💾 Salvar prêmio</button>
                    <div style={{ fontSize: 11, color: "#ADADB8", marginTop: 10, lineHeight: 1.6 }}>O código fica oculto até o viewer resgatar. Você habilita o resgate quando quiser.</div>
                  </>
                )}
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
          </>}
        </div>}
      </div>

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
  const bestLive = Math.max(0, ...v.sessions.map(s => s.minutes));
  const history = v.history || [];

  const now = new Date().toISOString().slice(0, 7);
  const monthHistory = history.filter(h => (h.cycleEnd || "").slice(0, 7) === now);

  return (
    <div className="card fade-up" style={{ borderColor: ok ? "#00C85344" : "#9146FF33" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#9146FF22", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#9146FF", fontSize: 16 }}>{(v.display_name || v.nick)[0].toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{v.display_name || v.nick}</div>
          <div style={{ fontSize: 11, color: "#ADADB8" }}>#{rank} no ranking · {totalScore(v)} pts · código: <strong style={{ color: "#9146FF" }}>{v.code}</strong></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          <span className={`badge ${ok?"badge-ok":"badge-pend"}`}>{ok ? "Elegível ✓" : "Pendente"}</span>
          {v.hasSub && <span className="badge" style={{ background: "#FF69B415", color: "#FF69B4" }}>★ Inscrito</span>}
        </div>
      </div>

      {/* mini tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["semana","Semana atual"],["mensal","Este mês"],["historico","Histórico"]].map(([id,lbl]) => (
          <button key={id} onClick={() => setHistTab(id)} style={{ padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none", background: histTab===id?"#9146FF":"#26262C", color: histTab===id?"#fff":"#ADADB8" }}>{lbl}</button>
        ))}
      </div>

      {/* Semana atual */}
      {histTab === "semana" && <>
        <div className="grid2" style={{ marginBottom: 12 }}>
          <div>
            <span className="label">melhor live</span>
            <div style={{ fontWeight: 800, fontSize: 22, color: bestLive >= MIN_MINS_LIVE ? "#00C853" : "#9146FF" }}>{Math.floor(bestLive/60)}h{bestLive%60}m</div>
            <div className="prog-wrap"><div className="prog-bar" style={{ width: `${Math.min(100, bestLive/MIN_MINS_LIVE*100)}%`, background: bestLive >= MIN_MINS_LIVE ? "#00C853" : "#9146FF" }} /></div>
            <div style={{ fontSize: 10, color: "#ADADB8", marginTop: 2 }}>meta: 1h por live</div>
          </div>
          <div>
            <span className="label">total semana</span>
            <div style={{ fontWeight: 800, fontSize: 22, color: mins >= MIN_MINS_TOTAL ? "#00C853" : "#9146FF" }}>{Math.floor(mins/60)}h{mins%60}m</div>
            <div className="prog-wrap"><div className="prog-bar" style={{ width: `${Math.min(100, mins/MIN_MINS_TOTAL*100)}%`, background: mins >= MIN_MINS_TOTAL ? "#00C853" : "#9146FF" }} /></div>
            <div style={{ fontSize: 10, color: "#ADADB8", marginTop: 2 }}>meta: 8h no total</div>
          </div>
        </div>
        {v.sessions.length > 0 && (
          <div style={{ background: "#26262C", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: "#ADADB8", fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>Check-ins desta semana</div>
            {v.sessions.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: i < v.sessions.length-1 ? "1px solid #3D3D4722" : "none" }}>
                <span style={{ color: "#EFEFF1" }}>📅 {formatDate(s.date)}</span>
                <span style={{ fontWeight: 700, color: s.minutes >= MIN_MINS_LIVE ? "#00C853" : "#9146FF" }}>{Math.floor(s.minutes/60)}h{s.minutes%60}m {s.minutes >= MIN_MINS_LIVE ? "✓" : ""}</span>
              </div>
            ))}
          </div>
        )}
        {v.sessions.length === 0 && <div style={{ fontSize: 12, color: "#ADADB8", textAlign: "center", padding: "10px 0" }}>Nenhum check-in nesta semana ainda.</div>}
        {ok && <div style={{ marginTop: 12, background: "#00C85315", borderRadius: 10, padding: "10px 14px", color: "#00C853", fontWeight: 700, textAlign: "center", fontSize: 13 }}>🎉 Você está na urna do sorteio!</div>}
      </>}

      {/* Este mês */}
      {histTab === "mensal" && <>
        {monthHistory.length === 0 && <div style={{ fontSize: 12, color: "#ADADB8", textAlign: "center", padding: "16px 0" }}>Nenhum ciclo encerrado este mês.</div>}
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
