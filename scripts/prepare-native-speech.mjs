import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { prepareCpuSpeech } from './prepare-cpu-speech.mjs';
import { prepareMlxSpeech } from './prepare-mlx-speech.mjs';

export function prepareNativeSpeech(target) {
  if (target === 'aarch64-apple-darwin') return prepareMlxSpeech();
  if (target.includes('windows') || target === 'x86_64-apple-darwin') {
    const speech = prepareCpuSpeech(target);
    return { externalBin: [speech.externalBin], resources: speech.resources };
  }
  return {};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[process.argv.indexOf('--target') + 1];
  const output = process.argv[process.argv.indexOf('--output') + 1];
  if (!process.argv.includes('--target') || !process.argv.includes('--output') || !target || !output) {
    throw new Error('Expected --target triple --output config.json');
  }
  writeFileSync(output, JSON.stringify({ bundle: prepareNativeSpeech(target) }));
}
