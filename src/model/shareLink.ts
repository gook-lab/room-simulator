import type { Plan } from './types';
import { PLAN_EXPORT_FORMAT, PLAN_EXPORT_VERSION, parsePlanExport, type PlanExport } from './planIO';
import { floorsOfBuilding } from './floorStack';

/**
 * 링크 공유 — 백엔드 없이 URL 해시에 도면을 담는다.
 *
 * 해시 내용은 planIO v1 내보내기 객체(+ 다른 층 `floors`)를 deflate-raw 로 줄이고
 * base64url 로 적은 것이다. 받는 쪽은 파일 가져오기와 같은 검증을 거치므로
 * 손상·미래 버전 링크가 같은 기준으로 걸러진다. 해시는 서버로 가지 않는다.
 */

export const SHARE_HASH_PREFIX = '#share=';

/** 압축을 푼 크기 상한 — 짧은 링크가 거대한 문서로 부풀어 탭을 멈추게 하지 못하게 */
const MAX_INFLATED_BYTES = 8 * 1024 * 1024;

type SharePayload = PlanExport & { floors?: Plan[] };

export type ShareLink = {
  url: string;
  floorCount: number;
  /** 밑그림 이미지를 뺐는지 — 공유 알림에 적는다 */
  droppedUnderlay: boolean;
};

export type SharedBundle = {
  /** 받은 층 전부 — 같은 buildingId 로 이어져 있다 */
  plans: Plan[];
  /** 보낸 사람이 보고 있던 층 */
  currentId: string;
};

export type ShareReadResult =
  | { ok: true; bundle: SharedBundle }
  | { ok: false; reason: 'corrupt' | 'version' | 'invalid'; message: string; detail?: string };

export function isShareHash(hash: string): boolean {
  return hash.startsWith(SHARE_HASH_PREFIX) && hash.length > SHARE_HASH_PREFIX.length;
}

/** 밑그림은 이미지 data URL 이라 링크에 담을 수 없다 — 빼고 보낸다 */
function withoutUnderlay(plan: Plan): Plan {
  if (!plan.tracing) return plan;
  const { tracing: _dropped, ...rest } = plan;
  return rest;
}

/** 보고 있는 층을 앞에, 같은 건물의 다른 층을 뒤에 담는다. */
export async function encodeShareHash(
  plans: Record<string, Plan>,
  current: Plan,
): Promise<Omit<ShareLink, 'url'> & { hash: string }> {
  const floors = floorsOfBuilding(plans, current);
  const payload: SharePayload = {
    format: PLAN_EXPORT_FORMAT,
    version: PLAN_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    plan: withoutUnderlay(current),
  };
  const others = floors.filter((f) => f.id !== current.id).map(withoutUnderlay);
  if (others.length > 0) payload.floors = others;
  const bytes = await deflateRaw(JSON.stringify(payload));
  return {
    hash: SHARE_HASH_PREFIX + toBase64Url(bytes),
    floorCount: floors.length,
    droppedUnderlay: floors.some((f) => f.tracing != null),
  };
}

export async function buildShareLink(
  plans: Record<string, Plan>,
  current: Plan,
  baseUrl: string,
): Promise<ShareLink> {
  const { hash, ...rest } = await encodeShareHash(plans, current);
  return { url: baseUrl.split('#')[0] + hash, ...rest };
}

const CORRUPT = '링크가 잘렸거나 손상돼서 열 수 없어요. 보낸 분께 링크를 다시 받아 주세요.';

export async function readShareHash(hash: string): Promise<ShareReadResult> {
  if (!isShareHash(hash)) return { ok: false, reason: 'corrupt', message: CORRUPT };
  let raw: unknown;
  try {
    const text = await inflateRaw(fromBase64Url(hash.slice(SHARE_HASH_PREFIX.length)));
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'corrupt', message: CORRUPT };
  }

  const data = raw as Partial<SharePayload> | null;
  const main = parsePlanExport(raw);
  if (!main.ok) return rejected(data, main.error);
  if (data?.floors != null && !Array.isArray(data.floors)) {
    return rejected(data, 'floors 가 배열이 아닙니다.');
  }
  const received: Plan[] = [main.plan];
  for (const floor of data?.floors ?? []) {
    const r = parsePlanExport({ ...data, plan: floor });
    if (!r.ok) return rejected(data, r.error);
    received.push(r.plan);
  }

  // 받은 문서는 저장소와 무관한 보기 전용 사본 — 층끼리 겹치지 않는 id 만 있으면 된다
  const shared = received.map((p, i) => ({ ...p, id: `shared-${i}` }));
  return { ok: true, bundle: { plans: shared, currentId: shared[0].id } };
}

function rejected(data: Partial<SharePayload> | null, detail: string): ShareReadResult {
  const version = data?.version;
  if (typeof version === 'number' && version > PLAN_EXPORT_VERSION) {
    return {
      ok: false,
      reason: 'version',
      message: '더 새로운 버전의 앱에서 만든 링크예요. 페이지를 새로고침한 뒤 다시 열어 주세요.',
      detail,
    };
  }
  return {
    ok: false,
    reason: 'invalid',
    message: '도면 내용이 손상돼서 열 수 없어요. 보낸 분께 링크를 다시 받아 주세요.',
    detail,
  };
}

/* ---- 압축 · 인코딩 ---- */

async function deflateRaw(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateRaw(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_INFLATED_BYTES) {
      await reader.cancel();
      throw new Error('inflated payload too large');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(await new Blob(chunks as BlobPart[]).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
