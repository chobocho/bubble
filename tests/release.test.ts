import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyRelease } from '../scripts/verify-release.mjs';

// 10KB 를 넘는 인라인 스크립트를 가진 정상 산출물 픽스처
const BIG_SCRIPT = `<script type="module">${'let a=1;'.repeat(2000)}</script>`;
const GOOD_HTML = `<!doctype html><html><head><style>body{}</style></head><body>${BIG_SCRIPT}</body></html>`;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'verify-release-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('verifyRelease', () => {
  it('정상: 인라인 스크립트만 가진 단일 index.html 은 통과한다', () => {
    writeFileSync(join(dir, 'index.html'), GOOD_HTML);
    const r = verifyRelease(dir);
    expect(r.errors).toEqual([]);
    expect(r.size).toBe(Buffer.byteLength(GOOD_HTML));
  });

  it('엣지: release 디렉터리가 없으면 실패한다', () => {
    expect(verifyRelease(join(dir, 'missing')).errors.length).toBeGreaterThan(0);
  });

  it('엣지: 빈 디렉터리는 실패한다', () => {
    expect(verifyRelease(dir).errors.length).toBeGreaterThan(0);
  });

  it('엣지: index.html 외 파일이 있으면 실패한다', () => {
    writeFileSync(join(dir, 'index.html'), GOOD_HTML);
    mkdirSync(join(dir, 'assets'));
    expect(verifyRelease(dir).errors.length).toBeGreaterThan(0);
  });

  it('엣지: 외부 script src 는 실패한다', () => {
    writeFileSync(join(dir, 'index.html'), GOOD_HTML + '<script type="module" src="/assets/a.js"></script>');
    expect(verifyRelease(dir).errors.length).toBeGreaterThan(0);
  });

  it('엣지: 외부 link href 는 실패한다', () => {
    writeFileSync(join(dir, 'index.html'), GOOD_HTML + '<link rel="stylesheet" href="a.css">');
    expect(verifyRelease(dir).errors.length).toBeGreaterThan(0);
  });

  it('엣지: url(http 참조는 실패한다', () => {
    writeFileSync(join(dir, 'index.html'), GOOD_HTML + '<style>a{background:url(https://x/y.png)}</style>');
    expect(verifyRelease(dir).errors.length).toBeGreaterThan(0);
  });

  it('엣지: 상대 경로 동적 import 는 실패한다', () => {
    writeFileSync(join(dir, 'index.html'), GOOD_HTML + '<script>import("./chunk.js")</script>');
    expect(verifyRelease(dir).errors.length).toBeGreaterThan(0);
  });

  it('엣지: 인라인 스크립트가 10KB 이하이면 실패한다', () => {
    writeFileSync(join(dir, 'index.html'), '<html><script>let a=1;</script></html>');
    expect(verifyRelease(dir).errors.length).toBeGreaterThan(0);
  });

  it('엣지: 2MB 이상이면 실패한다', () => {
    const huge = `<html><script>${'x'.repeat(2 * 1024 * 1024)}</script></html>`;
    writeFileSync(join(dir, 'index.html'), huge);
    expect(verifyRelease(dir).errors.length).toBeGreaterThan(0);
  });
});
