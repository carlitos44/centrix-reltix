// Older local repair cases remain readable after the ElevenLabs cutover.
const partnerEvents={
  reported:'Reported to the repair assistant',
  dispatched:'Sent to heating contractor',
  proposed:'Contractor proposed a new time',
  accepted:'Resident accepted the proposed time',
  confirmed:'Contractor confirmed the requested time',
  completed:'Contractor marked the repair complete',
  declined:'Contractor declined the job'
};
const slotFormat=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'});
const showSlot=slot=>slotFormat.format(new Date(slot+'Z'))+' (Maastricht time)';
const validSlot=slot=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slot)&&Number.isFinite(Date.parse(slot+'Z'));

function renderPartnerTimeline(thread){
  const job=thread.partner;
  const visit=job.slot||job.preferred;
  return '<section class="partner-timeline"><h4>Previous repair timeline</h4>'+
    (validSlot(visit)?'<p>'+escapeText(showSlot(visit))+'</p>':'')+
    '<ol>'+job.events.map(event=>'<li><strong>'+escapeText(partnerEvents[event.type]||event.type)+'</strong>'+
      (event.detail?'<p>'+escapeText(event.detail)+'</p>':'')+'</li>').join('')+'</ol></section>';
}
renderManager();
