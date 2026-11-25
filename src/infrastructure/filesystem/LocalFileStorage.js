import fs from 'node:fs';
import path from 'node:path';

export class LocalFileStorage {
  constructor(screenshotsDir) {
    this.screenshotsDir = screenshotsDir;
    fs.mkdirSync(this.screenshotsDir, { recursive: true });
  }

  saveScreenshot(tabId, dataUrl) {
    const cleanBase64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const filename = `screenshot-tab${tabId}-${Date.now()}.png`;
    const filepath = path.join(this.screenshotsDir, filename);
    fs.writeFileSync(filepath, Buffer.from(cleanBase64, 'base64'));
    return { filename, filepath };
  }
}
