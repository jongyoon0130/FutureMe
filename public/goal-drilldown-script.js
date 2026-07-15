/* goal-drilldown-concept.html companion script — mirrors app v3 hierarchy */
const CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12l5 5L20 7"/></svg>`;
const DOW = ["일","월","화","수","목","금","토"];
const uid = () => "g_" + Math.random().toString(36).slice(2, 9);
const item = (text, done = false) => ({ id: uid(), text, done });
const DAY_ONLY_MAX = 10;

function parseIso(iso) { return new Date(iso + "T12:00:00"); }
function fmtShort(d) { return `${d.getMonth()+1}/${d.getDate()}`; }
function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function monthLabel(key) { const [y,m]=key.split("-"); return `${y}년 ${Number(m)}월`; }
function addDays(d,n) { const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfWeekMon(d) { const x=new Date(d); x.setHours(12,0,0,0); x.setDate(x.getDate()-((x.getDay()+6)%7)); return x; }
function isWithin(a,s,e) { return a>=s && a<=e; }

function buildTimeline(start, end) {
  const s=new Date(start); s.setHours(12,0,0,0);
  const e=new Date(end); e.setHours(12,0,0,0);
  const today=new Date(); today.setHours(12,0,0,0);
  const flatDays=[];
  for(let d=new Date(s); d<=e; d=addDays(d,1))
    flatDays.push({ date:new Date(d), dateLabel:fmtShort(d), dayOfWeek:DOW[d.getDay()], isToday:d.getTime()===today.getTime() });
  const monthKeys=[];
  let cur=new Date(s.getFullYear(),s.getMonth(),1,12,0,0);
  const last=new Date(e.getFullYear(),e.getMonth(),1,12,0,0);
  while(cur<=last){ monthKeys.push(monthKey(cur)); cur=new Date(cur.getFullYear(),cur.getMonth()+1,1,12,0,0); }
  const weeks=[]; let ws=startOfWeekMon(s); let gi=0;
  while(ws<=e){
    const we=addDays(ws,6); const days=[];
    for(let i=0;i<7;i++){ const d=addDays(ws,i); if(isWithin(d,s,e)) days.push({ date:d, dateLabel:fmtShort(d), dayOfWeek:DOW[d.getDay()], isToday:d.getTime()===today.getTime() }); }
    if(days.length){
      gi++;
      const mk=monthKeys.filter(k=>{ const [y,m]=k.split("-").map(Number); const ms=new Date(y,m-1,1,12,0,0); const me=new Date(y,m,0,12,0,0); return ws<=me && we>=ms; });
      weeks.push({ globalIndex:gi, dateLabel:`${days[0].dateLabel} – ${days[days.length-1].dateLabel}`, monthKeys:mk, days });
    }
    ws=addDays(ws,7);
  }
  return { start:s, end:e, daysTotal:flatDays.length, monthKeys, weeks, flatDays };
}

function detectHorizon(deadline) {
  const s=new Date(); s.setHours(12,0,0,0);
  const t=buildTimeline(s, parseIso(deadline));
  if(t.daysTotal<=DAY_ONLY_MAX) return "day-only";
  if(t.monthKeys.length>=2) return "month-week-day";
  return "week-day";
}

function getHorizonMeta(deadline) {
  const s=new Date(); s.setHours(12,0,0,0);
  const end=parseIso(deadline);
  const t=buildTimeline(s,end);
  const hz=detectHorizon(deadline);
  const range=`${fmtShort(s)} – ${fmtShort(end)} · ${t.daysTotal}일`;
  const hints={ "day-only":`${t.daysTotal}일 — 1.5주 미만, 일별만`, "week-day":`${t.daysTotal}일 · ${t.weeks.length}주`, "month-week-day":`${t.daysTotal}일 · ${t.monthKeys.length}개월 · ${t.weeks.length}주` };
  const steps= hz==="day-only"?["c1","c4"]: hz==="month-week-day"?["c1","c2","c4"]:["c1","c3","c4"];
  return { horizon:hz, ...t, rangeLabel:range, hint:hints[hz], steps };
}

function buildEmptyGoal(title, deadline) {
  const s=new Date(); s.setHours(12,0,0,0);
  const end=parseIso(deadline);
  const meta=getHorizonMeta(deadline);
  const weeks=meta.weeks.map(w=>({
    id:uid(), globalIndex:w.globalIndex, label:`W${w.globalIndex}`, dateLabel:w.dateLabel, monthKeys:w.monthKeys,
    focus:"", items:[item("")],
    days:w.days.map(d=>({ id:uid(), dateLabel:d.dateLabel, dayOfWeek:d.dayOfWeek, focus:d.isToday?"오늘":"", isToday:d.isToday, items:d.isToday?[item("")]:[] }))
  }));
  const months=meta.monthKeys.map(k=>({ id:uid(), key:k, label:monthLabel(k), focus:"", items:[item("")] }));
  const days=meta.flatDays.map(d=>({ id:uid(), dateLabel:d.dateLabel, dayOfWeek:d.dayOfWeek, focus:d.isToday?"오늘":"", isToday:d.isToday, items:d.isToday?[item("")]:[] }));
  const cw=weeks.find(w=>w.days.some(d=>d.isToday))||weeks[0];
  return { id:uid(), title, deadline, horizon:meta.horizon, rangeLabel:meta.rangeLabel, focus:"", startDate:s.toISOString().slice(0,10), months, weeks, days, currentWeekId:cw?.id||"" };
}

const GOALS = {};
(function initSamples(){
  const app=buildEmptyGoal("iOS 앱 스토어 첫 출시","2026-09-15");
  app.id="app"; app.focus="핵심 기능 + TestFlight";
  if(app.months[0]){ app.months[0].focus="핵심 기능 완성 + TestFlight"; app.months[0].items=[item("TestFlight 배포"),item("QA 통과")]; }
  const w2=app.weeks.find(w=>w.globalIndex===2)||app.weeks[1];
  if(w2){ w2.focus="온보딩 + 크래시 Top 5"; w2.items=[item("온보딩"),item("크래시 Top5",true)]; app.currentWeekId=w2.id;
    const td=w2.days.find(d=>d.isToday)||w2.days[0];
    if(td){ td.focus="크래시·온보딩"; td.items=[item("크래시 로그"),item("온보딩 카피"),item("TestFlight",true)]; }
  }
  GOALS.app=app;

  const short=buildEmptyGoal("포트폴리오 3개 제출","2026-07-24");
  short.id="short"; short.focus="포트폴리오 3개";
  short.days.forEach((d,i)=>{ if(i===0)d.items=[item("Behance")]; if(d.isToday){ d.focus="오늘"; d.items=[item("케이스2"),item("케이스3")]; } });
  GOALS.short=short;
})();

let nav={ stack:["screen-home"], goalId:null, monthId:null, weekId:null, dayId:null };
let wizard={ draft:null, steps:[], stepIdx:0 };

function toast(m){ const t=document.getElementById("toast"); t.textContent=m; t.classList.add("show"); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove("show"),1500); }
const SCREENS=["screen-home","screen-c1","screen-c2","screen-c3","screen-c4","screen-root","screen-month","screen-week","screen-day"];
function updateScreens(){
  const cur=nav.stack.at(-1);
  SCREENS.forEach(id=>{ const el=document.getElementById(id); el.classList.remove("active","behind"); if(id===cur)el.classList.add("active"); else if(SCREENS.indexOf(id)<SCREENS.indexOf(cur))el.classList.add("behind"); });
  document.getElementById("fab").classList.toggle("hidden",cur!=="screen-home");
}
function push(id){ nav.stack.push(id); updateScreens(); }
function pop(){ if(nav.stack.length<=1)return; nav.stack.pop(); updateScreens(); if(nav.stack.at(-1)==="screen-home")renderHome(); }

function pct(items){ if(!items?.length)return 0; return Math.round(items.filter(i=>i.done).length/items.length*100); }
function countStr(items){ const d=items?.filter(i=>i.done).length||0; return `${d}/${items?.length||0}`; }
function getGoal(id){ return GOALS[id]; }
function getWeek(g){ return g.weeks?.find(w=>w.id===g.currentWeekId)||g.weeks?.[0]; }
function getToday(g){
  if(g.horizon==="day-only") return g.days?.find(d=>d.isToday)||g.days?.[0];
  for(const w of g.weeks||[]) { const t=w.days.find(d=>d.isToday); if(t)return t; }
  return getWeek(g)?.days?.[0];
}
function weeksForMonth(g, key){ return (g.weeks||[]).filter(w=>w.monthKeys.includes(key)); }

function allItems(g){
  const arrs=[...(g.months||[]).flatMap(m=>m.items), ...(g.weeks||[]).flatMap(w=>[...w.items,...w.days.flatMap(d=>d.items)]), ...(g.days||[]).flatMap(d=>d.items)];
  return arrs;
}

function renderChecklist(el,items,onToggle){
  el.innerHTML=(items||[]).filter(it=>it.text?.trim()||it.label?.trim()).map(it=>{
    const txt=it.text||it.label;
    return `<div class="chk-row ${it.done?"done":""}" data-id="${it.id}"><button type="button" class="chk" data-toggle>${CHECK}</button><div class="chk-body"><span class="txt">${txt}</span></div></div>`;
  }).join("")||`<p style="font-size:13px;color:var(--muted);padding:8px">항목 없음</p>`;
  el.querySelectorAll("[data-toggle]").forEach(btn=>btn.addEventListener("click",()=>onToggle(btn.closest(".chk-row").dataset.id)));
}

function toggleItem(id){
  for(const g of Object.values(GOALS)){
    const it=allItems(g).find(x=>x.id===id);
    if(it){ it.done=!it.done; break; }
  }
  renderHome(); toast("저장됐어요");
}

function renderHome(){
  const daily=[],weekly=[],monthly=[];
  const curMonth=monthKey(new Date());
  Object.values(GOALS).forEach(g=>{
    if(g.horizon==="month-week-day"){ const m=g.months.find(x=>x.key===curMonth)||g.months[0]; m?.items.filter(i=>i.text.trim()).forEach(it=>monthly.push({...it,goalId:g.id,goalName:g.title})); }
    if(g.horizon!=="day-only") getWeek(g)?.items.filter(i=>i.text.trim()).forEach(it=>weekly.push({...it,goalId:g.id,goalName:g.title}));
    getToday(g)?.items.filter(i=>i.text.trim()).forEach(it=>daily.push({...it,goalId:g.id,goalName:g.title}));
  });
  const tiers=[
    {id:"inDaily",list:daily,count:"cDaily",sec:"secDaily"},
    {id:"inWeekly",list:weekly,count:"cWeekly",sec:"secWeekly"},
    {id:"inMonthly",list:monthly,count:"cMonthly",sec:"secMonthly"},
  ];
  tiers.forEach(({id,list,count,sec})=>{
    const secEl=document.getElementById(sec);
    if(secEl) secEl.style.display=list.length?"":"none";
    if(!list.length){ document.getElementById(id).innerHTML=""; document.getElementById(count).textContent="0/0"; return; }
    const el=document.getElementById(id);
    el.innerHTML=list.map(it=>`
      <div class="chk-row ${it.done?"done":""}"><button type="button" class="chk" data-id="${it.id}">${it.done?CHECK:""}</button>
      <div class="chk-body"><div class="chk-goal">${it.goalName}</div><span class="txt">${it.text}</span></div>
      <button type="button" class="chk-drill" data-g="${it.goalId}">›</button></div>`).join("");
    el.querySelectorAll(".chk").forEach(b=>b.addEventListener("click",()=>toggleItem(b.dataset.id)));
    el.querySelectorAll(".chk-drill").forEach(b=>b.addEventListener("click",()=>{ nav.stack=["screen-home"]; openRoot(b.dataset.g); }));
    document.getElementById(count).textContent=countStr(list);
  });
  const prog=countStr([...daily,...weekly,...monthly]);
  const now=new Date();
  document.getElementById("homeSub").innerHTML=`${now.getMonth()+1}월 ${now.getDate()}일 · <span id="homeProg">${prog}</span>`;
  const mc=document.getElementById("miniCal");
  if(mc){
    let h=["일","월","화","수","목","금","토"].map(d=>`<div class="mc" style="background:transparent;font-size:8px;color:var(--muted)">${d}</div>`).join("");
    const first=new Date(now.getFullYear(),now.getMonth(),1).getDay();
    for(let i=0;i<first;i++) h+=`<div class="mc" style="background:transparent"></div>`;
    const dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
    for(let d=1;d<=dim;d++) h+=`<div class="mc ${d===now.getDate()?"today":""}">${d}</div>`;
    mc.innerHTML=h;
    mc.previousElementSibling.textContent=`${now.getMonth()+1}월`;
  }
  document.getElementById("goalList").innerHTML=Object.values(GOALS).map(g=>`
    <button type="button" class="branch-row g" data-goal="${g.id}"><div class="branch-icon">🎯</div>
    <div class="branch-info"><strong>${g.title}</strong><span>${g.rangeLabel}</span></div><span class="chev">›</span></button>`).join("");
  document.querySelectorAll("[data-goal]").forEach(b=>b.addEventListener("click",()=>{ nav.stack=["screen-home"]; openRoot(b.dataset.goal); }));
}

function openRoot(goalId){
  nav.goalId=goalId; const g=getGoal(goalId);
  document.getElementById("rootTitle").textContent=g.title;
  document.getElementById("rootSub").textContent=g.rangeLabel;
  document.getElementById("rootCrumb").textContent=g.title.slice(0,14);
  const list=document.getElementById("rootList");
  const lbl=document.getElementById("rootListLabel");
  if(g.horizon==="day-only"){
    lbl.textContent="일별 · 탭해서 들어가기";
    list.innerHTML=g.days.map(d=>branchDay(d,g)).join("");
    list.querySelectorAll("[data-day]").forEach(b=>b.addEventListener("click",()=>openDay(b.dataset.day,null)));
  } else if(g.horizon==="month-week-day"){
    lbl.textContent="월간 · 탭하면 주차";
    list.innerHTML=g.months.map(m=>`
      <button type="button" class="branch-row g" data-month="${m.id}">
        <div class="branch-icon">${m.label.replace(/[^0-9]/g,"").slice(-2)||"M"}</div>
        <div class="branch-info"><strong>${m.focus||m.label}</strong><span>${weeksForMonth(g,m.key).length}주</span></div>
        <span class="branch-pct">${pct(m.items)}%</span><span class="chev">›</span></button>`).join("");
    list.querySelectorAll("[data-month]").forEach(b=>b.addEventListener("click",()=>openMonthNode(b.dataset.month)));
  } else {
    lbl.textContent="주간 · W# · 날짜";
    list.innerHTML=g.weeks.map(w=>branchWeek(w,g)).join("");
    list.querySelectorAll("[data-week]").forEach(b=>b.addEventListener("click",()=>openWeek(b.dataset.week)));
  }
  if(nav.stack.at(-1)!=="screen-root") push("screen-root"); else updateScreens();
}

function branchWeek(w,g){
  return `<button type="button" class="branch-row w" data-week="${w.id}"><div class="branch-icon">${w.globalIndex}</div>
    <div class="branch-info"><strong>${w.focus||w.label}</strong><span>${w.label} · ${w.dateLabel}${w.id===g.currentWeekId?" · 진행 중":""}</span></div>
    <span class="branch-pct">${pct(w.items)}%</span><span class="chev">›</span></button>`;
}
function branchDay(d,g){
  return `<button type="button" class="branch-row d" data-day="${d.id}"><div class="branch-icon">${d.dateLabel.split("/")[1]||"·"}</div>
    <div class="branch-info"><strong>${d.dayOfWeek} · ${d.focus||d.dateLabel}</strong><span>${pct(d.items)}%${d.isToday?" · 오늘":""}</span></div><span class="chev">›</span></button>`;
}

function openMonthNode(monthId){
  nav.monthId=monthId; const g=getGoal(nav.goalId); const m=g.months.find(x=>x.id===monthId);
  document.getElementById("mCrumb").textContent=m.label;
  document.getElementById("mFocus").textContent=m.focus||"(목표 입력)";
  document.getElementById("mPct").textContent=pct(m.items)+"%";
  document.getElementById("mRing").style.setProperty("--pct",pct(m.items)+"%");
  document.getElementById("mProgSub").textContent=`${weeksForMonth(g,m.key).length}주 · 겹치는 주는 양쪽 달에 표시`;
  renderChecklist(document.getElementById("mChecklist"),m.items,id=>{ m.items.find(x=>x.id===id).done^=1; openMonthNode(monthId); renderHome(); });
  document.getElementById("mWeeks").innerHTML=weeksForMonth(g,m.key).map(w=>branchWeek(w,g)).join("");
  document.querySelectorAll("#mWeeks [data-week]").forEach(b=>b.addEventListener("click",()=>openWeek(b.dataset.week)));
  push("screen-month");
}

function openWeek(weekId){
  nav.weekId=weekId; const g=getGoal(nav.goalId); const w=g.weeks.find(x=>x.id===weekId);
  document.getElementById("wCrumb").textContent=`${w.label} · ${w.dateLabel}`;
  document.getElementById("wFocus").textContent=w.focus||"(주간 목표)";
  document.getElementById("wSub").textContent=`전체 ${w.label} · ${w.dateLabel}`;
  renderChecklist(document.getElementById("wChecklist"),w.items,id=>{ w.items.find(x=>x.id===id).done=!w.items.find(x=>x.id===id).done; openWeek(weekId); renderHome(); });
  document.getElementById("wDays").innerHTML=w.days.map(d=>branchDay(d,g)).join("");
  document.querySelectorAll("#wDays [data-day]").forEach(b=>b.addEventListener("click",()=>openDay(b.dataset.day,weekId)));
  push("screen-week");
}

function openDay(dayId, weekId){
  nav.dayId=dayId; nav.weekId=weekId; const g=getGoal(nav.goalId);
  const d= g.horizon==="day-only" ? g.days.find(x=>x.id===dayId) : g.weeks.find(w=>w.id===weekId)?.days.find(x=>x.id===dayId);
  const w=g.weeks?.find(x=>x.id===weekId);
  document.getElementById("dCrumb").textContent=`${d.dateLabel} · ${d.dayOfWeek}`;
  document.getElementById("dFocus").textContent=d.focus||d.dateLabel;
  document.getElementById("dSub").textContent=w?`${w.label} · ${w.dateLabel}`:"";
  renderChecklist(document.getElementById("dChecklist"),d.items,id=>{ d.items.find(x=>x.id===id).done=!d.items.find(x=>x.id===id).done; openDay(dayId,weekId); renderHome(); });
  push("screen-day");
}

function renderWizardLines(container,lines,onChange){
  container.innerHTML=lines.map((v,i)=>`<div class="edit-row"><input value="${(v||"").replace(/"/g,"&quot;")}" data-i="${i}" placeholder="체크리스트"/><button type="button" data-rm="${i}">×</button></div>`).join("");
  container.querySelectorAll("input").forEach(inp=>inp.addEventListener("input",()=>{ lines[Number(inp.dataset.i)]=inp.value; }));
  container.querySelectorAll("[data-rm]").forEach(btn=>btn.addEventListener("click",()=>{ lines.splice(Number(btn.dataset.rm),1); if(!lines.length)lines.push(""); onChange(); }));
}

function renderStepDots(containerId, steps, activeIdx){
  document.getElementById(containerId).innerHTML=steps.map((_,i)=>`<i class="${i===activeIdx?"on":""}"></i>`).join("");
}

function syncWizardDraft(deadline){
  wizard.draft=buildEmptyGoal(document.getElementById("wTitle").value.trim()||"새 목표", deadline);
  wizard.steps=getHorizonMeta(deadline).steps;
}

function renderMonthCards(){
  const el=document.getElementById("wMonthCards");
  el.innerHTML=wizard.draft.months.map((m,mi)=>`
    <div class="week-card"><strong>${m.label}</strong>
    <input class="month-focus" data-mi="${mi}" value="${(m.focus||"").replace(/"/g,"&quot;")}" placeholder="이번 달 목표" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:10px;margin:8px 0"/>
    <div class="month-items" data-mi="${mi}"></div></div>`).join("");
  wizard.draft.months.forEach((m,mi)=>{
    const box=el.querySelector(`.month-items[data-mi="${mi}"]`);
    const lines=m.items.map(i=>i.text||"");
    renderWizardLines(box,lines,()=>renderMonthCards());
    m.items=lines.map(t=>({id:uid(),text:t,done:false}));
  });
  el.querySelectorAll(".month-focus").forEach(inp=>inp.addEventListener("input",()=>{ wizard.draft.months[inp.dataset.mi].focus=inp.value; }));
}

function renderWeekCards(){
  const el=document.getElementById("wWeekCards");
  el.innerHTML=wizard.draft.weeks.map((w,wi)=>`
    <div class="week-card"><strong>${w.label} · ${w.dateLabel}</strong>
    <input class="week-focus" data-wi="${wi}" value="${(w.focus||"").replace(/"/g,"&quot;")}" placeholder="주간 포커스" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:10px;margin:8px 0"/>
    <div class="week-items" data-wi="${wi}"></div></div>`).join("");
  wizard.draft.weeks.forEach((w,wi)=>{
    const lines=w.items.map(i=>i.text||"");
    const box=el.querySelector(`.week-items[data-wi="${wi}"]`);
    renderWizardLines(box,lines,()=>renderWeekCards());
    w.items=lines.map(t=>({id:uid(),text:t,done:false}));
  });
  el.querySelectorAll(".week-focus").forEach(inp=>inp.addEventListener("input",()=>{ wizard.draft.weeks[inp.dataset.wi].focus=inp.value; }));
}

function renderDayCards(){
  const el=document.getElementById("wDayCards");
  const g=wizard.draft;
  if(g.horizon==="day-only"){
    el.innerHTML=g.days.map((d,di)=>dayCardHtml(d,di,true)).join("");
    bindDayCards(true);
  } else {
    const todayDays=g.weeks.flatMap(w=>w.days.filter(d=>d.isToday).map(d=>({w,d})));
    el.innerHTML=todayDays.map(({d},i)=>dayCardHtml(d,i,false)).join("");
    bindDayCards(false);
  }
}
function dayCardHtml(d,di,flat){
  return `<div class="week-card"><div class="week-card-head"><span style="font-size:12px;font-weight:700;width:56px">${d.dateLabel} ${d.dayOfWeek}</span>
  <input value="${(d.focus||"").replace(/"/g,"&quot;")}" data-di="${di}" placeholder="포커스" style="flex:1;border:1px solid var(--line);border-radius:10px;padding:8px"/>
  ${flat?`<button type="button" class="star-btn ${d.isToday?"on":""}" data-star="${di}">★</button>`:""}
  </div><div class="day-items" data-di="${di}"></div></div>`;
}
function bindDayCards(flat){
  const g=wizard.draft;
  const daysList= flat ? g.days : g.weeks.flatMap(w=>w.days.filter(d=>d.isToday));
  daysList.forEach((d,di)=>{
    const lines=d.items.map(i=>i.text||"");
    renderWizardLines(document.querySelector(`.day-items[data-di="${di}"]`), lines, ()=>renderDayCards());
    d.items=lines.map(t=>({id:uid(),text:t,done:false}));
  });
  document.querySelectorAll("[data-star]").forEach(btn=>btn.addEventListener("click",()=>{
    g.days.forEach((dd,j)=>dd.isToday=j===Number(btn.dataset.star));
    renderDayCards();
  }));
}

function startCreate(){
  document.getElementById("wTitle").value="";
  document.getElementById("wDeadline").value="";
  nav.stack=["screen-home"];
  push("screen-c1");
}

function saveWizard(){
  const title=document.getElementById("wTitle").value.trim();
  if(!title){ toast("최종 목표"); push("screen-c1"); return; }
  const g=wizard.draft; g.title=title; g.id=uid();
  const hasToday= g.horizon==="day-only"
    ? g.days.some(d=>d.isToday&&d.items.some(i=>i.text.trim()))
    : g.weeks.some(w=>w.days.some(d=>d.isToday&&d.items.some(i=>i.text.trim())));
  if(!hasToday){ toast("오늘(★) 체크리스트 1개 이상"); push("screen-c4"); return; }
  GOALS[g.id]=g;
  nav.stack=["screen-home"]; updateScreens(); renderHome(); toast("목표 만들어졌어요 🎉");
}

document.querySelectorAll("[data-back]").forEach(b=>b.addEventListener("click",pop));
document.getElementById("fab").addEventListener("click",startCreate);
function updateDeadlinePreview(){
  const dl=document.getElementById("wDeadline").value;
  if(!dl)return;
  const m=getHorizonMeta(dl);
  document.getElementById("horizonHint").textContent=m.hint;
  document.getElementById("horizonPreview").innerHTML=
    (m.horizon==="month-week-day"?`<div>· 월 ${m.monthKeys.length}칸</div>`:"")+
    (m.horizon!=="day-only"?`<div>· 주 W1–W${m.weeks.length}</div>`:"")+
    `<div>· 일 ${m.daysTotal}칸</div>`;
}
document.getElementById("wDeadline").addEventListener("input",updateDeadlinePreview);
document.getElementById("c1Next").addEventListener("click",()=>{
  if(!document.getElementById("wTitle").value.trim()){ toast("최종 목표"); return; }
  const dl=document.getElementById("wDeadline").value;
  if(!dl){ toast("마감"); return; }
  syncWizardDraft(dl);
  const next=wizard.steps[1];
  renderStepDots("c2Dots",wizard.steps,1);
  if(next==="c2"){ document.getElementById("c2Hint").textContent=`${wizard.draft.months.length}개월 칸`; renderMonthCards(); push("screen-c2"); }
  else if(next==="c3"){ renderWeekCards(); push("screen-c3"); }
  else { renderDayCards(); push("screen-c4"); }
});
document.getElementById("c2Next").addEventListener("click",()=>{
  if(!wizard.draft.months.some(m=>m.focus.trim())){ toast("월간 목표 1개 이상"); return; }
  renderDayCards(); push("screen-c4");
});
document.getElementById("c3Next").addEventListener("click",()=>{ renderDayCards(); push("screen-c4"); });
document.getElementById("c4Save").addEventListener("click",saveWizard);
["editWeek","editDay"].forEach(id=>document.getElementById(id)?.addEventListener("click",()=>toast("수정 UI (본편 연결)")));

renderHome(); updateScreens();
