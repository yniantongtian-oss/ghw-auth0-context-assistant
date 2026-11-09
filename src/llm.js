async function completeWithLlm({
  apiKey,
  baseURL,
  model,
  message,
  draft,
  settings,
  intent,
  fetchImpl = globalThis.fetch,
}) {
  if (!apiKey) return null;
  const response = await fetchImpl(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'You phrase replies for a personal assistant. Use the user preferred language from settings.language. Keep every number, place name, and unit exactly as written in the draft. Do not invent weather, calendar events, or settings. If the intent is unknown, answer briefly from the settings and point at the supported commands in the draft.',
        },
        {
          role: 'user',
          content: JSON.stringify({ intent, message, settings, draft }),
        },
      ],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const text = payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}

module.exports = { completeWithLlm };
