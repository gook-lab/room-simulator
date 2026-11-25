import { describe, expect, it } from 'vitest';
import {
  SHARE_HASH_PREFIX,
  buildShareLink,
  encodeShareHash,
  isShareHash,
  readShareHash,
} from '../src/model/shareLink';
import { PLAN_EXPORT_FORMAT, PLAN_EXPORT_VERSION } from '../src/model/planIO';
import { TEMPLATES } from '../src/model/templates';
import { createSamplePlan } from '../src/model/samplePlan';
import type { Plan } from '../src/model/types';

const template = (id: string) => TEMPLATES.find((t) => t.id === id)!.build();
const single = (plan: Plan) => ({ [plan.id]: plan });
const withoutMeta = ({ id: _i, updatedAt: _u, ...rest }: Plan) => rest;

/** 테스트용 해시 — 앱과 같은 deflate-raw + base64url 로 임의 내용을 담는다 */
async function craftHash(payload: unknown): Promise<string> {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return SHARE_HASH_PREFIX + b64;
}

const exportOf = (plan: Plan, extra: Record<string, unknown> = {}) => ({
  format: PLAN_EXPORT_FORMAT,
  version: PLAN_EXPORT_VERSION,
  exportedAt: '2026-11-25T00:00:00.000Z',
  plan,
  ...extra,
});

describe('공유 링크 — 왕복', () => {
  it('템플릿 · 샘플 도면이 링크를 거쳐도 id 외 모든 내용이 같다', async () => {
    for (const plan of [createSamplePlan(), ...TEMPLATES.map((t) => t.build())]) {
      const { hash } = await encodeShareHash(single(plan), plan);
      const result = await readShareHash(hash);
      expect(result.ok, plan.name).toBe(true);
      if (!result.ok) continue;
      expect(result.bundle.plans).toHaveLength(1);
      expect(withoutMeta(result.bundle.plans[0])).toEqual(withoutMeta(plan));
    }
  });

  it('25평 템플릿 링크는 주소까지 합쳐 4,000자 이하다', async () => {
    const plan = template('tpl-59');
    const link = await buildShareLink(single(plan), plan, 'https://room-simulator.vercel.app/');
    expect(link.url.startsWith('https://room-simulator.vercel.app/#share=')).toBe(true);
    expect(link.url.length).toBeLessThanOrEqual(4000);
  });

  it('지금 주소에 붙은 해시는 버리고 새 해시를 붙인다', async () => {
    const plan = template('tpl-studio');
    const link = await buildShareLink(single(plan), plan, 'http://127.0.0.1:5191/#share=old');
    expect(link.url.split('#')).toHaveLength(2);
    expect(link.url).toMatch(/^http:\/\/127\.0\.0\.1:5191\/#share=/);
  });

  it('공유 해시만 공유 링크로 본다', () => {
    expect(isShareHash('#share=abc')).toBe(true);
    expect(isShareHash('#share=')).toBe(false);
    expect(isShareHash('#other')).toBe(false);
    expect(isShareHash('')).toBe(false);
  });
});

describe('공유 링크 — 밑그림 제외', () => {
  it('밑그림 이미지는 빼고 담고, 뺐다는 사실을 돌려준다', async () => {
    const image = `data:image/png;base64,${'A'.repeat(200_000)}`;
    const plan: Plan = {
      ...template('tpl-studio'),
      tracing: { imageUrl: image, opacity: 0.5, locked: true, visible: true, widthM: 10 },
    };
    const encoded = await encodeShareHash(single(plan), plan);
    expect(encoded.droppedUnderlay).toBe(true);
    expect(encoded.hash.length).toBeLessThan(4000);
    const result = await readShareHash(encoded.hash);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bundle.plans[0].tracing).toBeUndefined();
  });

  it('밑그림이 없으면 뺐다고 알리지 않는다', async () => {
    const plan = template('tpl-studio');
    expect((await encodeShareHash(single(plan), plan)).droppedUnderlay).toBe(false);
  });
});

describe('공유 링크 — 여러 층', () => {
  const building = (): Record<string, Plan> => {
    const f1 = { ...template('tpl-59'), id: 'f1', buildingId: 'b', floorLabel: '1층' };
    const f2 = { ...template('tpl-studio'), id: 'f2', buildingId: 'b', floorLabel: '2층' };
    const other = { ...createSamplePlan(), id: 'x' };
    return { f1, f2, x: other };
  };

  it('같은 건물의 층을 모두 담고, 보고 있던 층을 먼저 연다', async () => {
    const plans = building();
    const encoded = await encodeShareHash(plans, plans.f2);
    expect(encoded.floorCount).toBe(2);
    const result = await readShareHash(encoded.hash);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { plans: got, currentId } = result.bundle;
    expect(got.map((p) => p.floorLabel)).toEqual(['2층', '1층']);
    expect(new Set(got.map((p) => p.buildingId))).toEqual(new Set(['b']));
    expect(new Set(got.map((p) => p.id)).size).toBe(2);
    expect(currentId).toBe(got[0].id);
    // 다른 건물 문서는 담지 않는다
    expect(got.some((p) => p.name === plans.x.name)).toBe(false);
  });

  it('층 하나가 손상되면 링크 전체를 거부한다', async () => {
    const plans = building();
    const hash = await craftHash(
      exportOf(plans.f1, { floors: [{ ...plans.f2, walls: [{ id: 'w' }] }] }),
    );
    const result = await readShareHash(hash);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid');
  });
});

describe('공유 링크 — 거부', () => {
  it('잘린 링크는 손상으로 거부한다', async () => {
    const plan = template('tpl-59');
    const { hash } = await encodeShareHash(single(plan), plan);
    const result = await readShareHash(hash.slice(0, Math.floor(hash.length / 2)));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('corrupt');
    expect(result.message).toMatch(/어요\.?/);
  });

  it('base64 가 아닌 글자 · 압축이 아닌 내용도 손상으로 거부한다', async () => {
    for (const hash of ['#share=!!!***', '#share=aGVsbG8']) {
      const result = await readShareHash(hash);
      expect(result.ok, hash).toBe(false);
      if (!result.ok) expect(result.reason).toBe('corrupt');
    }
  });

  it('JSON 이 아닌 내용은 손상으로 거부한다', async () => {
    const result = await readShareHash(await craftHash('not json{'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('corrupt');
  });

  it('미래 버전 링크는 planIO 검증 문구를 덧붙여 해요체로 거부한다', async () => {
    const hash = await craftHash({ ...exportOf(template('tpl-studio')), version: 2 });
    const result = await readShareHash(hash);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('version');
    expect(result.message).toContain('새로고침');
    expect(result.detail).toContain('v2');
  });

  it('도면 데이터가 틀리면 planIO 검증 문구와 함께 거부한다', async () => {
    const plan = template('tpl-studio');
    const hash = await craftHash(exportOf({ ...plan, walls: [{ id: 'w-bad' } as never] }));
    const result = await readShareHash(hash);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid');
    expect(result.detail).toContain('w-bad');
  });

  it('다른 앱의 내용이면 거부한다', async () => {
    const result = await readShareHash(await craftHash({ format: 'other', version: 1, plan: {} }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid');
  });

  it('짧은 링크가 거대한 문서로 부풀면 열지 않는다', async () => {
    const hash = await craftHash(exportOf({ ...template('tpl-studio'), name: 'x'.repeat(9_000_000) }));
    expect(hash.length).toBeLessThan(20_000);
    const result = await readShareHash(hash);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('corrupt');
  });
});
