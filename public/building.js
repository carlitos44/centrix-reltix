const alexNotices = [
  {id:'heating',kind:'Billing',title:'Heating contribution due',date:'2026-11-30',label:'Due',text:'Your November heating contribution is ready to review.',fee:'heat-nov'},
  {id:'recycling',kind:'Waste collection',title:'Recycling collection',date:'2026-11-24',label:'Scheduled',text:'Use the courtyard recycling point before collection. Check the property guide for the location.',view:'property'},
  {id:'maintenance',kind:'Maintenance',title:'Shared hallway lighting inspection',date:'2026-11-26',label:'Scheduled',text:'The inspection window is 09:00–12:00. Keep shared hallways clear.',view:'team'},
  {id:'noise',kind:'Neighbor notice',title:'Remodeling and expected noise',date:'2026-11-25',label:'Starts',text:'Drilling and light remodeling are expected 09:00–15:00. Contact building management with accessibility or scheduling concerns.',view:'team'},
  {id:'news',kind:'Building news',title:'Winter building notice',date:'2026-11-20',label:'Posted',text:'Use the property guide to find heating information and the building team for support.',view:'property'}
];
const alexFees = [
  {id:'heat-nov',title:'November heating contribution',amount:64.50,due:'2026-11-30',ref:'LC-HEAT-2026-11'},
  {id:'service-nov',title:'November shared service charge',amount:25,due:'2026-12-05',ref:'LC-SVC-2026-11'},
  {id:'repair-nov',title:'Common-area repair contribution',amount:18,due:'2026-12-10',ref:'LC-REP-2026-11'},
  {id:'upkeep-nov',title:'Shared upkeep contribution',amount:12,due:'2026-12-12',ref:'LC-UPKEEP-2026-11'},
  {id:'water-nov',title:'November shared water contribution',amount:21.30,due:'2026-12-12',ref:'LC-WATER-2026-11'},
  {id:'heat-oct',title:'October heating contribution',amount:62,due:'2026-10-31',ref:'LC-HEAT-2026-10',samplePaid:true}
];
const jordanNotices=[
  {id:'meter-b',kind:'Maintenance',title:'Meter reading in Block B',date:'2026-11-27',label:'Scheduled',text:'Visit for Block B, 14:00–16:00. Building management will coordinate access.',view:'team'},
  {id:'bulky-b',kind:'Waste collection',title:'Bulky waste collection for Block B',date:'2026-12-02',label:'Scheduled',text:'Check the property guide for your building’s waste area.',view:'property'},
  {id:'water-b',kind:'Billing',title:'Water contribution due for B-107',date:'2026-12-03',label:'Due',text:'Your water invoice is available under Payments.',fee:'water-b107'},
  {id:'bike-b',kind:'Building news',title:'Bicycle storage changes for Block B',date:'2026-11-21',label:'Posted',text:'The manager can explain temporary storage arrangements during upkeep.',view:'team'}
];
const jordanFees=[
  {id:'water-b107',title:'November water contribution',amount:34.80,due:'2026-12-03',ref:'LC-B107-WATER-11'},
  {id:'upkeep-b107',title:'Block B entrance upkeep',amount:17.25,due:'2026-12-09',ref:'LC-B107-UPKEEP-11'},
  {id:'heat-b107-oct',title:'October heating contribution',amount:53.20,due:'2026-10-31',ref:'LC-B107-HEAT-10',samplePaid:true}
];
const buildingNotices=demoAccount?.id==='alex'?alexNotices:demoAccount?.id==='jordan'?jordanNotices:[];
const buildingFees=demoAccount?.id==='alex'?alexFees:demoAccount?.id==='jordan'?jordanFees:[];
const hubKey='centrix-building-hub';
let savedHub;
try {savedHub=JSON.parse(residentStorage.getItem(hubKey));} catch {}
const readNotices=new Set(Array.isArray(savedHub?.read)?savedHub.read:[]);
const demoPayments=new Set(Array.isArray(savedHub?.paid)?savedHub.paid:[]);
let noticeFilter='all';
const formatAmount=amount=>new Intl.NumberFormat('en-NL',{style:'currency',currency:'EUR'}).format(amount);
const formatDate=date=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(date));
const isPaid=fee=>fee.samplePaid||demoPayments.has(fee.id)||loadManagedPayments(demoAccount?.id).includes(fee.id);
function saveHub(){
  try {
    residentStorage.setItem(hubKey,JSON.stringify({read:[...readNotices],paid:[...demoPayments]}));
    return true;
  } catch {return false;}
}
function updateNoticeCount(){
  const count=buildingNotices.filter(item=>!readNotices.has(item.id)).length;
  $('update-count').textContent=count;
  $('update-count').hidden=count===0;
  $('update-count').setAttribute('aria-label',count+' unread notices');
}
function renderUpdates(){
  const notices=buildingNotices.filter(item=>noticeFilter==='all'||!readNotices.has(item.id));
  $('updates-content').innerHTML='<h2 id="updates-title" tabindex="-1">Notifications</h2><p class="note">News and reminders for '+demoProperty.name+'.</p><div class="row hub-filter"><button type="button" data-notice-filter="all" aria-pressed="'+(noticeFilter==='all')+'">All notices</button><button type="button" data-notice-filter="unread" aria-pressed="'+(noticeFilter==='unread')+'">Unread</button></div><div class="hub-list">'+(notices.length?notices.map(item=>'<article><h3>'+item.title+(!readNotices.has(item.id)?' <span class="pill s-reported">New</span>':'')+'</h3><p class="subtle">'+item.kind+'</p><p class="subtle">'+item.label+' <time datetime="'+item.date+'">'+formatDate(item.date)+'</time></p><p>'+item.text+'</p><div class="row">'+(item.fee?'<button type="button" data-view="fees">Review payments</button>':'<button type="button" data-view="'+item.view+'">'+(item.view==='team'?'Building team':'Property guide')+'</button>')+(!readNotices.has(item.id)?'<button type="button" data-read-notice="'+item.id+'">Mark as read</button>':'')+'</div></article>').join(''):'<p>You’re caught up.</p>')+'</div><p id="updates-status" role="status"></p>';
  updateNoticeCount();
}
function paymentHistory(){
  const entries=buildingFees.filter(isPaid);
  return '<section class="transaction-history"><h3>Transaction history</h3><ul>'+entries.map(fee=>'<li><div><strong>'+fee.title+'</strong><small>'+fee.ref+'</small></div><strong>'+formatAmount(fee.amount)+'</strong></li>').join('')+'</ul></section>';
}
function renderFees(){

  const outstanding=buildingFees.filter(fee=>!isPaid(fee)).reduce((sum,fee)=>sum+fee.amount,0);
  $('fees-content').innerHTML='<h2 id="fees-title" tabindex="-1">Payments</h2><div class="fee-total"><span>Balance due</span><strong>'+formatAmount(outstanding)+'</strong></div><div class="hub-list">'+buildingFees.map(fee=>'<article><div class="fee-row"><div><h3>'+fee.title+'</h3><p class="subtle">Reference '+fee.ref+' · Due <time datetime="'+fee.due+'">'+formatDate(fee.due)+'</time></p></div><strong>'+formatAmount(fee.amount)+'</strong></div>'+'<span class="fee-paid">'+(isPaid(fee)?'Paid':'Outstanding')+'</span>'+'</article>').join('')+'</div>'+paymentHistory()+'<p id="fee-status" role="status"></p><p class="subtle">For a real payment or a billing question, confirm the official payment channel with your building team.</p><button type="button" data-view="team">Building team</button>';
}
$('updates').addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(button?.dataset.noticeFilter){
    noticeFilter=button.dataset.noticeFilter;
    renderUpdates();
    $('updates').querySelector('[aria-pressed=true]')?.focus();
  }
  if(button?.dataset.readNotice){
    const id=button.dataset.readNotice;
    if(!buildingNotices.some(item=>item.id===id))return;
    readNotices.add(id);
    const saved=saveHub();
    renderUpdates();
    $('updates-status').textContent=saved?'Notice marked as read.':'Marked as read for this visit.';
    $('updates-title').focus();
  }
});
updateNoticeCount();
