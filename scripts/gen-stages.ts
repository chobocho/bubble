// 수제 + 생성 스테이지를 합쳐 src/stages/stages.json 으로 기록한다.
// JSON 을 커밋해 두고, 테스트가 생성기 출력과 비교해 의도치 않은 변경(드리프트)을 잡는다.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildStages, validateStage } from '../src/stages/generator';

const stages = buildStages();
for (const s of stages) {
  const errors = validateStage(s);
  if (errors.length > 0) throw new Error(`stage ${s.id}: ${errors.join(', ')}`);
}
const out = fileURLToPath(new URL('../src/stages/stages.json', import.meta.url));
writeFileSync(out, JSON.stringify(stages, null, 2) + '\n', 'utf8');
console.log(`wrote ${stages.length} stages → src/stages/stages.json`);
