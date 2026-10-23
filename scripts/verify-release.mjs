// 릴리스 산출물 검증 스크립트
// release/ 에 외부 참조 없는 단일 index.html 만 존재하는지 확인한다.
// file:// 로 네트워크 없이 열려야 하므로 외부 리소스 참조는 하나라도 있으면 실패로 본다.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN_INLINE_SCRIPT = 10 * 1024;
const MAX_SIZE = 2 * 1024 * 1024;

/**
 * @param {string} dir
 * @returns {{ errors: string[]; size: number }}
 */
export function verifyRelease(dir) {
  const errors = [];
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return { errors: [`${dir} 디렉터리가 없습니다`], size: 0 };
  }
  const entries = readdirSync(dir);
  if (entries.length !== 1 || entries[0] !== 'index.html') {
    errors.push(`release/ 에는 index.html 하나만 있어야 합니다: [${entries.join(', ')}]`);
  }
  const file = join(dir, 'index.html');
  if (!existsSync(file)) return { errors, size: 0 };

  const html = readFileSync(file, 'utf8');
  const size = statSync(file).size;

  if (/<script\b[^>]*\bsrc\s*=/i.test(html)) errors.push('외부 <script src> 참조가 있습니다');
  if (/<link\b[^>]*\bhref\s*=/i.test(html)) errors.push('외부 <link href> 참조가 있습니다');
  if (/url\(\s*['"]?http/i.test(html)) errors.push('url(http...) 참조가 있습니다');
  if (/import\(\s*['"`]\.{0,2}\//.test(html)) errors.push('상대 경로 동적 import 가 있습니다');

  // 인라인 스크립트 중 가장 긴 것의 본문 길이로 번들이 실제로 인라인되었는지 판단한다.
  let longest = 0;
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    longest = Math.max(longest, m[1].length);
  }
  if (longest <= MIN_INLINE_SCRIPT) {
    errors.push(`인라인 스크립트가 너무 작습니다 (${longest} bytes, 기준 > ${MIN_INLINE_SCRIPT})`);
  }
  if (size >= MAX_SIZE) errors.push(`파일이 너무 큽니다 (${size} bytes, 기준 < ${MAX_SIZE})`);

  return { errors, size };
}

// CLI 로 직접 실행된 경우에만 검사 후 종료 코드를 설정한다 (테스트 import 시에는 실행하지 않음).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(fileURLToPath(new URL('..', import.meta.url)), 'release');
  const { errors, size } = verifyRelease(dir);
  console.log(`release/index.html: ${size} bytes (${(size / 1024).toFixed(1)} KB)`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`FAIL: ${e}`);
    process.exit(1);
  }
  console.log('verify-release: OK');
}
