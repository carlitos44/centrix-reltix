import { api, fmtSlot, onEvent, statusLabel } from './shared.js';

const unitByAccount = { alex: 'unit_4b', jordan: 'unit_01' };
const tenantAccounts = Object.values(demoAccounts).filter(account => unitByAccount[account.id]);
const threadStatus = status => ['done','invoiced','cancelled'].includes(status) ? 'Resolved'
  : ['reported','awaiting_approval','emergency','rejected'].includes(status) ? 'New' : 'In progress';
// Step on the repair progress track (Reported, Diagnosed, Booked, Done, Invoiced); emergencies and declines have none.
const STAGE = { reported: 0, awaiting_approval: 1, approved: 1, ordered: 2, received: 2, accepted: 2, scheduled: 2, in_progress: 2, done: 3, invoiced: 4 };

async function syncVoiceCases() {
  const { cases, documents } = await api('GET', '/api/state');
  let changed=false;
  for (const tenant of tenantAccounts.filter(account => canAccessTenant(account.id))) {
    const relevant = cases.filter(item => item.unit_id === unitByAccount[tenant.id] && item.kind !== 'offer');
    const data = readWorkflow(tenant.id);
    const liveIds = new Set(relevant.map(item => 'voice-' + item.id));
    const threads = data.threads.filter(thread => thread.source !== 'voice-desk' || liveIds.has(thread.id)).map(thread=>({...thread}));
    for (const item of relevant) {
      const id = 'voice-' + item.id;
      let thread = threads.find(entry => entry.id === id);
      if (!thread) {
        thread = { id, kind: 'request', source: 'voice-desk', replies: [] };
        threads.unshift(thread);
      }
      Object.assign(thread,{
        title: item.diagnosis?.label || item.description,
        status: threadStatus(item.status),
        stage: STAGE[item.status],
        timeline: (item.history||[]).map(entry=>({status:statusLabel(entry.status,item.kind),note:entry.note,at:entry.at})),
        documents: documents.filter(doc=>doc.case_id===item.id && ['repair_report','invoice'].includes(doc.type)),
        consent: item.consent,
        body: [
          'AI repair assistant · '+statusLabel(item.status,item.kind),
          item.description,
          item.partner_name && 'Craftsman: '+item.partner_name,
          item.estimate && 'Estimate: €'+item.estimate.min_eur+'–'+item.estimate.max_eur,
          item.payment && 'Who pays: '+item.payment.payer[0].toUpperCase()+item.payment.payer.slice(1),
          item.slot && (item.status==='ordered'?'Requested visit: ':'Visit: ')+fmtSlot(item.slot)
        ].filter(Boolean).join('\n')
      });
    }
    if (JSON.stringify(threads) !== JSON.stringify(data.threads)) {
      saveWorkflow(tenant.id,{...data,threads});
      changed=true;
    }
  }
  if (!changed) return;
  if (demoAccount?.role === 'manager') renderManager();
  if (document.body.dataset.residentView === 'drafts') renderRequestHistory();
  if (document.body.dataset.residentView === 'inbox') renderInbox();
}

if (demoAccount?.role === 'tenant') {
  const unitId=unitByAccount[demoAccount.id];
  try {
    const [ctx,{startAssistant}] = await Promise.all([
      api('GET','/api/units/'+unitId+'/context'),
      import('./assistant.js?v=request-history-1')
    ]);
    startAssistant(ctx,unitId);
  } catch {
    $('callStatus').textContent='The voice assistant could not load. The Centrix questionnaire is still available.';
    $('call').disabled=true;
    $('chat').querySelector('button').disabled=true;
  }
}
if (['tenant','manager'].includes(demoAccount?.role)) {
  syncVoiceCases().catch(console.error);
  onEvent(event=>{
    if(demoAccount.role==='manager'||event.unit_id===unitByAccount[demoAccount.id]||event.type==='system.reset'){
      syncVoiceCases().catch(console.error);
    }
  });
}

$('draftList').addEventListener('click',event=>{
  const id=event.target.closest('[data-repair-draft]')?.dataset.repairDraft;
  if(!id||demoAccount?.role!=='tenant')return;
  const draft=drafts.find(item=>item.id===id&&item.topic==='repair');
  if(!draft||draft.sharedRequestId||readWorkflow(demoAccount.id).threads.some(thread=>thread.id===id))return;
  const input=$('text');
  showView('guide');
  if(!input.value.trim()){
    input.value=['I’d like help with '+draft.kind.toLowerCase()+'.',draft.location&&'Affected area: '+draft.location,draft.date&&'Noticed on: '+draft.date,draft.details].filter(Boolean).join(' ');
  }
  input.focus();
});

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-listen-repair]');
  if(!button)return;
  const language=navigator.languages.map(locale=>locale.split('-')[0].toLowerCase()).find(code=>['en','nl','es','de'].includes(code))||'en';
  const target=button.parentElement.querySelector('.repair-playback');
  document.querySelectorAll('.repair-playback audio').forEach(audio=>audio.pause());
  const player=document.createElement('audio');
  player.controls=true;
  player.preload='none';
  player.setAttribute('aria-label','Repair update');
  player.src='/api/cases/'+encodeURIComponent(button.dataset.listenRepair)+'/audio?language='+encodeURIComponent(language);
  const status=document.createElement('p');
  status.setAttribute('role','status');
  player.addEventListener('error',()=>{status.textContent='Audio is unavailable. You can still read the repair update.';});
  target.replaceChildren(player,status);
  player.play().catch(()=>{});
});
