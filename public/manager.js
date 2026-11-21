const workflowStatuses=['New','In progress','Resolved'];
const canAccessTenant=id=>{
  const tenant=Object.hasOwn(demoAccounts,id)?demoAccounts[id]:null;
  if(!tenant||tenant.role!=='tenant')return false;
  if(demoAccount?.role==='tenant')return demoAccount.id===id;
  return demoAccount?.role==='manager'&&demoAccount.properties.includes(tenant.property);
};
function readWorkflow(id){
  if(!canAccessTenant(id))return {threads:[],paid:[]};
  return loadWorkflowRecord(id);
}
function loadWorkflowRecord(id){
  try{
    const value=JSON.parse(localStorage.getItem('centrix-workflow-v1:'+id));
    return {threads:Array.isArray(value?.threads)?value.threads:[],paid:Array.isArray(value?.paid)?value.paid:[]};
  }catch{return {threads:[],paid:[]};}
}
function saveWorkflow(id,next){
  if(!canAccessTenant(id))throw Error('No access to this account.');
  localStorage.setItem('centrix-workflow-v1:'+id,JSON.stringify(next));
}
function loadManagedPayments(id){return readWorkflow(id).paid;}
function addTenantThread(kind,title,body,id=crypto.randomUUID()){
  if(demoAccount?.role!=='tenant')throw Error('Open the tenant portal first.');
  const data=readWorkflow(demoAccount.id);
  if(data.threads.some(thread=>thread.id===id))return id;
  data.threads.unshift({id,kind,title,body,status:'New',replies:[]});
  saveWorkflow(demoAccount.id,data);
  return id;
}
function repairAudioControls(caseId){
  return '<div class="repair-audio-controls"><button type="button" data-listen-repair="'+escapeText(caseId)+'">Listen to update</button><div class="repair-playback"></div></div>';
}

function renderVoiceCaseDetails(thread){
  const labels={tenant_name:'Name',tenant_phone:'Phone number',tenant_email:'Email',address:'Address',unit_label:'Unit',diagnosis:'Fault details',installations:'Equipment details',access:'Access instructions'};
  const fields=items=>(items||[]).map(field=>labels[field]||field).join(', ');
  const timeline=(thread.timeline||[]).map(event=>'<li><strong>'+escapeText(event.status)+'</strong>'+(event.note?'<p>'+escapeText(event.note)+'</p>':'')+'</li>').join('');
  const documents=(thread.documents||[]).map(doc=>'<details><summary>'+escapeText(doc.type==='invoice'?'Invoice · '+formatAmount(doc.amount_eur):'Repair report')+'</summary><p>'+escapeText(doc.text||doc.name)+'</p></details>').join('');
  const consent=thread.consent ? '<p><strong>Booking permission recorded</strong><br>'+escapeText(fields(thread.consent.data_shared))+(thread.consent.after_acceptance?.length?'<br>After acceptance: '+escapeText(fields(thread.consent.after_acceptance)):'')+'</p>' : '';
  return '<details class="voice-case-details"><summary>Case timeline and documents</summary><ol>'+timeline+'</ol>'+consent+documents+'</details>';
}

function repairTrack(stage){
  if(stage==null)return '';
  return '<ol class="track" style="--p:'+stage+'" aria-label="Repair progress">'+['Reported','Diagnosed','Booked','Done','Invoiced'].map((step,i)=>'<li class="'+(i<=stage?'on':'')+(i===stage?' now':'')+'"'+(i===stage?' aria-current="step"':'')+'>'+step+'</li>').join('')+'</ol>';
}
function threadCard(thread,controls='',showReplies=true){
  const replies=showReplies ? thread.replies.map(reply=>'<li><strong>'+escapeText(reply.name)+'</strong><p>'+escapeText(reply.body)+'</p></li>').join('') : '';
  const audio=thread.source==='voice-desk' ? repairAudioControls(thread.id.slice(6)) : '';
  const detail=thread.source==='voice-desk' ? renderVoiceCaseDetails(thread) : '';
  return '<article class="workflow-card"><div class="workflow-heading"><h3>'+escapeText(thread.title)+'</h3><span class="workflow-status">'+escapeText(thread.status)+'</span></div>'+(thread.source==='voice-desk'?repairTrack(thread.stage):'')+'<p class="workflow-message">'+escapeText(thread.body)+'</p>'+(thread.partner?renderPartnerTimeline(thread):'')+(replies?'<ul class="workflow-replies" aria-label="Manager replies">'+replies+'</ul>':'')+detail+audio+controls+'</article>';
}
function renderRequestHistory(){
  if(demoAccount?.role!=='tenant')return;
  const requests=readWorkflow(demoAccount.id).threads.filter(thread=>thread.kind==='request');
  const active=requests.filter(thread=>thread.status!=='Resolved');
  const closed=requests.filter(thread=>thread.status==='Resolved');
  const section=(title,items,empty)=>'<section class="request-history-group"><h3>'+title+
    '</h3>'+(items.length?'<div class="workflow-list">'+items.map(thread=>threadCard(thread,'',false)).join('')+'</div>':'<p class="note">'+empty+'</p>')+'</section>';
  $('submitted-requests').innerHTML=section('Active requests',active,'No active requests.')+
    section('Closed requests',closed,'No closed requests yet.');
  renderDrafts();
}

function renderInbox(){
  if(demoAccount?.role!=='tenant')return;
  const threads=readWorkflow(demoAccount.id).threads.filter(thread=>thread.kind==='message'||thread.replies.length);
  const correspondence=threads.map(thread=>{
    const sent=thread.kind==='message' ? '<p class="workflow-message">'+escapeText(thread.body)+'</p>' : '';
    const replies=thread.replies.map(reply=>'<li><strong>'+escapeText(reply.name)+'</strong><p>'+escapeText(reply.body)+'</p></li>').join('');
    return '<article class="workflow-card"><h3>'+escapeText(thread.title)+'</h3>'+sent+
      (replies?'<ul class="workflow-replies" aria-label="Manager replies">'+replies+'</ul>':'')+'</article>';
  }).join('');
  $('inbox-content').innerHTML='<h2 id="inbox-title" tabindex="-1">Messages</h2>'+
    '<p class="note">Your correspondence with building management.</p>'+
    (correspondence?'<div class="workflow-list">'+correspondence+'</div>':'<p>No messages yet.</p>')+
    '<p><button type="button" data-view="drafts">View previous requests</button></p>';
}
const managerPortal=$('manager-portal');
let managerTab='requests';
let propertyFilter='all';
const managedTenants=()=>Object.values(demoAccounts).filter(account=>account.role==='tenant'&&canAccessTenant(account.id));
function managerThreadControls(tenant,thread){
  const id=escapeText(thread.id);
  if(thread.partner||thread.source==='voice-desk')return '';
  return '<form class="manager-reply" data-thread="'+id+'" data-tenant="'+tenant.id+'"><label for="status-'+id+'">Status</label><select id="status-'+id+'" name="status">'+workflowStatuses.map(status=>'<option'+(thread.status===status?' selected':'')+'>'+status+'</option>').join('')+'</select><label for="reply-'+id+'">Reply to '+escapeText(tenant.name)+'</label><textarea id="reply-'+id+'" name="reply" maxlength="1500" placeholder="Optional reply"></textarea><button type="submit" class="primary">Save update</button></form>';
}
function managerPaymentPanel(tenant,data){
  const fees=tenant.id==='alex'?alexFees:jordanFees;
  let tenantPaid=[];
  try {
    const saved=JSON.parse(localStorage.getItem('centrix-demo-v1:'+tenant.id+':centrix-building-hub'));
    if(Array.isArray(saved?.paid))tenantPaid=saved.paid;
  } catch {}
  return '<div class="workflow-list">'+fees.map(fee=>{
    const managerPaid=data.paid.includes(fee.id);
    const alreadyPaid=fee.samplePaid||tenantPaid.includes(fee.id);
    return '<article class="workflow-card"><h3>'+fee.title+'</h3><p>'+formatAmount(fee.amount)+' · <strong>'+(managerPaid||alreadyPaid?'Paid':'Outstanding')+'</strong></p><p class="subtle">'+fee.ref+' · Due '+formatDate(fee.due)+'</p></article>';
  }).join('')+'</div>';
}
function renderManager(){
  if(demoAccount?.role!=='manager')return;
  const tenants=managedTenants().filter(tenant=>propertyFilter==='all'||tenant.property===propertyFilter);
  managerPortal.querySelectorAll('[data-manager-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.managerTab===managerTab)));
  const titles={requests:'Tenant requests',messages:'Tenant messages',payments:'Payment records'};
  $('manager-content').innerHTML='<h2 id="manager-panel-title" tabindex="-1">'+titles[managerTab]+'</h2><label for="manager-property">Property</label><select id="manager-property"><option value="all">All managed properties</option>'+demoAccount.properties.map(id=>'<option value="'+id+'"'+(id===propertyFilter?' selected':'')+'>'+demoProperties[id].name+'</option>').join('')+'</select>'+(managerTab==='payments'?'<p class="note">Sample payment records.</p>':'')+tenants.map(tenant=>{
    const data=readWorkflow(tenant.id);
    const threads=data.threads.filter(thread=>thread.kind===(managerTab==='requests'?'request':'message'));
    const content=managerTab==='payments'?managerPaymentPanel(tenant,data):'<div class="workflow-list">'+(threads.map(thread=>threadCard(thread,managerThreadControls(tenant,thread))).join('')||'<p>No '+managerTab+' yet for this resident.</p>')+'</div>';
    return '<section class="manager-property"><h3>'+demoProperties[tenant.property].name+' · '+tenant.name+'</h3><p class="subtle">Unit '+tenant.unit+'</p>'+content+'</section>';
  }).join('');
}
managerPortal.addEventListener('change',event=>{
  if(event.target.id==='manager-property'&&demoAccount?.role==='manager'){
    propertyFilter=event.target.value;
    renderManager();
    $('manager-property').focus();
  }
});
managerPortal.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button||demoAccount?.role!=='manager')return;
  if(button.dataset.managerTab){
    managerTab=button.dataset.managerTab;
    $('manager-status').textContent='';
    renderManager();
  }
});
managerPortal.addEventListener('submit',event=>{
  if(demoAccount?.role!=='manager'||!event.target.matches('[data-thread]'))return;
  event.preventDefault();
  const {tenant,thread:id}=event.target.dataset;
  if(!canAccessTenant(tenant))return;
  const data=readWorkflow(tenant);
  const thread=data.threads.find(item=>item.id===id);
  const {status,reply}=event.target.elements;
  if(!thread||(!thread.partner&&!workflowStatuses.includes(status.value)))return;
  if(!thread.partner)thread.status=status.value;
  const body=reply.value.trim();
  if(body)thread.replies.push({name:demoAccount.name,body});
  try{saveWorkflow(tenant,data);renderManager();$('manager-status').textContent=body?'Status and reply saved.':'Status saved.';}
  catch{$('manager-status').textContent='Could not save this update.';}
});
