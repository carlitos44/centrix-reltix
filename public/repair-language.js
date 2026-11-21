export const greetings = {
  en: 'Hi, I’m the Centrix AI repair assistant. How can I help with your repair?',
  nl: 'Hallo, ik ben de AI-reparatieassistent van Centrix. Waarmee kan ik u helpen?',
  es: 'Hola, soy el asistente de reparaciones de Centrix. ¿En qué puedo ayudarle?',
  de: 'Hallo, ich bin der KI-Reparaturassistent von Centrix. Wie kann ich Ihnen helfen?'
};

const messages = {
  en: ['Your repair has been reported.', 'Your appointment is awaiting confirmation.', 'Your appointment is confirmed.', 'Your repair is complete.', 'Your repair request needs attention from building management.', 'The visit is scheduled for', 'Please make sure the contractor can access the affected area.'],
  nl: ['Uw reparatie is gemeld.', 'Uw afspraak wacht op bevestiging.', 'Uw afspraak is bevestigd.', 'Uw reparatie is voltooid.', 'Neem contact op met het gebouwbeheer over uw reparatie.', 'De afspraak staat in de agenda voor', 'Zorg dat de vakman bij de betreffende ruimte kan komen.'],
  es: ['Se ha registrado su solicitud de reparación.', 'Su cita está pendiente de confirmación.', 'Su cita está confirmada.', 'La reparación ha terminado.', 'Póngase en contacto con la administración del edificio sobre su reparación.', 'La visita está prevista para el', 'Asegúrese de que el técnico pueda acceder a la zona afectada.'],
  de: ['Ihre Reparatur wurde gemeldet.', 'Ihr Termin wartet auf Bestätigung.', 'Ihr Termin ist bestätigt.', 'Ihre Reparatur ist abgeschlossen.', 'Wenden Sie sich wegen Ihrer Reparatur an die Hausverwaltung.', 'Der Besuch ist vorgesehen für', 'Bitte stellen Sie sicher, dass der Handwerker den betroffenen Bereich betreten kann.']
};
const locales = {en:'en-GB',nl:'nl-NL',es:'es-ES',de:'de-DE'};

export function repairSpeech(item, language) {
  const phrases = messages[language];
  if (!Object.hasOwn(locales,language)) return null;
  const complete = ['done','invoiced'].includes(item.status);
  const confirmed = ['accepted','scheduled','in_progress'].includes(item.status);
  const pending = ['ordered','received'].includes(item.status);
  const attention = ['emergency','awaiting_approval','rejected','cancelled'].includes(item.status);
  const lines = [phrases[complete?3:confirmed?2:pending?1:attention?4:0]];
  if ((confirmed || pending) && item.slot?.start && item.slot?.end) {
    // Stored times represent local wall time in Maastricht.
    const start = new Date(item.slot.start+'Z'), end = new Date(item.slot.end+'Z');
    if (Number.isFinite(+start) && Number.isFinite(+end)) {
      const fmt = new Intl.DateTimeFormat(locales[language],{dateStyle:'full',timeStyle:'short',timeZone:'UTC'});
      const time = new Intl.DateTimeFormat(locales[language],{timeStyle:'short',timeZone:'UTC'});
      lines.push(`${phrases[5]} ${fmt.format(start)} – ${time.format(end)}.`);
    }
  }
  if (confirmed) lines.push(phrases[6]);
  return lines.join(' ');
}
