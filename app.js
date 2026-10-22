
(function(){
  'use strict';
  // Supabase é a única fonte de dados; nenhum cadastro é salvo em localStorage.
  const cfg=window.PAUSA_CONFIG || {};
  const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.supabaseUrl||'') &&
                   typeof cfg.supabasePublishableKey==='string' &&
                   /^(sb_publishable_|eyJ)/.test(cfg.supabasePublishableKey) &&
                   !cfg.supabasePublishableKey.includes('COLE_AQUI');
  const sb=configured && window.supabase?.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey,
    {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  let currentUser=null, refreshing=false, writing=false;
  const cloudPerson=p=>({id:p.id,name:p.name,color:p.color,createdAt:Date.parse(p.created_at)});
  const cloudSession=s=>({id:s.id,personId:s.person_id,startAt:Date.parse(s.started_at),endAt:s.ended_at?Date.parse(s.ended_at):null});
  function setSync(label, isError=false){const el=$('#sync-status');if(el){el.textContent=label;el.style.color=isError?'#ff9aac':'#9cdbc9';}}
  function errorMessage(error){
    const s=String(error?.message||error||'Falha na conexão.');
    if(/duplicate key|23505/.test(s))return 'Este registro já existe ou esta pessoa já está com o cronômetro ativo.';
    if(/foreign key|23503/.test(s))return 'O registro associado não foi encontrado.';
    if(/row.level.security|permission denied|42501/.test(s))return 'Acesso negado. Confira as políticas RLS e o login.';
    if(/Failed to fetch|fetch failed|NetworkError/.test(s))return 'Não foi possível conectar ao Supabase. Verifique sua internet e a configuração.';
    return s;
  }
  async function pageAll(table){
    const rows=[];
    for(let from=0;from<100000;from+=1000){
      const {data,error}=await sb.from(table).select('*').order('created_at',{ascending:true}).range(from,from+999);
      if(error)throw error;
      rows.push(...(data||[]));
      if(!data||data.length<1000)return rows;
    }
    throw new Error('Volume de registros excedeu o limite de carregamento.');
  }
  async function refreshData(silent=false){
    if(!sb||!currentUser||refreshing||writing)return;
    if(silent && modal && (modal.type==='add'||modal.type==='edit'))return;
    const originalId=currentUser.id;
    refreshing=true;
    if(!silent)setSync('Sincronizando…');
    try{
      const [people,sessions]=await Promise.all([pageAll('bathroom_people'),pageAll('bathroom_sessions')]);
      if(currentUser?.id!==originalId)return;
      store={people:people.map(cloudPerson),sessions:sessions.map(cloudSession)};
      setSync('Sincronizado');
      render();
    }catch(error){setSync('Erro de conexão',true);if(!silent)toast(errorMessage(error));}
    finally{refreshing=false;}
  }
  async function mutate(callback, success){
    if(writing||!currentUser)return;
    writing=true;
    setSync('Salvando…');
    document.querySelectorAll('[data-action],#form-person button[type=submit]').forEach(b=>b.disabled=true);
    let succeeded=false;
    try{
      await callback();
      succeeded=true;modal=null;toast(success);
    }catch(error){toast(errorMessage(error));setSync('Falha ao salvar',true);}
    finally{writing=false;document.querySelectorAll('[data-action]').forEach(b=>b.disabled=false);}
    if(succeeded)await refreshData();
  }
  async function viewSignedIn(user){
    if(!user)return;
    if(currentUser?.id===user.id && !$('#app-shell').hidden)return;
    currentUser=user;
    $('#auth-shell').hidden=true;
    $('#app-shell').hidden=false;
    $('#account-email').textContent=user.email||'Usuário';
    await refreshData();
  }
  function viewSignedOut(){
    currentUser=null;store={people:[],sessions:[]};modal=null;
    $('#app-shell').hidden=true;$('#auth-shell').hidden=false;
    $('#auth-error').textContent='';$('#login-password').value='';
    $('#content').innerHTML='';$('#modal-root').innerHTML='';
  }
  async function boot(){
    if(!sb){$('#auth-setup').hidden=false;$('#form-login').hidden=true;
      if(configured)$('#auth-setup').textContent='Não foi possível carregar o cliente Supabase. Verifique sua conexão com a internet.';
      return;}
    const {data,error}=await sb.auth.getUser();
    if(error && !/Auth session missing/i.test(error.message||''))$('#auth-error').textContent=errorMessage(error);
    if(data?.user)await viewSignedIn(data.user);
    sb.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT')setTimeout(viewSignedOut,0);
      if(event==='SIGNED_IN'&&session?.user&&!currentUser)setTimeout(()=>viewSignedIn(session.user),0);
    });
  }

  const COLORS=['#6b5be9','#16b8a3','#f1a14b','#e6758b','#5c8dde','#ab77db','#368fa0','#d0805d'];
  const ICON=(name,klass='')=>`<svg class="${klass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const $=(s)=>document.querySelector(s);
  const pad=(n)=>String(n).padStart(2,'0');
  const fmtDateKey=(n)=>{const d=new Date(n);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
  const dateFromKey=(k)=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)};
  const addDays=(k,n)=>{const d=dateFromKey(k);d.setDate(d.getDate()+n);return fmtDateKey(d)};
  const dateLabel=(k,weekday=false)=>dateFromKey(k).toLocaleDateString('pt-BR',weekday?{weekday:'long',day:'2-digit',month:'long',year:'numeric'}:{day:'2-digit',month:'short',year:'numeric'});
  const fmtTime=(t)=>new Date(t).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const fmtDateTime=(t)=>new Date(t).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const fmtDuration=(ms,compact=false)=>{const s=Math.max(0,Math.floor(ms/1000));if(!s)return '0s';const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60;if(compact){return h?`${h}h ${m}min`:m?`${m}min`:`${ss}s`;}return h?`${h}h ${m}min ${ss}s`:m?`${m}min ${ss}s`:`${ss}s`};
  const fmtTimer=(ms)=>{const s=Math.max(0,Math.floor(ms/1000));return `${pad(Math.floor(s/3600))}:${pad(Math.floor(s%3600/60))}:${pad(s%60)}`};
  const esc=(value)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2,11)}`;
  const initials=(name)=>name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toLocaleUpperCase('pt-BR');
  let store={people:[],sessions:[]}, tab='overview', modal=null, searchPeople='',historyDate='',historyPerson='all',range='30',customFrom='',customTo='';
  const person=(id)=>store.people.find(p=>p.id===id);
  const openSessions=()=>store.sessions.filter(s=>s.endAt===null);
  const activeSession=(id)=>store.sessions.find(s=>s.personId===id&&s.endAt===null);
  const ended=()=>store.sessions.filter(s=>Number.isFinite(s.endAt)&&s.endAt>=s.startAt);
  const avatar=(p,small=false)=>`<div class="avatar ${small?'sm':''}" style="background:${esc(p.color||COLORS[0])}">${esc(initials(p.name))}</div>`;
  const empty=(title,desc,btn='')=>`<div class="empty"><div class="empty-icon">${ICON('clock')}</div><h3>${esc(title)}</h3><p>${esc(desc)}</p>${btn}</div>`;
  const startToday=()=>fmtDateKey(Date.now());
  const cleanSessions=()=>ended().sort((a,b)=>b.startAt-a.startAt);
  function parts(s){const result=[];let cursor=s.startAt;const end=s.endAt;if(end===null||end<=cursor)return result;let count=0;while(cursor<end&&count++<3660){const key=fmtDateKey(cursor);const next=dateFromKey(addDays(key,1)).getTime();const to=Math.min(end,next);result.push({session:s,date:key,from:cursor,to,ms:to-cursor,isStart:cursor===s.startAt});cursor=to}return result}
  function summarize(from,to,id='all'){
    const days=new Map(),persons=new Map(),hourCount=Array(24).fill(0),weekCount=Array(7).fill(0),recent=[];
    for(let k=from; k<=to;k=addDays(k,1))days.set(k,{date:k,visits:0,ms:0});
    for(const p of store.people)persons.set(p.id,{person:p,visits:0,ms:0});
    let longest=null;
    for(const s of ended()){
      if(id!=='all'&&s.personId!==id)continue;
      const p=person(s.personId);if(!p)continue;
      const key=fmtDateKey(s.startAt);
      const ps=persons.get(p.id);
      if(key>=from&&key<=to){days.get(key).visits++;ps.visits++;recent.push(s);hourCount[new Date(s.startAt).getHours()]++;weekCount[new Date(s.startAt).getDay()]++;if(!longest||(s.endAt-s.startAt)>(longest.endAt-longest.startAt))longest=s}
      if(fmtDateKey(s.endAt)<from||key>to)continue;
      for(const part of parts(s)){if(part.date<from||part.date>to)continue;days.get(part.date).ms+=part.ms;ps.ms+=part.ms}
    }
    recent.sort((a,b)=>b.startAt-a.startAt);
    const dayArr=[...days.values()];const peopleArr=[...persons.values()];
    return {days:dayArr,people:peopleArr,visits:dayArr.reduce((a,x)=>a+x.visits,0),ms:dayArr.reduce((a,x)=>a+x.ms,0),hours:hourCount,week:weekCount,longest,recent};
  }
  function period(){const today=startToday();let first=today;for(const s of store.sessions){const d=fmtDateKey(s.startAt);if(d<first)first=d}
    let from=today,to=today;
    if(range==='7')from=addDays(today,-6);
    if(range==='30')from=addDays(today,-29);
    if(range==='month')from=today.slice(0,7)+'-01';
    if(range==='all')from=first;
    if(range==='custom'){from=customFrom||today;to=customTo||today}
    if(from>to)[from,to]=[to,from];return {from,to}
  }
  function range14(){const today=startToday();return {from:addDays(today,-13),to:today}}
  function stat(label,value,note,icon='clock',tint='') {return `<div class="stat"><div class="stat-upper"><div class="stat-label">${esc(label)}</div><div class="stat-ico ${tint}">${ICON(icon)}</div></div><div class="stat-value" title="${esc(value)}">${esc(value)}</div><div class="stat-note">${esc(note)}</div></div>`}
  function sectionHeader(title,sub,right=''){return `<div class="panel-head"><div><h2 class="panel-title">${esc(title)}</h2>${sub?`<p class="panel-desc">${esc(sub)}</p>`:''}</div>${right}</div>`}
  function buildChart(data,formatter,accent='#6654e8',labelKey='label',valueKey='value'){
    const W=Math.max(640,data.length*37+58),H=245,left=37,right=19,top=24,bottom=42,height=H-top-bottom,width=W-left-right;
    const maxVal=Math.max(1,...data.map(d=>d[valueKey]));
    const bars=data.map((d,i)=>{const step=width/data.length,bw=Math.min(24,step*.6),val=d[valueKey],barH=val/maxVal*(height-8),x=left+i*step+(step-bw)/2,y=top+height-barH;const label=esc(d[labelKey]);const showLabel=data.length<=24||i%2===0||i===data.length-1;return `<g><title>${label}: ${esc(formatter(val))}</title><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0,barH).toFixed(1)}" rx="5" fill="${accent}" opacity="${val===0?'.13':'.95'}"/>${showLabel?`<text x="${(x+bw/2).toFixed(1)}" y="${H-17}" text-anchor="middle" font-size="10" font-family="sans-serif" fill="#a5b4ca">${label}</text>`:''}</g>`}).join('');
    const grid=[0,.25,.5,.75,1].map(v=>{const y=top+height-v*height;const tick=Math.round(maxVal*v);const show=maxVal>=4||v===0||v===1;return `<line x1="${left}" x2="${W-right}" y1="${y}" y2="${y}" stroke="#303e58"/>${show?`<text x="${left-9}" y="${y+3}" text-anchor="end" font-size="10" font-family="sans-serif" fill="#a5b4ca">${esc(formatter(tick))}</text>`:''}`}).join('');
    return `<div class="chart-wrap"><svg aria-label="Gráfico de barras" role="img" viewBox="0 0 ${W} ${H}">${grid}${bars}</svg></div>`
  }
  const barsHTML=(items,valKey='visits',fn=v=>v,variant='')=>{const list=items.filter(x=>x[valKey]>0).slice(0,7);if(!list.length)return '<div class="no-data">Não há registros neste período.</div>';const max=Math.max(...list.map(x=>x[valKey]));return `<div class="horizontal-list">${list.map((x,i)=>`<div><div class="horizontal-header"><span>${i+1}. ${esc(x.person.name)}</span><strong>${esc(fn(x[valKey]))}</strong></div><div class="bar-track"><div class="bar-fill ${variant}" style="width:${Math.max(1,x[valKey]/max*100)}%"></div></div></div>`).join('')}</div>`};
  function personCard(p){const active=activeSession(p.id);const d=summarize(startToday(),startToday(),p.id);return `<div class="person-card ${active?'is-active':''}"><div class="person-card-top"><div class="identity">${avatar(p)}<div style="min-width:0"><div class="person-name" title="${esc(p.name)}">${esc(p.name)}</div><div class="person-sub">${active?'<span style="color:#12a88d;font-weight:800">● Em andamento</span>':'Disponível'}</div></div></div><button class="btn btn-icon btn-ghost" title="Ver perfil" data-action="profile" data-id="${esc(p.id)}">${ICON('eye')}</button></div><div class="person-card-data"><div><span>Usos hoje</span><b>${d.visits}</b></div><div><span>Tempo hoje</span><b>${fmtDuration(d.ms,true)}</b></div></div>${active?`<div class="person-clock" data-timer-person="${esc(p.id)}">${fmtTimer(Date.now()-active.startAt)}</div><div class="person-card-actions" style="margin-top:10px"><button class="btn btn-stop" style="flex:1" data-action="stop" data-id="${esc(p.id)}">${ICON('square')} Parar contagem</button></div>`:`<div class="person-card-actions"><button class="btn btn-success" data-action="start" data-id="${esc(p.id)}">${ICON('play')} Iniciar</button><button class="btn" data-action="profile" data-id="${esc(p.id)}">Perfil</button></div>`}</div>`}
  function overview(){const t=startToday(),d=summarize(t,t),two=summarize(range14().from,t),active=openSessions();return `<div class="page-head"><div><h1>Visão geral <span style="font-size:24px">👋</span></h1><p class="page-sub">Acompanhe os registros e gerencie os cronômetros em tempo real.</p></div><button class="btn btn-primary" data-action="add">${ICON('plus')} Nova pessoa</button></div>
    <div class="stats">${stat('Pessoas cadastradas',String(store.people.length),'Pessoas disponíveis no sistema','users')}${stat('Contagens ativas',String(active.length),'Cronômetros rodando agora','activity','teal')}${stat('Usos finalizados hoje',String(d.visits),'Contagens concluídas','chart','orange')}${stat('Tempo registrado hoje',fmtDuration(d.ms,true),'Total dos usos concluídos','clock','red')}</div>
    <div class="grid-2"><div class="panel">${sectionHeader('Movimentação recente','Quantidade de usos finalizados nos últimos 14 dias','<span class="legend"><span class="legend-dot"></span> Usos por dia</span>')}${buildChart(two.days.map(x=>({label:dateFromKey(x.date).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),value:x.visits})),v=>String(v))}</div>
    <div class="panel">${sectionHeader('Em andamento',active.length?`${active.length} ${active.length===1?'pessoa utilizando':'pessoas utilizando'} o cronômetro`:'Nenhum cronômetro ativo',`<button class="panel-link" data-tab="people">Ver pessoas →</button>`)}${active.length?active.map(s=>{const p=person(s.personId);if(!p)return '';return `<div class="live-person"><div class="identity">${avatar(p,true)}<div><div class="person-name">${esc(p.name)}</div><div class="person-sub"><span class="live-pill"><span class="live-dot"></span> Ativo</span></div></div></div><div style="text-align:right"><div class="live-clock" data-timer-person="${esc(p.id)}">${fmtTimer(Date.now()-s.startAt)}</div><button class="panel-link" data-action="stop" data-id="${esc(p.id)}" style="color:#da6070;margin-top:7px">Finalizar</button></div></div>`}).join(''):empty('Tudo em ordem','Quando alguém iniciar um cronômetro, ele aparecerá aqui.')}</div></div>
    <div class="panel" style="margin-bottom:20px">${sectionHeader('Contagem por pessoa','Inicie ou encerre uma contagem diretamente pelo cartão',`<button class="panel-link" data-tab="people">Gerenciar pessoas →</button>`)}${store.people.length?`<div class="people-grid">${store.people.map(personCard).join('')}</div>`:empty('Cadastre sua primeira pessoa','Os perfis permitem registrar e consultar o histórico de uso individual.',`<button class="btn btn-primary" data-action="add">${ICON('plus')} Cadastrar pessoa</button>`)}</div>
    <div class="panel">${sectionHeader('Últimas contagens finalizadas','Histórico das cinco atividades mais recentes',`<button class="panel-link" data-tab="history">Ver histórico completo →</button>`)}${sessionTable(cleanSessions().slice(0,5))}<p class="hint">As sessões em andamento entram nas estatísticas quando forem finalizadas. Contagens que atravessarem a meia-noite terão o tempo dividido entre os dias correspondentes.</p></div>`}
  function sessionTable(list){if(!list.length)return '<div class="no-data">Nenhuma contagem finalizada ainda.</div>';return `<div class="table-wrap"><table><thead><tr><th>Pessoa</th><th>Data</th><th>Início</th><th>Fim</th><th>Duração</th></tr></thead><tbody>${list.map(s=>{const p=person(s.personId);if(!p)return '';return `<tr><td><div class="identity">${avatar(p,true)}<strong>${esc(p.name)}</strong></div></td><td>${dateLabel(fmtDateKey(s.startAt))}</td><td>${fmtTime(s.startAt)}</td><td>${fmtTime(s.endAt)}</td><td><span class="tag">${fmtDuration(s.endAt-s.startAt,true)}</span></td></tr>`}).join('')}</tbody></table></div>`}
  function peopleView(){const people=store.people.filter(p=>p.name.toLocaleLowerCase('pt-BR').includes(searchPeople.toLocaleLowerCase('pt-BR')));return `<div class="page-head"><div><h1>Pessoas</h1><p class="page-sub">Cadastre pessoas, acompanhe sessões e acesse os perfis individuais.</p></div><button class="btn btn-primary" data-action="add">${ICON('plus')} Nova pessoa</button></div><div class="filters"><input class="field field-search" id="search-people" placeholder="Buscar por nome..." value="${esc(searchPeople)}" aria-label="Buscar pessoas"><span class="filters-end">${store.people.length} ${store.people.length===1?'pessoa cadastrada':'pessoas cadastradas'}</span></div><div class="panel">${people.length?`<div class="people-grid">${people.map(personCard).join('')}</div>`:empty(searchPeople?'Nenhum resultado':'Nenhuma pessoa cadastrada',searchPeople?'Tente buscar por outro nome.':'Adicione pessoas para começar a registrar o tempo de uso.',!searchPeople?`<button class="btn btn-primary" data-action="add">${ICON('plus')} Nova pessoa</button>`:'')}</div>`}
  function historyView(){const sessions=cleanSessions(),selected=[];for(const s of sessions){if(historyPerson!=='all'&&historyPerson!==s.personId)continue;for(const piece of parts(s)){if(historyDate&&piece.date!==historyDate)continue;selected.push(piece)}}selected.sort((a,b)=>b.from-a.from);const groups=new Map();for(const x of selected.slice(0,300)){if(!groups.has(x.date))groups.set(x.date,[]);groups.get(x.date).push(x)};
    return `<div class="page-head"><div><h1>Histórico de uso</h1><p class="page-sub">Todas as contagens concluídas, organizadas por dia e pessoa.</p></div><button class="btn" data-action="export-csv">${ICON('download')} Exportar CSV</button></div>
    <div class="panel"><div class="filters"><input class="field" id="history-date" type="date" value="${esc(historyDate)}" aria-label="Filtrar por dia"><select class="field field-select" id="history-person" aria-label="Filtrar por pessoa"><option value="all">Todas as pessoas</option>${store.people.map(p=>`<option value="${esc(p.id)}" ${historyPerson===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select><button class="btn btn-small" data-action="clear-history">Limpar filtros</button><span class="filters-end">${selected.length} ${selected.length===1?'registro diário':'registros diários'}</span></div>
    ${groups.size?[...groups.entries()].map(([date,rows])=>`<div class="history-day panel" style="box-shadow:none;padding:0"><div class="history-header"><div><h3>${esc(dateLabel(date,true))}</h3><span>${rows.reduce((acc,r)=>acc+(r.isStart?1:0),0)} ${rows.filter(r=>r.isStart).length===1?'uso iniciado':'usos iniciados'} no dia</span></div><span class="tag gray">${fmtDuration(rows.reduce((acc,r)=>acc+r.ms,0),true)}</span></div>${rows.map(x=>{const p=person(x.session.personId);if(!p)return '';return `<div class="history-row"><div class="identity">${avatar(p,true)}<div><div class="person-name">${esc(p.name)}</div><div class="person-sub">${x.isStart?'Sessão iniciada':'Continuação do dia anterior'}</div></div></div><div class="time">${fmtTime(x.from)}</div><div class="time">${x.to===dateFromKey(addDays(x.date,1)).getTime()?'00:00':fmtTime(x.to)}</div><div class="duration">${fmtDuration(x.ms,true)}</div><button class="btn btn-small btn-icon btn-ghost" title="Excluir a sessão completa" data-action="delete-session" data-id="${esc(x.session.id)}">${ICON('trash')}</button></div>`}).join('')}</div>`).join(''):`${empty('Nenhum registro encontrado','Faça uma contagem e finalize o cronômetro para que o registro apareça aqui.')}`}
    ${selected.length>300?'<p class="hint">Exibindo os 300 registros mais recentes. Use os filtros para localizar períodos específicos.</p>':''}</div><div class="note-card">${ICON('info')} O horário e a duração são registrados automaticamente. Se uma sessão atravessar a meia-noite, ela aparecerá nos dois dias, mas será contada como uma única visita.</div>`}
  function reportView(){const r=period(),d=summarize(r.from,r.to),ranksTime=[...d.people].sort((a,b)=>b.ms-a.ms),ranksVisits=[...d.people].sort((a,b)=>b.visits-a.visits),daily=d.days.length>31?d.days.slice(-31):d.days;const bestHour=d.hours.some(Boolean)?d.hours.indexOf(Math.max(...d.hours)):null;const weekday=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];const bestDay=d.week.some(Boolean)?weekday[d.week.indexOf(Math.max(...d.week))]:'—';const champ=ranksTime.find(x=>x.ms>0);return `<div class="page-head"><div><h1>Relatórios e métricas</h1><p class="page-sub">Entenda a frequência, a duração e a distribuição dos registros.</p></div><button class="btn" data-action="export-csv">${ICON('download')} Exportar CSV</button></div>
   <div class="filters"><select class="field field-select" id="report-range"><option value="today" ${range==='today'?'selected':''}>Hoje</option><option value="7" ${range==='7'?'selected':''}>Últimos 7 dias</option><option value="30" ${range==='30'?'selected':''}>Últimos 30 dias</option><option value="month" ${range==='month'?'selected':''}>Este mês</option><option value="all" ${range==='all'?'selected':''}>Todo o histórico</option><option value="custom" ${range==='custom'?'selected':''}>Personalizado</option></select>${range==='custom'?`<input class="field" type="date" id="report-from" value="${esc(r.from)}" aria-label="Data inicial"><input class="field" type="date" id="report-to" value="${esc(r.to)}" aria-label="Data final">`:''}<span class="filters-end">${esc(dateLabel(r.from))} até ${esc(dateLabel(r.to))}</span></div>
   <div class="stats">${stat('Total de usos',String(d.visits),'Contagens encerradas no período','chart')}${stat('Tempo total',fmtDuration(d.ms,true),'Soma do tempo registrado','clock','teal')}${stat('Média por uso',fmtDuration(d.visits?d.ms/d.visits:0,true),'Duração média das contagens','activity','orange')}${stat('Pessoas com uso',String(d.people.filter(x=>x.visits||x.ms).length),'Pessoas com atividades no período','users','red')}</div>
   <div class="grid-2"><div class="panel">${sectionHeader('Frequência diária','Número de contagens iniciadas em cada dia'+(d.days.length>31?' • últimos 31 dias':''))}${buildChart(daily.map(x=>({label:dateFromKey(x.date).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),value:x.visits})),v=>String(v))}</div><div class="panel">${sectionHeader('Tempo total por pessoa','Pessoas que acumularam mais tempo no período')}${barsHTML(ranksTime,'ms',v=>fmtDuration(v,true))}</div></div>
   <div class="grid-2"><div class="panel">${sectionHeader('Horários mais frequentes','Em quais horas as contagens são iniciadas')}${buildChart(d.hours.map((v,i)=>({label:`${pad(i)}h`,value:v})),v=>String(v),'#18b39e')}</div><div class="panel">${sectionHeader('Frequência por pessoa','Ordenado pelo número de contagens iniciadas')}${barsHTML(ranksVisits,'visits',v=>`${v} ${v===1?'uso':'usos'}`,'teal')}</div></div>
   <div class="panel" style="margin-bottom:20px">${sectionHeader('Distribuição por dia da semana','Quantidade total de sessões iniciadas em cada dia')}${buildChart(['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((label,i)=>({label,value:d.week[i]})),v=>String(v),'#a284ef')}</div>
   <h2 class="section-subtitle">Outros indicadores</h2><div class="report-summary"><div class="mini-stat"><label>Horário de pico</label><b>${bestHour===null?'—':pad(bestHour)+'h às '+pad((bestHour+1)%24)+'h'}</b><small>Hora com mais inícios</small></div><div class="mini-stat"><label>Dia da semana mais frequente</label><b>${bestDay}</b><small>Maior volume de usos</small></div><div class="mini-stat"><label>Maior duração registrada</label><b>${d.longest?fmtDuration(d.longest.endAt-d.longest.startAt,true):'—'}</b><small>${d.longest&&person(d.longest.personId)?esc(person(d.longest.personId).name):'Nenhum registro'}</small></div><div class="mini-stat"><label>Pessoa com mais tempo</label><b style="font-size:16px">${champ?esc(champ.person.name):'—'}</b><small>${champ?fmtDuration(champ.ms,true):'Nenhum registro'}</small></div><div class="mini-stat"><label>Dias com registros</label><b>${d.days.filter(x=>x.visits||x.ms).length}</b><small>Dos ${d.days.length} dias do período</small></div><div class="mini-stat"><label>Média diária de usos</label><b>${(d.visits/Math.max(1,d.days.length)).toLocaleString('pt-BR',{maximumFractionDigits:1})}</b><small>Usos por dia no período</small></div></div>
   <div class="note-card">${ICON('info')} As análises incluem apenas sessões encerradas. O número de usos pertence ao dia de início; o tempo de uma sessão que cruza a meia-noite é distribuído entre os respectivos dias. Mantenha esses dados protegidos e use-os respeitando a privacidade das pessoas.</div>`}
  function render(){const name={overview:'Visão geral',people:'Pessoas',history:'Histórico',reports:'Relatórios'}[tab];$('#breadcrumb').textContent=name;$('#today-label').textContent=new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});$('#nav-people-count').textContent=store.people.length;document.querySelectorAll('.nav-btn').forEach(el=>{el.classList.toggle('active',el.dataset.tab===tab);el.setAttribute('aria-current',el.dataset.tab===tab?'page':'false')});$('#content').innerHTML=({overview,people:peopleView,history:historyView,reports:reportView})[tab]();tick();renderModal()}
  function tick(){const active=openSessions();const lookup=new Map(active.map(x=>[x.personId,x]));document.querySelectorAll('[data-timer-person]').forEach(el=>{const s=lookup.get(el.dataset.timerPerson);if(s)el.textContent=fmtTimer(Date.now()-s.startAt)})}
  function renderModal(){const root=$('#modal-root');if(!modal){root.innerHTML='';return}if(modal.type==='add'||modal.type==='edit'){const p=modal.type==='edit'?person(modal.id):null;root.innerHTML=`<div class="modal-backdrop" data-close-backdrop><div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="dialog-head"><h2 id="modal-title">${p?'Editar pessoa':'Cadastrar pessoa'}</h2><button class="btn btn-ghost btn-icon" data-action="close" aria-label="Fechar">${ICON('close')}</button></div><form id="form-person"><div class="form-group"><label class="form-label" for="person-name">Nome da pessoa</label><input autofocus class="form-input" id="person-name" name="name" maxlength="100" autocomplete="off" placeholder="Ex.: Maria Silva" value="${p?esc(p.name):''}" required></div><div class="form-group"><label class="form-label" for="person-color">Cor do perfil</label><input id="person-color" name="color" type="color" value="${p?esc(p.color):COLORS[store.people.length%COLORS.length]}" style="height:42px;width:70px;padding:3px;border:1px solid #e1e7ef;border-radius:9px;background:white"></div><p class="hint">Cada pessoa terá um histórico próprio de contagens e duração por dia.</p><div class="form-actions"><button type="button" class="btn" data-action="close">Cancelar</button><button type="submit" class="btn btn-primary">${p?'Salvar alterações':'Cadastrar'}</button></div></form></div></div>`;$('#person-name').focus();return}
    if(modal.type==='profile'){const p=person(modal.id);if(!p){modal=null;root.innerHTML='';return}const sessions=cleanSessions().filter(x=>x.personId===p.id);const active=activeSession(p.id);const all=sessions.reduce((a,s)=>a+s.endAt-s.startAt,0),m=summarize(range14().from,range14().to,p.id);const byDay=new Map();for(const s of sessions)for(const part of parts(s)){const v=byDay.get(part.date)||{ms:0,visits:0};v.ms+=part.ms;if(part.isStart)v.visits++;byDay.set(part.date,v)};const grouped=[...byDay.entries()].sort((a,b)=>b[0].localeCompare(a[0]));root.innerHTML=`<div class="drawer-root"><div class="drawer-mask" data-action="close"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="Perfil de ${esc(p.name)}"><div class="flex-spread"><span class="tag">Perfil individual</span><button class="btn btn-icon btn-ghost" data-action="close" title="Fechar">${ICON('close')}</button></div><div class="profile-header">${avatar(p)}<div style="min-width:0"><h2>${esc(p.name)}</h2><span class="muted" style="font-size:11px">Cadastrado em ${dateLabel(fmtDateKey(p.createdAt))}</span></div></div>${active?`<div style="background:#153d3a;border-radius:13px;padding:13px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px"><div><b style="color:#7ae9d1">Contagem ativa</b><div class="person-clock" data-timer-person="${esc(p.id)}">${fmtTimer(Date.now()-active.startAt)}</div></div><button class="btn btn-stop btn-small" data-action="stop" data-id="${esc(p.id)}">${ICON('square')} Parar</button></div>`:`<button class="btn btn-success" data-action="start" data-id="${esc(p.id)}" style="width:100%">${ICON('play')} Iniciar contagem</button>`}<div class="report-summary" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:20px"><div class="mini-stat" style="padding:12px"><label>Usos</label><b>${sessions.length}</b></div><div class="mini-stat" style="padding:12px"><label>Tempo total</label><b style="font-size:17px">${fmtDuration(all,true)}</b></div><div class="mini-stat" style="padding:12px"><label>Média</label><b style="font-size:17px">${fmtDuration(sessions.length?all/sessions.length:0,true)}</b></div></div><div class="profile-section"><h3>Últimos 14 dias</h3>${buildChart(m.days.map(x=>({label:dateFromKey(x.date).toLocaleDateString('pt-BR',{day:'2-digit'}),value:x.visits})),v=>String(v))}</div><div class="profile-section"><h3>Histórico por dia</h3>${grouped.length?grouped.slice(0,12).map(([day,x])=>`<div class="profile-day"><div>${esc(dateLabel(day,true))}<small>${x.visits} ${x.visits===1?'uso iniciado':'usos iniciados'}</small></div><strong>${fmtDuration(x.ms,true)}</strong></div>`).join(''):'<p class="hint">Nenhuma contagem encerrada para esta pessoa.</p>'}</div><div class="profile-section"><h3>Últimas sessões</h3>${sessions.slice(0,10).map(s=>`<div class="profile-session"><span>${esc(fmtDateKey(s.startAt).split('-').reverse().join('/'))}</span><span>${fmtTime(s.startAt)}–${fmtTime(s.endAt)}</span><b>${fmtDuration(s.endAt-s.startAt,true)}</b><button class="btn btn-small btn-ghost" data-action="delete-session" data-id="${esc(s.id)}" title="Excluir contagem">${ICON('trash')}</button></div>`).join('')||'<p class="hint">Sem registros.</p>'}</div><div class="profile-section flex-spread"><button class="btn" data-action="edit" data-id="${esc(p.id)}">${ICON('pencil')} Editar perfil</button><button class="btn btn-danger" data-action="delete-person" data-id="${esc(p.id)}">${ICON('trash')} Excluir pessoa</button></div></aside></div>`;tick()}
  }
  function toast(message){const el=document.createElement('div');el.className='toast';el.textContent=message;$('#toast-wrap').appendChild(el);setTimeout(()=>el.remove(),3600)}
  async function start(id){
    const p=person(id);if(!p)return toast('Pessoa não encontrada.');
    if(activeSession(id))return toast('Essa pessoa já possui uma contagem ativa.');
    await mutate(async()=>{const {error}=await sb.from('bathroom_sessions').insert({person_id:id});if(error)throw error;},`Contagem iniciada para ${p.name}.`);
  }
  async function stop(id){
    const s=activeSession(id);if(!s)return toast('Nenhuma contagem ativa.');
    const ms=Math.max(Date.now(),s.startAt+1000);
    await mutate(async()=>{
      const {data,error}=await sb.from('bathroom_sessions').update({ended_at:new Date(ms).toISOString()}).eq('id',s.id).is('ended_at',null).select('id');
      if(error)throw error;
      if(!data?.length)throw new Error('A sessão já foi encerrada em outro dispositivo.');
    },`Contagem encerrada: ${fmtDuration(ms-s.startAt)}.`);
  }
  async function deleteSession(id){
    if(!store.sessions.some(x=>x.id===id))return;
    if(!confirm('Excluir esta contagem? Esta ação não poderá ser desfeita.'))return;
    await mutate(async()=>{const {error}=await sb.from('bathroom_sessions').delete().eq('id',id);if(error)throw error;},'Contagem excluída.');
  }
  async function deletePerson(id){
    const p=person(id);if(!p)return;
    const count=store.sessions.filter(x=>x.personId===id).length;
    if(!confirm(`Excluir ${p.name} e suas ${count} contagens? Esta ação apagará permanentemente todo o histórico da pessoa.`))return;
    await mutate(async()=>{const {error}=await sb.from('bathroom_people').delete().eq('id',id);if(error)throw error;},'Pessoa e histórico excluídos.');
  }
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
  function exportJSON(){download(new Blob([JSON.stringify({format:'pausa-v1',exportedAt:new Date().toISOString(),people:store.people,sessions:store.sessions},null,2)],{type:'application/json'}),`pausa-backup-${startToday()}.json`);toast('Backup exportado. Guarde-o em local seguro.')}
  function csvValue(v){const s=String(v??'');return '"'+s.replace(/"/g,'""')+'"'}
  function exportCSV(){const heading=['Pessoa','Início (data e hora)','Fim (data e hora)','Data de início','Duração (minutos)','Duração (segundos)','Status'];const rows=store.sessions.map(s=>{const p=person(s.personId);const delta=(s.endAt??Date.now())-s.startAt;return [p?.name||'Pessoa removida',fmtDateTime(s.startAt),s.endAt?fmtDateTime(s.endAt):'',fmtDateKey(s.startAt).split('-').reverse().join('/'),(delta/60000).toFixed(2).replace('.',','),Math.floor(delta/1000),s.endAt?'Encerrada':'Em andamento']});download(new Blob(['\uFEFF'+[heading,...rows].map(r=>r.map(csvValue).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),`pausa-registros-${startToday()}.csv`);toast('Relatório CSV exportado.')}
  document.addEventListener('click',e=>{
    const nav=e.target.closest('[data-tab]');if(nav){tab=nav.dataset.tab;modal=null;window.scrollTo(0,0);render();return}
    const btn=e.target.closest('[data-action]');if(btn){const action=btn.dataset.action,id=btn.dataset.id;switch(action){case 'add':modal={type:'add'};break;case 'profile':modal={type:'profile',id};break;case 'edit':modal={type:'edit',id};break;case 'close':modal=null;break;case 'start':start(id);return;case 'stop':stop(id);return;case 'delete-session':deleteSession(id);return;case 'delete-person':deletePerson(id);return;case 'export-json':exportJSON();return;case 'export-csv':exportCSV();return;case 'clear-history':historyDate='';historyPerson='all';render();return}renderModal();return}
    if(e.target.matches('[data-close-backdrop]')){modal=null;renderModal()}
  });
  document.addEventListener('submit',async e=>{
    if(e.target.id!=='form-person')return;
    e.preventDefault();
    const name=$('#person-name').value.trim().replace(/\s+/g,' '),color=$('#person-color').value;
    if(!name)return toast('Informe o nome da pessoa.');
    if(store.people.some(p=>p.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')&&p.id!==modal.id))return toast('Já existe uma pessoa com esse nome.');
    if(modal.type==='edit'){
      const id=modal.id;
      await mutate(async()=>{const {error}=await sb.from('bathroom_people').update({name,color}).eq('id',id);if(error)throw error;},'Perfil atualizado.');
    }else{
      await mutate(async()=>{const {error}=await sb.from('bathroom_people').insert({name,color});if(error)throw error;},'Pessoa cadastrada.');
    }
  });
  document.addEventListener('submit',async e=>{
    if(e.target.id!=='form-login')return;
    e.preventDefault();
    const btn=$('#btn-login');btn.disabled=true;
    $('#auth-error').textContent='';
    try{
      const {data,error}=await sb.auth.signInWithPassword({email:$('#login-email').value.trim(),password:$('#login-password').value});
      if(error)throw error;
      if(data?.user)await viewSignedIn(data.user);
    }catch(error){$('#auth-error').textContent=errorMessage(error);}
    finally{btn.disabled=false;}
  });
  $('#btn-signout').addEventListener('click',async()=>{
    const {error}=await sb.auth.signOut();if(error)toast(errorMessage(error));else viewSignedOut();
  });
  $('#btn-refresh').addEventListener('click',()=>refreshData());
  document.addEventListener('input',e=>{if(e.target.id==='search-people'){const el=e.target,at=el.selectionStart;searchPeople=el.value;const scroll=window.scrollY;$('#content').innerHTML=peopleView();const fresh=$('#search-people');fresh.focus();fresh.setSelectionRange(at,at);window.scrollTo(0,scroll);tick()}});
  document.addEventListener('change',e=>{const el=e.target;if(el.id==='history-date'){historyDate=el.value;render()}if(el.id==='history-person'){historyPerson=el.value;render()}if(el.id==='report-range'){range=el.value;if(range==='custom'){const current=period();customFrom=current.from;customTo=current.to}render()}if(el.id==='report-from'){customFrom=el.value;render()}if(el.id==='report-to'){customTo=el.value;render()}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal){modal=null;renderModal()}});
  window.addEventListener('focus',()=>refreshData(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshData(true)});
  setInterval(()=>refreshData(true),30000);
  setInterval(tick,1000);
  boot();
})();
