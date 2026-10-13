import { loadEnv } from 'vite';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { webSearchOptions } from '../api/webSearch.js';
import { researchPolicy } from '../api/researchPolicy.js';

const env = loadEnv('development', process.cwd(), '');
const model = process.argv.find(arg => arg.startsWith('--model='))?.slice(8) || 'z-ai/glm-5.3-flash';
if (!['z-ai/glm-5.3-flash','anthropic/claude-haiku-5.5'].includes(model)) throw new Error('Unsupported test model');
const suffix = model.startsWith('anthropic/') ? '-haiku' : '';
const casesPath = process.argv.find(arg => arg.startsWith('--cases='))?.slice(8);
const outputTag = process.argv.find(arg => arg.startsWith('--tag='))?.slice(6) || '';
if (!/^[a-z0-9-]*$/.test(outputTag)) throw new Error('Invalid report tag');
const key = process.env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY;
if (!key) { console.log('Research live test unavailable: OpenRouter server key not configured.'); process.exit(2); }
const cases = JSON.parse(await readFile(casesPath || new URL('../tests/fixtures/research-cases.json', import.meta.url), 'utf8'));
await mkdir('docs/qa-research', { recursive:true });
for (const item of cases) {
  const started = Date.now(), annotations = new Map(), researchAt = new Date();
  let text = '', usage = null, error = null;
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method:'POST', signal:AbortSignal.timeout(110000), headers:{ Authorization:`Bearer ${key}`, 'Content-Type':'application/json' },
      body:JSON.stringify({ model, stream:true, max_tokens:4096, temperature:0.2, reasoning:{effort:'low'}, ...webSearchOptions(true), messages:[{role:'system',content:researchPolicy(researchAt)},{role:'user',content:item.prompt}] }),
    });
    if (!response.ok || !response.body) throw new Error(`Provider HTTP ${response.status}`);
    let buffer='';
    const consume = line => {
      if (!line.startsWith('data:')) return;
      const data = line.slice(5).trim(); if (data === '[DONE]') return;
      let json; try { json=JSON.parse(data); } catch { return; }
      if (json.error) throw new Error(String(json.error.message || 'Provider stream failed'));
      text += json.choices?.[0]?.delta?.content || '';
      for (const annotation of json.choices?.[0]?.delta?.annotations || []) if (annotation.url_citation?.url) annotations.set(annotation.url_citation.url, annotation.url_citation.title || '');
      if (json.usage) usage=json.usage;
    };
    const decoder=new TextDecoder();
    for await (const chunk of response.body) { buffer+=decoder.decode(chunk,{stream:true}); const lines=buffer.split('\n');buffer=lines.pop() || ''; for(const line of lines) consume(line.trim()); }
    consume((buffer+decoder.decode()).trim());
    if (!text.trim()) throw new Error('No answer');
  } catch(e) { error=e instanceof Error ? e.message : String(e); }
  // Only public research output and aggregate usage; no environment/request headers are persisted.
  const report={ case:item.id, researchAt:researchAt.toISOString(), prompt:item.prompt, model, elapsedSeconds:Math.round((Date.now()-started)/1000), answer:text, sources:[...annotations].map(([url,title])=>({url,title})), usage, error };
  await writeFile(`docs/qa-research/${item.id}${suffix}${outputTag ? '-'+outputTag : ''}.json`, JSON.stringify(report,null,2));
  console.log(JSON.stringify({case:item.id, seconds:report.elapsedSeconds, characters:text.length, citations:annotations.size, error}));
}
