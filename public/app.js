const topics = {
  repair: { label:'Report a malfunction' },
  moveIn: { label:'Plan a move-in' },
  moveOut: { label:'Plan a move-out' },
  access: { label:'Get access help' },
  services: { label:'Find a service provider' },
  owner: { label:'Contact the owner' }
};

const portraits = {
  owner: ['Daniel Mercer', 'photo-1500648767791-00dcc994a43e'],
  manager: ['Mira van Dijk', 'photo-1580489944761-15a19d654956']
};

const contacts = {
  manager:['Property manager','Coordinate repairs, inspections, access and shared spaces.','Via your lease or resident portal'],
  owner:['Owner or leasing team','Handle lease notices, rent questions and deposits.','Via the owner contact in your lease'],
  plumber:['Approved plumber','Inspect leaks, blocked drains and water supply issues.','Request dispatch through the property manager'],
  electrician:['Approved electrician','Inspect electrical faults in the home.','Request dispatch through the property manager'],
  heating:['Heating contractor','Inspect heating or hot water faults.','Request dispatch through the property manager'],
  locksmith:['Approved locksmith','Help regain access after the resident verifies occupancy.','Use the building’s approved after-hours access number'],
  internet:['Internet provider','Set up a connection or get help with an existing service.','For setup, check availability at your address. For support, use the contact on your bill.'],
  cleaning:['Cleaning provider','Arrange cleaning or request a quote.','Ask the property manager for the approved provider list'],
  waste:['Municipal waste service','Confirm collection dates and recycling rules.','Use the municipality’s official waste portal']
};

const records = [
  ['Inside','Water shutoff','Under the kitchen sink, behind the removable shelf. Building supply is managed by maintenance.','leak plumbing stopcock pipe'],
  ['Inside','Electrical panel','Inside the entry cupboard. Circuits are labelled on the panel door.','power fuse breaker electricity'],
  ['Inside','Heating and hot water','Thermostat in the living room. Contact maintenance for boiler faults.','boiler radiator temperature'],
  ['Inside','Ventilation','Bathroom extractor switch is beside the light switch.','fan air moisture'],
  ['Outside','Parking and loading','Visitor bays are beside the west gate. Book the loading bay through building management.','moving van car'],
  ['Outside','Waste and recycling','Bins are in the courtyard enclosure near the side gate.','garbage rubbish collection'],
  ['Outside','Shared garden','Access through the rear stairwell. Ask building management about maintenance.','grounds yard outdoor'],
  ['Building','Keys and fobs','Collect or return keys at the management office by appointment.','lockout locked access door'],
  ['Building','Utility meters','Meter cupboard is on the ground floor. Ask management for access and confirm the unit label.','electric water gas move-in move-out readings'],
  ['Building','Internet connection','Fibre termination is in the entry cupboard. Your provider handles activation.','wifi wi-fi router broadband']
];

const $ = id => document.getElementById(id);
const flow = $('flow');
let state = {step:0, topic:'', kind:'', urgent:false, details:'', date:''};
let drafts = [];
try { drafts = JSON.parse(residentStorage.getItem('centrix-requests') || '[]'); if (!Array.isArray(drafts)) drafts = []; } catch {}

function showView(view) {
  if (demoAccount?.role!=='tenant') return;
  document.body.dataset.residentView=view;
  for (const id of ['guide','property','drafts','community','team','updates','fees','inbox']) $(id).hidden = id !== view;
  document.querySelectorAll('nav [data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
  if (view === 'property') renderRecords();
  if (view === 'drafts') {renderRequestHistory();$('request-history-title').focus();}
  if (view === 'inbox') {renderInbox();$('inbox-title').focus();}
  if (view === 'updates') {renderUpdates();$('updates-title').focus();}
  if (view === 'fees') {renderFees();$('fees-title').focus();}
  if (view === 'team') $('teamTitle').focus();
  if (view === 'community') {renderCommunity();$('community-title').focus();}
}

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

let browseAllPropertyRecords = false;
const commonPropertyRecords = ['Heating and hot water','Keys and fobs','Utility meters','Parking and loading'];

function renderRecords() {
  const words = $('lookup').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const matches = records.filter(record => words.every(word => record.join(' ').toLowerCase().includes(word)));
  const visible = searching || browseAllPropertyRecords ? matches : commonPropertyRecords.map(title=>records.find(record=>record[1]===title));
  $('recordCount').textContent = searching
    ? (matches.length ? matches.length+' matching '+(matches.length===1?'record':'records') : 'No matches. Try a different word or ask your building team.')
    : (browseAllPropertyRecords ? 'All property records' : 'Common topics');
  $('records').innerHTML = visible.map(([area,title,body])=>'<details class="guide-record"'+(searching&&visible.length===1?' open':'')+'><summary>'+title+' <small>'+area+'</small></summary><p>'+body+'</p></details>').join('');
  const browse = $('browse-property-records');
  browse.hidden = searching;
  browse.textContent = browseAllPropertyRecords?'Show common topics':'Show all property records';
  browse.setAttribute('aria-expanded',String(browseAllPropertyRecords));
}

$('browse-property-records').addEventListener('click',()=>{
  browseAllPropertyRecords=!browseAllPropertyRecords;
  renderRecords();
});

function selectedQuestions() {
  const [context, details, date, contact, step] = questionnaire[state.topic].options[state.kind];
  return {context, details, date, contact, step};
}

function asksUrgency(topic, kind) {
  return questionnaire[topic]?.urgency === true ||
    (topic === 'moveIn' && kind === 'Report an issue at move-in') ||
    (topic === 'access' && kind === 'Intercom or entry door');
}

function recommendation() {
  const {contact, step} = selectedQuestions();
  const people = contact === 'manager' ? ['manager'] : [contact, 'manager'];
  return {people, steps:[step]};
}

function detailFields() {
  const {context, details, date} = selectedQuestions();
  const optional = ' <span class="subtle">(optional)</span>';
  return (context ? '<label for="location">'+context+optional+'</label><input id="location" maxlength="120" value="'+escapeText(state.location||'')+'">' : '')+
    '<label for="issue-details">'+details+optional+'</label><p id="detail-hint" class="subtle">Keep access codes, bank details, and sensitive documents out of this form.</p>'+
    '<textarea id="issue-details" rows="6" maxlength="2400" aria-describedby="detail-hint">'+escapeText(state.details||'')+'</textarea>'+
    (date ? '<label for="date">'+date+optional+'</label><input id="date" type="date" value="'+escapeText(state.date||'')+'">' : '');
}

function resultChecklist(steps) {
  const complete = state.complete || [];
  return '<ol class="steps">'+steps.map((step,index) =>
    '<li><label><input type="checkbox" data-check-step="'+index+'"'+(complete.includes(index)?' checked':'')+'><span>'+step+'</span></label></li>'
  ).join('')+'</ol>';
}

function relatedGuide() {
  if (state.kind === 'Rent or payment question') {
    return '<p><button type="button" data-view="fees">Review your payment records</button></p>';
  }
  const links = {
    'Water or plumbing':['Water shutoff','water shutoff'],
    'Power or electrical':['Electrical panel','electrical panel'],
    'Heating or hot water':['Heating and hot water','heating hot water'],
    'Keys and access':['Keys and fobs','keys fobs'],
    'Keys and final meters':['Utility meters','utility meters'],
    'Locked out':['Keys and fobs','keys fobs'],
    'Lost key or fob':['Keys and fobs','keys fobs'],
    'Damp or water damage':['Ventilation','ventilation'],
    'Utilities and meters':['Utility meters','utility meters'],
    'Moving arrangements':['Parking and loading','parking loading'],
    'Parking or grounds':['Parking and loading','parking loading'],
    'Waste or recycling':['Waste and recycling','waste recycling'],
    'Internet':['Internet connection','internet connection']
  };
  const link = links[state.kind];
  const record=link&&records.find(item=>item[1]===link[0]);
  return record ? '<div class="guide-links"><h3>From the property guide</h3><p><strong>'+record[1]+'</strong> · '+record[2]+'</p><button type="button" data-guide-query="'+link[1]+'">'+link[0]+'</button></div>' : '';
}

const maintenanceKey='centrix-emergency';
let maintenanceNumber='';
try {maintenanceNumber=residentStorage.getItem(maintenanceKey)||'';} catch {}
let editingNumber=false;

function normalizeNumber(value) {
  const trimmed=value.trim();
  if(!/^[+0-9(). -]+$/.test(trimmed))return '';
  const normalized=trimmed.replace(/[(). -]/g,'');
  return /^\+?\d{7,15}$/.test(normalized)?normalized:'';
}

function emergencyBox() {
  const number=normalizeNumber(maintenanceNumber);
  if(number&&!editingNumber){
    return '<div class="emergency"><h3>Building emergency maintenance</h3><p>Number saved by you for this browser.</p><a class="call" href="tel:'+number+'">Call '+escapeText(maintenanceNumber)+'</a> <button type="button" id="editNum">Change</button></div>';
  }
  return '<div class="emergency"><h3>Building emergency maintenance</h3><p>Enter the maintenance number from your lease or building documents.</p><div class="row"><input type="tel" id="numIn" maxlength="28" autocomplete="off" aria-label="Building maintenance number" value="'+escapeText(maintenanceNumber)+'"><button type="button" id="saveNum">Save number</button></div><p id="numStatus" role="status"></p></div>';
}

function requestSummary() {
  const {context,date} = selectedQuestions();
  const lines = ['Property: '+demoProperty.name,'Topic: '+topics[state.topic].label,'Selection: '+state.kind];
  if (asksUrgency(state.topic,state.kind)) lines.push('Urgent: '+(state.urgent?'Yes':'No'));
  if (context && state.location) lines.push(context.replace(/\?$/,'')+': '+state.location);
  if (state.details) lines.push('Details: '+state.details);
  if (date && state.date) lines.push(date.replace(/\?$/,'')+': '+state.date);
  return lines.join('\n');
}

async function copySummary() {
  const text=requestSummary();
  const status=$('saveStatus');
  try {
    await navigator.clipboard.writeText(text);
    status.textContent='Summary copied. Paste it into your email or resident portal.';
  } catch {
    const fallback=$('copyFallback');
    fallback.hidden=false;
    const field=fallback.querySelector('textarea');
    field.value=text;
    field.focus();
    field.select();
    status.textContent='Copy the selected summary manually.';
  }
}

const topicPresentation = {
  repair:['<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/></svg>','Get help with leaks, heating, power or something broken'],
  moveIn:['<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/></svg>','Collect keys, record meter readings or report a handover issue'],
  moveOut:['<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2h-3"/><path d="M3 15h9M9 12l3 3-3 3"/></svg>','Give notice, arrange an inspection or return your keys'],
  access:['<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>','Get help with a lockout, lost key, fob or entry door'],
  services:['<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19.5" r=".8" fill="currentColor"/></svg>','Find help with internet, cleaning, waste or parking'],
  owner:['<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/></svg>','Ask the landlord about your lease, rent or deposit']
};

function topicButton(key,item) {
  const [icon,description]=topicPresentation[key];
  return '<button type="button" data-topic="'+key+'"><span class="topic-icon" aria-hidden="true">'+icon+'</span><span class="topic-copy"><strong>'+item.label+'</strong><small>'+description+'</small></span></button>';
}

function renderFlow(focus = false) {
  const topic = topics[state.topic];
  const questions = questionnaire[state.topic];
  let html;
  if (state.step === 0) {
    html = '<h2 tabindex="-1">What do you need help with?</h2><p class="choice-intro">Choose the closest match. You’ll answer a few questions about what you need.</p><div class="choices">'+Object.entries(topics).map(([key,item]) => topicButton(key,item)).join('')+'</div><p class="subtle">If anyone is in immediate danger, move to safety and call local emergency services. In the Netherlands, call 112.</p>';
  } else if (state.step === 1) {
    html = '<h2 tabindex="-1">'+topic.label+'</h2><label for="kind">'+questions.select+'</label>'+
      '<select id="kind" required><option value="">Choose an option</option>'+Object.keys(questions.options).map(kind => '<option'+(kind===state.kind?' selected':'')+'>'+kind+'</option>').join('')+'</select>'+
      '<div id="urgency-field"'+(asksUrgency(state.topic,state.kind)?'':' hidden')+'><label for="urgency">Is there immediate danger or ongoing serious damage?</label>'+
      '<select id="urgency"><option value="no">No</option><option value="yes"'+(state.urgent?' selected':'')+'>Yes</option></select></div>';
  } else if (state.step === 2) {
    const title = state.topic==='moveIn' && state.kind==='Report an issue at move-in' ? 'Document the move-in issue' : questions.title;
    html = '<h2 tabindex="-1">'+title+'</h2>'+(state.urgent?'<p class="urgent">If anyone is in immediate danger, move to safety and call local emergency services now. For serious damage without immediate danger, contact building management through its emergency number.</p>':'')+
      detailFields();
  } else {
    if(state.id&&readWorkflow(demoAccount.id).threads.some(thread=>thread.id===state.id))state.sharedRequestId=state.id;
    const result = recommendation();
    html = '<h2 tabindex="-1">Your next steps</h2><p>'+topic.label+' · '+state.kind+'</p>'+(state.urgent?'<aside class="emergency"><h3>Urgent help</h3><p>If anyone is in immediate danger, move to safety and call local emergency services. For urgent property damage, use the building’s emergency maintenance number listed in your lease or resident portal.</p></aside>'+emergencyBox():'')+'<div class="contact">'+result.people.map(key => {const [name,description,path]=contacts[key];const profile=portraits[key];return '<article>'+(profile?'<img class="contact-avatar" src="https://images.unsplash.com/'+profile[1]+'?auto=format&amp;fit=crop&amp;crop=faces&amp;w=128&amp;h=128&amp;q=80" alt="" width="56" height="56">':'')+'<div><h3>'+name+'</h3>'+(profile?'<p class="contact-name">'+profile[0]+'</p>':'')+'<p>'+description+'</p><p class="subtle">'+path+'</p></div></article>';}).join('')+'</div><p><button type="button" data-view="team">See building team</button></p>'+resultChecklist(result.steps)+relatedGuide()+'<p class="subtle">Check your lease for the latest contact details.</p><div class="row"><button type="button" data-back>Edit answers</button><button type="button" class="primary" id="saveDraft">Save request draft</button><button type="button" id="send-manager"'+(state.sharedRequestId?' disabled':'')+'>'+(state.sharedRequestId?'Sent to your building manager':'Send to your building manager')+'</button><button type="button" id="copyReq">Copy request summary</button><button type="button" id="restart">Start another request</button></div><p id="saveStatus" role="status"></p><div id="copyFallback" hidden><label for="copyText">Request summary</label><textarea id="copyText" readonly></textarea></div>';
  }
  const caption = state.step < 3 ? '<p class="progress">Step '+(state.step+1)+' of 3</p>' : '';
  const buttons = state.step === 1 || state.step === 2 ? '<div class="row"><button type="button" data-back>Back</button><button class="primary" type="submit">'+(state.step===1?'Continue':'Show my next steps')+'</button></div>' : '';
  flow.innerHTML = caption + html + buttons;
  if (state.step < 3) {
    const progress = document.createElement('progress');
    progress.max = 3;
    progress.value = state.step + 1;
    progress.setAttribute('aria-label', 'Questionnaire progress');
    flow.querySelector('.progress').after(progress);
  }
  if (focus) flow.querySelector('h2').focus();
}

function capture() {
  if (state.step === 1) {
    const kind = $('kind').value;
    if (state.kind !== kind) {
      state.complete = [];
      state.location = '';
      state.details = '';
      state.date = '';
    }
    state.kind = kind;
    state.urgent = asksUrgency(state.topic,kind) && $('urgency').value === 'yes';
  }
  if (state.step === 2) {
    state.location = $('location')?.value.trim() || '';
    state.details = $('issue-details').value.trim();
    state.date = $('date')?.value || '';
  }
}

function renderDrafts() {
  const list = $('draftList');
  const sentIds = new Set(readWorkflow(demoAccount?.id).threads.map(thread => thread.id));
  const unsent = drafts.filter(draft=>!draft.sharedRequestId&&!sentIds.has(draft.id));
  list.innerHTML = unsent.length ? unsent.map(draft => {
    const id = escapeText(draft.id);
    const repair = draft.topic === 'repair';
    return '<article class="record"><h3>'+escapeText(topics[draft.topic]?.label || 'Request')+'</h3><p>'+escapeText(draft.kind)+'</p><p>'+escapeText(draft.details || 'No notes added')+'</p>'+
      '<div class="row"><button type="button" data-draft="'+id+'">Open draft</button>'+
      (repair ? '<button type="button" data-repair-draft="'+id+'">Continue with repair assistant</button>' : '')+
      '</div></article>';
  }).join('') : '<p>No saved drafts yet.</p>';
}

flow.addEventListener('submit', event => {
  event.preventDefault();
  if (!flow.reportValidity() || state.step < 1 || state.step > 2) return;
  capture();
  state.step++;
  renderFlow(true);
});

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.guideQuery) {
    $('lookup').value=button.dataset.guideQuery;
    showView('property');
    $('lookup').focus();
  }
  if (button.dataset.view) { capture(); showView(button.dataset.view); }
  if (button.dataset.topic || button.dataset.teamRequest) {
    const topic = button.dataset.topic || button.dataset.teamRequest;
    if (button.dataset.teamRequest) showView('guide');
    if (state.topic !== topic) state = {topic,kind:'',urgent:false,details:'',date:''};
    state.step = 1;
    renderFlow(true);
  }
  if (button.hasAttribute('data-back')) {capture();state.step--;renderFlow(true);}
  if (button.id === 'restart') {state={step:0,topic:'',kind:'',urgent:false,details:'',date:''};renderFlow(true);}
  if (button.id === 'send-manager') {
    if(demoAccount?.role!=='tenant'||state.step!==3||state.sharedRequestId)return;
    try {
      state.id ||= crypto.randomUUID();
      state.sharedRequestId=addTenantThread('request',state.kind,requestSummary(),state.id);
      button.disabled=true;
      button.textContent='Sent to your building manager';
      $('saveStatus').textContent='Sent to your building manager. Replies appear in Messages.';
    }catch{$('saveStatus').textContent='This browser could not save the request.';}
  }
  if (button.id === 'copyReq') void copySummary();
  if (button.id === 'editNum') {
    editingNumber=true;
    renderFlow();
    $('numIn').focus();
  }
  if (button.id === 'saveNum') {
    const value=$('numIn').value.trim();
    if(!normalizeNumber(value)){
      $('numStatus').textContent='Enter a phone number with 7 to 15 digits. Include a country code if needed.';
      $('numIn').focus();
      return;
    }
    try {residentStorage.setItem(maintenanceKey,value);}
    catch {
      $('numStatus').textContent='This browser could not save the number.';
      return;
    }
    maintenanceNumber=value;
    editingNumber=false;
    renderFlow(true);
  }
  if (button.id === 'saveDraft') {
    const draft = {...state,id:state.id || crypto.randomUUID()};
    const next = [draft,...drafts.filter(item => item.id !== draft.id)];
    try {
      residentStorage.setItem('centrix-requests',JSON.stringify(next));
      drafts = next; state.id = draft.id;
      $('saveStatus').textContent = 'Draft saved in this browser.';
    } catch { $('saveStatus').textContent = 'This browser could not save the draft.'; }
  }
  if (button.dataset.draft) {
    const draft = drafts.find(item => item.id === button.dataset.draft);
    if (draft) {state={...draft,step:3,urgent:asksUrgency(draft.topic,draft.kind)&&draft.urgent};showView('guide');renderFlow(true);}
  }
});
flow.addEventListener('change', event => {
  const input=event.target;
  if (input.id==='kind') {
    $('urgency-field').hidden=!asksUrgency(state.topic,input.value);
    if (input.value!==state.kind) $('urgency').value='no';
  }
  if (!input.matches('[data-check-step]')) return;
  const complete=new Set(state.complete || []);
  const index=Number(input.dataset.checkStep);
  if(input.checked)complete.add(index); else complete.delete(index);
  state.complete=[...complete];
});
$('lookup').addEventListener('input',renderRecords);
renderFlow();
