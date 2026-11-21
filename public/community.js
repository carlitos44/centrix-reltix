const community=$('community-content');
const residentKey='centrix-demo-resident';
const demoInvite='LINDEN-2026';
let resident=demoAccount?.role==='tenant'?{building:'linden-court',name:demoAccount.name,unit:demoAccount.unit,listed:false}:null;
try {
  const saved=JSON.parse(residentStorage.getItem(residentKey));
  if(saved?.building==='linden-court'&&typeof saved.name==='string'&&typeof saved.unit==='string')resident=saved;
} catch {}

function updateResidentNavigation(){
  const joinButton=document.querySelector('.join-home');
  const communityTab=document.querySelector('nav [data-view="community"]');
  if(joinButton)joinButton.hidden=Boolean(resident);
  if(communityTab)communityTab.textContent=resident?'My building':'Resident access';
}

updateResidentNavigation();

function setResident(profile){
  try {
    if(profile)residentStorage.setItem(residentKey,JSON.stringify(profile));
    else residentStorage.removeItem(residentKey);
  } catch {return false;}
  resident=profile;
  updateResidentNavigation();
  return true;
}

function renderCommunity(){
  const heading=resident?demoProperty.name+' community':'Join your building';
  const disclaimer='';
  const registration='<p>In a live building, your landlord or property manager gives you a private invitation linked to your unit.</p>'+disclaimer+
  '<form id="resident-form" class="resident-form"><label for="resident-name">Display name</label><input id="resident-name" required maxlength="40" autocomplete="off" placeholder="e.g. Alex">'+
  '<label for="resident-unit">Unit</label><input id="resident-unit" required maxlength="16" autocomplete="off" placeholder="e.g. A-204">'+
  '<label for="resident-invite">Building invitation</label><input id="resident-invite" required maxlength="32" autocomplete="off" placeholder="Enter invitation code" aria-describedby="invite-hint"><p id="invite-hint" class="subtle">Your code is in your welcome letter (<strong>LINDEN-2026</strong>).</p>'+
  '<div class="resident-optin"><input type="checkbox" id="resident-directory"><label for="resident-directory">Preview my display name in the tenant directory</label></div>'+
  '<button type="submit" class="primary">Join your building</button><p id="community-status" role="status"></p></form>';
  const sample='<div class="community-grid"><article class="record"><h3>Building owner</h3><p>Daniel Mercer</p><p>Get help with lease, rent, and property questions.</p><button type="button" data-view="team">See building team</button></article><article class="record"><h3>Tenant directory</h3><p>Fictional neighbors who chose to appear.</p><ul><li>Robin · Bicycle storage</li><li>Sam · Building welcome group</li>'+
  (resident?.listed?'<li>'+escapeText(resident.name)+' · Your local preview</li>':'')+
  '</ul><div class="resident-optin"><input id="directory-toggle" type="checkbox"'+(resident?.listed?' checked':'')+'><label for="directory-toggle">Show my name in this preview</label></div><button type="button" id="community-intro">'+(resident?.intro?'Edit saved introduction':'Prepare an introduction')+'</button></article></div>';
  const dashboard=resident?'<p class="resident-note">You joined · '+escapeText(resident.name)+' · Unit '+escapeText(resident.unit)+' <br><small>Your unit stays private in this browser.</small></p>'+disclaimer+sample+
  '<div id="intro-panel" hidden><label for="intro-text">Introduction draft</label><textarea id="intro-text" maxlength="600" aria-describedby="intro-note"></textarea><p id="intro-note" class="subtle">Changes save only when you press Save introduction. The draft stays in this browser and is not shared.</p><div class="row"><button type="button" class="primary" id="save-intro">Save introduction</button></div><p id="intro-status" role="status"></p></div><div class="row"><button type="button" id="leave-demo">Sign out of this account</button></div><p id="community-status" role="status"></p>':'';
  community.innerHTML='<h2 id="community-title" tabindex="-1">'+heading+'</h2>'+(resident?dashboard:registration);
}

community.addEventListener('submit',event=>{
  if(event.target.id!=='resident-form')return;
  event.preventDefault();
  const status=$('community-status');
  const name=$('resident-name').value.trim();
  const unit=$('resident-unit').value.trim();
  if(!name||!unit){status.textContent='Enter a display name and unit.';return;}
  if($('resident-invite').value.trim().toUpperCase()!==demoInvite){
    status.textContent='This invitation code does not match your building.';
    $('resident-invite').focus();return;
  }
  if(!setResident({building:'linden-court',name,unit,listed:$('resident-directory').checked})){
    status.textContent='This browser could not save your profile.';return;
  }
  renderCommunity();
  $('community-title').focus();
});
community.addEventListener('change',event=>{
  if(event.target.id!=='directory-toggle'||!resident)return;
  if(setResident({...resident,listed:event.target.checked})){
    renderCommunity();
    $('directory-toggle').focus();
  }else{
    event.target.checked=resident.listed;
    $('community-status').textContent='This browser could not save the directory preference.';
  }
});
community.addEventListener('click',event=>{
  const id=event.target.closest('button')?.id;
  if(id==='community-intro'&&resident){
    $('intro-panel').hidden=false;
    const draft=$('intro-text');
    draft.value=resident.intro||'Hi everyone, I’m '+resident.name+'. I’m part of the '+demoProperty.name+' community. Nice to meet you!';
    $('intro-status').textContent=resident.intro?'Saved introduction loaded.':'';
    draft.focus();
  }
  if(id==='save-intro'&&resident){
    const value=$('intro-text').value.trim();
    const status=$('intro-status');
    if(!value){status.textContent='Write an introduction before saving.';return;}
    if(setResident({...resident,intro:value})){
      status.textContent='Introduction saved in this browser. Nothing was posted.';
      $('community-intro').textContent='Edit saved introduction';
    }else status.textContent='This browser could not save your introduction.';
  }
  if(id==='leave-demo'){
    signOutDemo();
  }
});
