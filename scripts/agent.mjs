// Creates or updates the ElevenLabs repair agent and its client tools. Ids are kept in data/agent.json.
// Usage: node scripts/agent.mjs   (needs ELEVENLABS_API_KEY in .env; optional ELEVENLABS_VOICE_ID, ELEVENLABS_LLM)
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error('ELEVENLABS_API_KEY missing in .env');
const STATE = 'data/agent.json';

async function el(method, path, body) {
  const res = await fetch('https://api.elevenlabs.io' + path, {
    method, headers: { 'xi-api-key': KEY, 'content-type': 'application/json' }, body: body && JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.parse(text).detail?.message || "request failed"}`);
  return text ? JSON.parse(text) : {};
}

const { job_catalogue } = JSON.parse(await readFile('data/seed.json', 'utf8'));
const jobList = Object.entries(job_catalogue).map(([id, j]) => `${id} (${j.label})`).join(', ');

const TOOLS = [
  {
    name: 'create_case',
    description: 'Open a repair case in centrix as soon as you understand the problem. Call it once per conversation.',
    parameters: { type: 'object', properties: { description: { type: 'string', description: "The tenant's problem in one or two sentences" } }, required: ['description'] },
  },
  {
    name: 'diagnose',
    description: `Save your diagnosis. centrix picks the craftsman, gets their price range and decides who pays. Job types: ${jobList}.`,
    parameters: {
      type: 'object',
      properties: {
        job_type: { type: 'string', enum: Object.keys(job_catalogue), description: 'Best matching job type. Leave out only for emergencies.' },
        urgency: { type: 'string', enum: ['normal', 'urgent', 'emergency'], description: 'urgent: no heating, no hot water or water damage in progress. emergency: gas smell, water on electrics, sparks, flooding.' },
        summary: { type: 'string', description: 'One technical sentence for the craftsman' },
        tenant_caused: { type: 'boolean', description: 'True only if the tenant clearly says they caused the damage' },
      },
      required: ['urgency', 'summary'],
    },
  },
  {
    name: 'get_slots',
    description: "Get the craftsman's next free time slots. Only after diagnose returned status approved.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'book_slot',
    description: 'Book only after the resident expressly agrees to share the disclosed fields with the named contractor and confirms the time in a separate reply.',
    parameters: { type: 'object', properties: { start: { type: 'string', description: 'Slot start exactly as returned by get_slots' }, end: { type: 'string', description: 'Slot end exactly as returned by get_slots' }, consent_given: { type: 'boolean', description: 'True only after explicit permission following disclosure' } }, required: ['start', 'end', 'consent_given'] },
  },
];

const PROMPT = `# Role
You are the Centrix repair assistant, an AI voice agent of the Centrix hackathon demo. You help tenants report a problem in their flat and get it fixed. You are an AI: never claim to be a human technician.

# What you already know from centrix (never ask for it)
Tenant: {{tenant_name}}
Flat: {{unit_label}}, {{address}}
Building: built {{building_year}}, {{heating}}
Installations: {{installations}}
Fixtures in the flat: {{fixtures}}
Small-repair clause in the lease: {{small_repair_clause}}
Open cases: {{open_cases}}

# Current open case (from earlier calls or chats)
{{current_case}}
Earlier conversation on it:
{{previous_conversation}}

# How to work
0. If there is a current open case and the tenant talks about it, continue it: do not ask again what you already know, and do not call create_case. All tools already work on that case. Use the status: if it is booked, confirm the appointment; if it is approved, offer slots; if it is waiting for approval, say so.
1. For a new problem, listen. As soon as you understand it, call create_case with a short description.
2. Ask at most three short questions, one at a time, to tell the causes apart: where exactly, since when, is it getting worse, does it affect other flats. Use the building data to ask smart questions.
3. Safety first. Gas smell, water reaching sockets or electrics, sparks or burning smell, or flooding: call diagnose with urgency "emergency". Then tell them: gas, leave the flat without touching switches or flames and call 112 from outside; water, close the main stopcock if it is safe; electrics, switch off the fuse if it is safe. Say the property manager has been alerted. Do not book anything.
4. Otherwise call diagnose with the best matching job_type, the urgency, a one-sentence technical summary, and tenant_caused only if they clearly caused it.
5. Explain the result in two or three short sentences: the likely cause, the simulated price range and sample payer. Do not give legal advice or present any charge as real.
6. If the status is awaiting_approval: say it needs manager approval and the appointment will appear in the portal. Do not offer slots.
7. If the status is approved: call get_slots and offer the first two or three in plain words, for example "Tuesday between 8 and 10". If the tenant pays, get a clear yes to the price range first. After they pick a slot, state the named contractor, exact time, each field from disclosure.fields in plain words, and any access instructions shared after acceptance from disclosure.after_acceptance. Ask whether they agree to share those details and book that time. Wait for a clear yes in a separate reply before calling book_slot with exact start, end and consent_given true. A slot choice alone is not permission. If they decline, do not book.
8. Close: state which demo contractor received the request and the requested time. If book_slot returns accepted, say the demo contractor confirmed the appointment. If it returns ordered, say confirmation is pending. If the slot is no longer available, call get_slots again and ask the resident to choose another time. Tell them they can follow the case in Centrix.

# Ending the conversation
Call end_call only when the resident clearly says goodbye, says they are done, or asks to hang up. Supply a short, friendly farewell in the tool message so they hear it before disconnection. A plain thank-you, acknowledgement, or appointment confirmation is not a goodbye. Keep the conversation open if the resident asks another question.

# Style
If you have not introduced yourself yet, start your first reply by saying you are the Centrix AI repair assistant.
Short sentences, one question at a time, calm and friendly. Detect the resident’s language from their first substantive turn. Use language_detection to switch between English, Dutch, Spanish, and German when needed, then continue in that language. Never invent prices, names or dates: use only what the tools return. Never share data about other tenants.`;

const state = existsSync(STATE) ? JSON.parse(await readFile(STATE, 'utf8')) : { tools: {} };

for (const t of TOOLS) {
  const tool_config = { type: 'client', expects_response: true, response_timeout_secs: 20, ...t };
  if (state.tools[t.name]) await el('PATCH', `/v1/convai/tools/${state.tools[t.name]}`, { tool_config });
  else state.tools[t.name] = (await el('POST', '/v1/convai/tools', { tool_config })).id;
  await writeFile(STATE, JSON.stringify(state, null, 2)); // save as we go, so a failed run never duplicates tools
  console.log(`tool ${t.name}: ${state.tools[t.name]}`);
}

if (!state.voice_id || process.env.ELEVENLABS_VOICE_ID) {
  const { voices } = await el('GET', '/v1/voices');
  const pick = voices.find((v) => v.voice_id === process.env.ELEVENLABS_VOICE_ID) || voices.find((v) => v.category === 'premade') || voices[0];
  state.voice_id = pick.voice_id;
  console.log(`voice: ${pick.name} (${pick.voice_id}). Others: ${voices.slice(0, 12).map((v) => v.name).join(', ')}`);
}

const agent = {
  name: 'Centrix repair assistant',
  conversation_config: {
    agent: {
      first_message: '{{greeting}}', // built by the portal: new problem, or a recap of the open case
      language: 'en',
      prompt: { prompt: PROMPT, llm: process.env.ELEVENLABS_LLM || 'gemini-2.5-flash', tool_ids: Object.values(state.tools), built_in_tools: {
        language_detection: {
          type: 'system',
          name: 'language_detection',
          description: 'Switch to the language the resident is using when it differs from the current language.',
          params: {system_tool_type:'language_detection'},
        },
        end_call: {
          type: 'system',
          name: 'end_call',
          description: 'End this conversation after a clear goodbye or explicit request to hang up. Include a short spoken farewell.',
          params: { system_tool_type: 'end_call' },
        },
      } },
    },
    // Higher stability and less latency optimisation keep the voice from drifting between sentences.
    language_presets: {nl:{overrides:{agent:{first_message:'{{greeting}}'}}},es:{overrides:{agent:{first_message:'{{greeting}}'}}},de:{overrides:{agent:{first_message:'{{greeting}}'}}}},
    tts: { voice_id: state.voice_id, model_id: 'eleven_flash_v2', stability: 0.8, similarity_boost: 0.9, optimize_streaming_latency: 2 },
  },
  platform_settings: { overrides: { conversation_config_override: { conversation: { text_only: true } } } },
};

if (state.agent_id) await el('PATCH', `/v1/convai/agents/${state.agent_id}`, agent);
else state.agent_id = (await el('POST', '/v1/convai/agents/create', agent)).agent_id;
await writeFile(STATE, JSON.stringify(state, null, 2));
console.log(`agent: ${state.agent_id} (saved in ${STATE})`);
