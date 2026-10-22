// Shared headless Chrome launcher (system Chrome + SwiftShader WebGL).
import { chromium } from 'playwright-core';

export const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
export const CHROME_ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export function launchChrome() {
  return chromium.launch({ executablePath: CHROME_PATH, args: CHROME_ARGS, headless: true });
}
