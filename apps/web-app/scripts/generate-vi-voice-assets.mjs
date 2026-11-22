import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../public/audio/vi');

const CLIPS = [
  { file: 'ban.mp3', text: 'Bàn' },
  { file: 'co-don-moi.mp3', text: 'có đơn mới' },
  { file: 'co-don-goi-them.mp3', text: 'có đơn gọi thêm' },
  { file: 'nhac-lai.mp3', text: 'Nhắc lại' },
  { file: 'chua-xac-nhan.mp3', text: 'chưa xác nhận' },
  { file: 'dang-cho-xac-nhan.mp3', text: 'đang chờ xác nhận đơn' },
  ...Array.from({ length: 30 }, (_, idx) => {
    const num = idx + 1;
    const padded = String(num).padStart(2, '0');
    return { file: `${padded}.mp3`, text: String(num) };
  }),
];

async function fetchTtsBuffer(text) {
  const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for text "${text}"`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  let generated = 0;

  for (const clip of CLIPS) {
    const outPath = path.join(OUTPUT_DIR, clip.file);
    const buf = await fetchTtsBuffer(clip.text);
    await fs.writeFile(outPath, buf);
    generated += 1;
  }

  console.log(`Generated ${generated} Vietnamese voice clips in ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error('Failed to generate voice assets:', err);
  process.exit(1);
});
