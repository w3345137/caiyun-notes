const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tauriConf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const icoPath = path.join(root, 'src-tauri/icons/icon.ico');
const logoPngPath = path.join(root, 'src-tauri/icons/256x256.png');

assert.ok(
  tauriConf.bundle.icon.includes('icons/icon.ico'),
  'Tauri Windows bundle should include src-tauri/icons/icon.ico',
);

const ico = fs.readFileSync(icoPath);
assert.equal(ico.readUInt16LE(0), 0, 'ICO reserved field should be zero');
assert.equal(ico.readUInt16LE(2), 1, 'ICO type should be icon');

const count = ico.readUInt16LE(4);
const entries = [];
for (let index = 0; index < count; index += 1) {
  const offset = 6 + index * 16;
  const widthByte = ico.readUInt8(offset);
  const heightByte = ico.readUInt8(offset + 1);
  const bytesInRes = ico.readUInt32LE(offset + 8);
  const imageOffset = ico.readUInt32LE(offset + 12);
  entries.push({
    width: widthByte === 0 ? 256 : widthByte,
    height: heightByte === 0 ? 256 : heightByte,
    bytesInRes,
    imageOffset,
    payload: ico.subarray(imageOffset, imageOffset + bytesInRes),
  });
}

const requiredSizes = [16, 32, 64, 128, 256];
for (const size of requiredSizes) {
  assert.ok(
    entries.some((entry) => entry.width === size && entry.height === size),
    `Windows icon should include a ${size}x${size} frame`,
  );
}

const largestFrame = entries.find((entry) => entry.width === 256 && entry.height === 256);
assert.ok(largestFrame, 'Windows icon should include a 256x256 frame');
assert.deepEqual(
  largestFrame.payload,
  fs.readFileSync(logoPngPath),
  'Windows icon 256x256 frame should be generated from the current Caiyun logo',
);

console.log('tauri windows icon regression test passed');
