const sessionCard = document.querySelector('#session-card');
const modeLine = document.querySelector('#mode-line');
const transcript = document.querySelector('#transcript');
const settingsForm = document.querySelector('#settings-form');
const composer = document.querySelector('#composer');
const messageInput = document.querySelector('#message');
const cityInput = document.querySelector('#home-city');
const unitsInput = document.querySelector('#units');
const languageInput = document.querySelector('#language');
const saveButton = document.querySelector('#save-settings');
const sendButton = document.querySelector('#send');
const suggestionButtons = [...document.querySelectorAll('[data-prompt]')];

let session = { authenticated: false, auth0Configured: false };

function controlsEnabled(enabled) {
  for (const element of [cityInput, unitsInput, languageInput, saveButton, messageInput, sendButton, ...suggestionButtons]) {
    element.disabled = !enabled;
  }
  messageInput.placeholder = enabled
    ? "What's the weather where I live?"
    : 'Log in to ask about the weather where you live';
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error_description || data.error || 'Request failed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function renderSession() {
  sessionCard.replaceChildren();
  if (!session.auth0Configured) {
    const copy = document.createElement('p');
    copy.className = 'setup';
    copy.textContent = 'Auth0 is not configured yet. Copy .env.example to .env, create a Regular Web App and an API with audience https://context-assistant.api, then restart.';
    sessionCard.append(copy);
    modeLine.textContent = 'Login unavailable';
    return;
  }

  if (!session.authenticated) {
    const copy = document.createElement('p');
    copy.className = 'setup';
    copy.textContent = 'Sign in with Auth0 Universal Login. The assistant will call the settings API with your access token, then Open-Meteo with your saved city and units.';
    const actions = document.createElement('div');
    actions.className = 'actions';
    const login = document.createElement('a');
    login.className = 'button';
    login.href = '/login';
    login.id = 'login-link';
    login.textContent = 'Log in';
    actions.append(login);
    sessionCard.append(copy, actions);
    modeLine.textContent = session.llm ? 'Router plus optional LLM phrasing' : 'Deterministic router';
    return;
  }

  const who = document.createElement('div');
  who.className = 'who';
  if (session.user.picture) {
    const image = document.createElement('img');
    image.alt = '';
    image.src = session.user.picture;
    who.append(image);
  } else {
    const fallback = document.createElement('div');
    fallback.className = 'avatar-fallback';
    fallback.textContent = (session.user.name || '?').slice(0, 1);
    who.append(fallback);
  }
  const text = document.createElement('div');
  const name = document.createElement('p');
  name.textContent = session.user.name;
  text.append(name);
  if (session.user.email) {
    const email = document.createElement('p');
    email.className = 'email';
    email.textContent = session.user.email;
    text.append(email);
  }
  who.append(text);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const logout = document.createElement('a');
  logout.className = 'button secondary';
  logout.href = '/logout';
  logout.textContent = 'Log out';
  actions.append(logout);
  sessionCard.append(who, actions);
  const extras = [session.llm ? 'LLM phrasing on' : 'Deterministic router'];
  if (session.tokenVault) extras.push('Token Vault on');
  modeLine.textContent = extras.join(' · ');
}

function fillSettings(settings) {
  if (!settings) return;
  cityInput.value = settings.homeCity || '';
  if (settings.units) unitsInput.value = settings.units;
  if (settings.language) languageInput.value = settings.language;
}

function addMessage(role, text, toolCalls) {
  const empty = transcript.querySelector('.empty');
  if (empty) empty.remove();
  const bubble = document.createElement('article');
  bubble.className = `bubble ${role}`;
  bubble.textContent = text;
  if (toolCalls && toolCalls.length) {
    const tools = document.createElement('div');
    tools.className = 'tools';
    for (const call of toolCalls) {
      const pill = document.createElement('span');
      pill.className = 'tool';
      const detail = call.city ? ` ${call.city}` : '';
      pill.textContent = `${call.api} · ${call.operation}${detail}`;
      tools.append(pill);
    }
    bubble.append(tools);
  }
  transcript.append(bubble);
  transcript.scrollTop = transcript.scrollHeight;
}

function showEmpty() {
  const empty = document.createElement('p');
  empty.className = 'empty';
  empty.textContent = session.authenticated
    ? 'Ask “What’s the weather where I live?” I’ll read your saved city before calling the forecast.'
    : 'The transcript stays empty until you sign in. Your home city, units, and language travel with your Auth0 user.';
  transcript.replaceChildren(empty);
}

async function boot() {
  controlsEnabled(false);
  try {
    session = await api('/api/session');
  } catch (error) {
    session = { authenticated: false, auth0Configured: false };
    modeLine.textContent = error.message;
  }
  renderSession();
  showEmpty();
  if (!session.authenticated) return;
  controlsEnabled(true);
  try {
    fillSettings(await api('/api/me/settings'));
  } catch (error) {
    addMessage('assistant', error.message);
  }
}

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveButton.disabled = true;
  const body = { units: unitsInput.value, language: languageInput.value };
  if (cityInput.value.trim()) body.homeCity = cityInput.value.trim();
  try {
    const saved = await api('/api/me/settings', { method: 'PUT', body: JSON.stringify(body) });
    fillSettings(saved);
    addMessage('assistant', 'Settings saved through the first-party API.');
  } catch (error) {
    addMessage('assistant', error.message);
  } finally {
    saveButton.disabled = !session.authenticated;
  }
});

composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;
  addMessage('you', message);
  messageInput.value = '';
  sendButton.disabled = true;
  try {
    const result = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
    addMessage('assistant', result.reply, result.toolCalls);
    fillSettings(result.settings);
  } catch (error) {
    addMessage('assistant', error.message);
  } finally {
    sendButton.disabled = !session.authenticated;
    messageInput.focus();
  }
});

for (const button of suggestionButtons) {
  button.addEventListener('click', () => {
    messageInput.value = button.dataset.prompt;
    composer.requestSubmit();
  });
}

boot();
