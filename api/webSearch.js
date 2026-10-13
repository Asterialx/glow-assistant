// Only this bounded, server-owned tool may be requested by clients.
export function webSearchOptions(enabled) {
  return enabled === true ? {
    tools: [
      { type: 'openrouter:web_search', parameters: { engine: 'exa', mode: 'auto', max_results: 6, max_total_results: 30, max_uses: 5, max_characters: 6000 } },
      { type: 'openrouter:web_fetch', parameters: { engine: 'exa', max_uses: 5, max_content_tokens: 6000 } },
    ],
  } : {};
}
