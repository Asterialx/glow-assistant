// Only this bounded, server-owned tool may be requested by clients.
export function webSearchOptions(enabled) {
  return enabled === true ? {
    tools: [
      { type: 'openrouter:web_search', parameters: { engine: 'exa', mode: 'auto', max_results: 10, max_total_results: 60, max_uses: 8, max_characters: 10000 } },
      { type: 'openrouter:web_fetch', parameters: { engine: 'exa', max_uses: 8, max_content_tokens: 10000 } },
    ],
  } : {};
}
