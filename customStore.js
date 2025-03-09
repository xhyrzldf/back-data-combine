// customStore.js
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

class CustomStore {
  constructor(options = {}) {
    this.options = options;
    this.filename = options.name || 'config';
    this.filePath = path.join(
      app.getPath('userData'),
      `${this.filename}.json`
    );
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
    return {};
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  }

  get(key) {
    return key ? this.data[key] : this.data;
  }

  set(key, value) {
    if (typeof key === 'object') {
      Object.assign(this.data, key);
    } else {
      this.data[key] = value;
    }
    this.save();
    return this;
  }

  has(key) {
    return key in this.data;
  }

  delete(key) {
    delete this.data[key];
    this.save();
    return this;
  }

  clear() {
    this.data = {};
    this.save();
    return this;
  }
}

module.exports = CustomStore;