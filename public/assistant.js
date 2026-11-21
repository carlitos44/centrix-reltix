// AI repair assistant (ElevenLabs): voice or text, with client tools that call centrix.

import { greetings } from './repair-language.js';
import { $, api, esc, statusLabel, fmtSlot, onEvent } from './shared.js';

export function startAssistant(ctx, unitId) {
  let conv = null;
  let connecting = false;
  let creatingCase;
  let mode = 'voice';
  let caseId = null;
  const pending = []; // lines said before the case existed

  const describe = (v) => typeof v === 'string' ? v
    : [v.make, v.model, v.installed && `installed ${v.installed}`, v.last_service && `last service ${v.last_service}`].filter(Boolean).join(' ');
  const k = ctx.lease.kleinreparatur;
  const first = ctx.tenant.name.split(' ')[0];

  // Fresh context for every call or chat, so a new session picks up the open case and what was said before.
  async function sessionVars() {
    const now = await api('GET', `/api/units/${unitId}/context`);
    const repairs = now.open_cases.filter((c) => c.kind !== 'offer');
    const open = repairs.find((c) => c.id === caseId) || repairs.at(-1);
    caseId = open?.id ?? null;
    const summary = open && [
      open.diagnosis?.label || open.description, `status: ${statusLabel(open.status)}`,
      open.partner_name && `craftsman: ${open.partner_name}`, open.estimate && `estimate €${open.estimate.min_eur}-${open.estimate.max_eur}`,
      open.payment && `paid by ${open.payment.payer}`, open.slot && `appointment: ${fmtSlot(open.slot)}`,
    ].filter(Boolean).join('; ');
    return {
      greeting: greetings.en,
      tenant_name: first,
      unit_label: now.unit.label,
      address: now.property.address,
      building_year: now.property.building_year,
      heating: now.property.heating,
      installations: Object.entries(now.property.installations).map(([n, v]) => `${n}: ${describe(v)}`).join('; '),
      fixtures: now.unit.fixtures.join(', '),
      small_repair_clause: k ? `yes, tenant pays repairs of fixtures up to €${k.max_per_item_eur} per item, max €${k.max_per_year_eur} per year` : 'no',
      open_cases: now.open_cases.map((c) => `${c.id}: ${c.diagnosis?.label || c.description} (${statusLabel(c.status, c.kind)})`).join('; ') || 'none',
      current_case: summary || 'none',
      previous_conversation: open?.messages.slice(-12).map((m) => `${m.from}: ${m.text}`).join('\n') || 'none',
    };
  }

  function line(cls, text) {
    const div = document.createElement('div');
    div.className = `msg ${cls}`;
    div.textContent = text;
    $('log').append(div);
    $('log').scrollTop = $('log').scrollHeight;
  }

  function clearConversationLog() {
    $('log').replaceChildren();
    pending.length = 0;
  }

  function record(from, text) {
    if (!caseId) return pending.push({ from, text });
    api('POST', `/api/cases/${caseId}/messages`, { from, text, channel: mode }).catch(console.error);
  }

  async function ensureCase(description) {
    if (caseId) return;
    creatingCase ||= api('POST','/api/cases',{unit_id:unitId,channel:mode,description});
    try { caseId=(await creatingCase).id; } finally { creatingCase=null; }
    for (const m of pending.splice(0)) record(m.from, m.text);
  }

  // Errors go back to the agent as text so it can recover in the conversation.
  const tool = (label, fn) => async (params) => {
    line('tool', label);
    try { return JSON.stringify(await fn(params)); } catch (e) { return `Error: ${e.message}`; }
  };
  const clientTools = {
    create_case: tool('Case opened in Centrix', async ({ description }) => { await ensureCase(description); return { case_id: caseId }; }),
    diagnose: tool('Diagnosis saved, craftsman found', async (p) => {
      await ensureCase(p.summary);
      const c = await api('POST', `/api/cases/${caseId}/diagnosis`, p);
      return { status: c.status, craftsman: c.partner_name, estimate: c.estimate, payment: c.payment };
    }),
    get_slots: tool('Checking free slots', async () => {
      const [slots,disclosure]=await Promise.all([
        api('GET', `/api/cases/${caseId}/slots`),
        api('GET', `/api/cases/${caseId}/booking-disclosure`)
      ]);
      return {slots,disclosure};
    }),
    book_slot: tool('Appointment requested', async ({ start, end, consent_given }) => {
      const c = await api('POST', `/api/cases/${caseId}/book`, { slot: { start, end }, channel: mode, consent_given });
      return { status: c.status, craftsman: c.partner_name, slot: c.slot };
    }),
  };

  async function start(textOnly) {
    mode = textOnly ? 'portal' : 'voice';
    $('callStatus').textContent = 'Connecting…';
    const [{ signed_url }, dynamicVariables, {Conversation}] = await Promise.all([api('GET', '/api/agent/session'), sessionVars(), import('https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.34.0/+esm')]);
    conv = await Conversation.startSession({
      signedUrl: signed_url,
      textOnly,
      dynamicVariables,
      clientTools,
      onConnect: () => { $('callStatus').textContent = textOnly ? 'Chat connected' : 'Call connected: just talk'; $('call').textContent = 'End call'; },
      onDisconnect: () => { clearConversationLog(); conv = null; $('callStatus').textContent = 'Conversation ended'; $('call').textContent = 'Start a call'; },
      onError: (e) => { $('callStatus').textContent = `Error: ${e?.message || e}`; },
      onModeChange: ({ mode: m }) => { if (!textOnly) $('callStatus').textContent = m === 'speaking' ? 'Assistant speaking…' : 'Listening…'; },
      onMessage: ({ message, role }) => {
        line(role === 'user' ? 'user' : 'agent', message);
        record(role === 'user' ? 'tenant' : 'agent', message);
      },
    });
  }

  $('call').onclick = async () => {
    if(connecting)return;
    connecting=true;
    try {
      if (conv) {
        clearConversationLog();
        await conv.endSession();
      } else await start(false);
    }
    catch (e) { $('callStatus').textContent = e.message; }
    finally { connecting=false; }
  };

  $('chat').onsubmit = async (e) => {
    e.preventDefault();
    const text = $('text').value.trim();
    if (!text || connecting) return;
    connecting=true;
    $('text').value = '';
    try {
      if (!conv) await start(true);
      conv.sendUserMessage(text);
      if (mode === 'portal') { line('user', text); record('tenant', text); }
    } catch (err) { $('callStatus').textContent = err.message; $('text').value=text; }
    finally { connecting=false; }
  };

  onEvent(ev=>{
    if(ev.type==='system.reset'){
      caseId=null;
      clearConversationLog();
      if(conv)conv.endSession().catch(console.error);
    }
  });

  // Restore the open repair case without repopulating the conversation view.
  const open = ctx.open_cases.filter((c) => c.kind !== 'offer').at(-1);
  if (open) caseId = open.id;
}
