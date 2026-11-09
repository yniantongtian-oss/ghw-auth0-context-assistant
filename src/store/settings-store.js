const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  homeCity: null,
  units: 'celsius',
  language: 'en',
};

function assertSub(sub) {
  if (typeof sub !== 'string' || sub.length < 1 || sub.length > 200) {
    const error = new Error('Access token subject is invalid.');
    error.status = 401;
    error.code = 'invalid_token';
    throw error;
  }
  if (sub === '__proto__' || sub === 'constructor' || sub === 'prototype' || /[\u0000-\u001f\s]/.test(sub)) {
    const error = new Error('Access token subject is invalid.');
    error.status = 401;
    error.code = 'invalid_token';
    throw error;
  }
}

class SettingsStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.chain = Promise.resolve();
  }

  get(sub) {
    assertSub(sub);
    const saved = this.read()[sub];
    if (!saved) {
      return { sub, ...DEFAULTS, persisted: false };
    }
    return {
      sub,
      homeCity: saved.homeCity ?? null,
      units: saved.units || DEFAULTS.units,
      language: saved.language || DEFAULTS.language,
      updatedAt: saved.updatedAt,
      persisted: true,
    };
  }

  update(sub, patch) {
    assertSub(sub);
    return this.enqueue(() => {
      const all = this.read();
      const current = all[sub] || { ...DEFAULTS };
      const next = {
        homeCity: Object.prototype.hasOwnProperty.call(patch, 'homeCity') ? patch.homeCity : (current.homeCity ?? null),
        units: patch.units || current.units || DEFAULTS.units,
        language: patch.language || current.language || DEFAULTS.language,
        updatedAt: new Date().toISOString(),
      };
      all[sub] = next;
      this.write(all);
      return { sub, ...next, persisted: true };
    });
  }

  enqueue(task) {
    const run = this.chain.then(task, task);
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return Object.create(null);
      const clean = Object.create(null);
      for (const [key, value] of Object.entries(parsed)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) clean[key] = value;
      }
      return clean;
    } catch (error) {
      if (error.code === 'ENOENT') return Object.create(null);
      throw error;
    }
  }

  write(data) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2));
    fs.renameSync(temporary, this.filePath);
  }
}

module.exports = { SettingsStore, DEFAULTS };
