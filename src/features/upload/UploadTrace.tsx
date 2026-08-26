import { useCallback, useRef, useState } from 'react';
import './upload.css';
import type { Plan } from '../../model/types';
import { TEMPLATES } from '../../model/templates';
import { DEFAULT_UNDERLAY_WIDTH_M, buildAutoGeometry, underlaySize } from '../../model/underlay';
import { autoTraceImage } from './autoTrace';
import { useStore } from '../../state/store';
import { MiniPlan } from '../../components/MiniPlan';

/**
 * 업로드 = 즉시 로드.
 *
 * 이미지를 넣으면 곧바로 2D 스케치 화면에 밑그림(언더레이)으로 깔린 새 문서가
 * 열린다 (스케일은 폭 10m 가정으로 시작). 스케일 보정과 벽 자동 인식은
 * 에디터 안 '밑그림' 패널의 선택 기능이다 — 필수 단계가 아니다.
 *
 * localStorage 용량 보호: 긴 변이 1600px 을 넘으면 다운스케일 후 JPEG 재인코딩.
 * 이미지는 plan.tracing 에 저장되므로 재열기·JSON 내보내기에도 유지된다.
 */

const MAX_IMG_DIM = 1600;

/** 스캔 도면 느낌의 샘플 이미지 (data URL SVG) */
const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="560">
  <rect width="780" height="560" fill="white"/>
  <g stroke="#6e6a63" stroke-width="4" fill="none">
    <rect x="140" y="80" width="560" height="400"/>
    <line x1="420" y1="80" x2="420" y2="480"/>
    <line x1="420" y1="270" x2="700" y2="270"/>
  </g>
  <g stroke="#9a968e" stroke-width="3" fill="none">
    <line x1="420" y1="370" x2="700" y2="370"/>
  </g>
  <g fill="#8a867e" font-family="monospace" font-size="15" letter-spacing="2">
    <text x="240" y="290">LIVING</text>
    <text x="530" y="180">BED 1</text>
    <text x="520" y="330">KITCHEN</text>
  </g>
</svg>`;
const SAMPLE_URL = `data:image/svg+xml;utf8,${encodeURIComponent(SAMPLE_SVG)}`;

let idSeq = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${idSeq++}`;

/** 큰 이미지는 다운스케일 + JPEG 재인코딩 (localStorage 보호) */
function normalizeImage(url: string): Promise<{ url: string; w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      const maxDim = Math.max(w, h);
      if (maxDim <= MAX_IMG_DIM) return resolve({ url, w, h });
      try {
        const s = MAX_IMG_DIM / maxDim;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * s);
        canvas.height = Math.round(h * s);
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve({ url, w, h });
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({
          url: canvas.toDataURL('image/jpeg', 0.85),
          w: canvas.width,
          h: canvas.height,
        });
      } catch {
        resolve({ url, w, h });
      }
    };
    img.onerror = () => resolve({ url, w: 1, h: 1 });
    img.src = url;
  });
}

export function UploadTrace() {
  const navigate = useStore((s) => s.navigate);
  const addPlan = useStore((s) => s.addPlan);
  const openPlan = useStore((s) => s.openPlan);
  const addPlanAsFloor = useStore((s) => s.addPlanAsFloor);
  const hasCurrent = useStore((s) => s.plans[s.currentPlanId] != null);
  const [asFloor, setAsFloor] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** 이미지 URL → 언더레이 문서 생성 + 즉시 에디터 진입. fixedWidthM = 스케일을 아는 소스(내장 샘플) */
  const openWithUnderlay = useCallback(
    async (rawUrl: string, name: string, fixedWidthM?: number) => {
      setLoading(true);
      const { url, w, h } = await normalizeImage(rawUrl);
      // 벽·닫힌 공간 자동 인식 — "넣자마자 벽이 세워진 도면"이 기본 (실패 시 빈 도면으로 강등)
      const srcW = 780;
      const srcH = Math.max(1, Math.round((srcW * h) / w));
      const trace = await autoTraceImage(url, srcW, srcH, fixedWidthM ? { knownWidthM: fixedWidthM } : undefined);
      // 스케일: 고정값(내장 샘플) > 벽 픽셀 두께 기반 추정 > 폭 10m 가정
      const size = underlaySize(w, h, fixedWidthM ?? (trace.suggestedWidthM || DEFAULT_UNDERLAY_WIDTH_M));
      let seq = 0;
      const { walls, rooms, openings } = buildAutoGeometry(
        trace,
        srcW,
        srcH,
        size.widthM,
        size.heightM,
        () => `${newId('g')}-ad${seq++}`,
      );
      const plan: Plan = {
        id: newId('plan'),
        name,
        unitScale: 60,
        walls,
        openings,
        rooms,
        items: [],
        tracing: {
          imageUrl: url,
          opacity: 0.5,
          locked: true,
          visible: true,
          widthM: size.widthM,
          heightM: size.heightM,
        },
        updatedAt: new Date().toISOString(),
      };
      if (asFloor && hasCurrent) {
        addPlanAsFloor(plan); // 현재 문서의 새 층으로 연결
      } else {
        addPlan(plan);
        openPlan(plan.id); // → 2D 스케치 화면
      }
    },
    [addPlan, openPlan, addPlanAsFloor, asFloor, hasCurrent],
  );

  const acceptFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        void openWithUnderlay(
          reader.result as string,
          file.name.replace(/\.[^.]+$/, '') || '업로드 도면',
        );
      };
      reader.readAsDataURL(file);
    },
    [openWithUnderlay],
  );

  const startEmpty = useCallback(() => {
    const plan: Plan = {
      id: newId('plan'),
      name: '새 도면',
      unitScale: 60,
      walls: [],
      openings: [],
      rooms: [],
      items: [],
      updatedAt: new Date().toISOString(),
    };
    addPlan(plan);
    openPlan(plan.id);
  }, [addPlan, openPlan]);

  return (
    <div className="upload">
      <header className="upload__topbar">
        <button className="brand" onClick={() => navigate('dashboard')} title="대시보드로">
          <span className="brand__mark" />
        </button>
        <span className="upload__title">새 도면 만들기</span>
      </header>

      <div className="upload__body">
        <div className="upload__canvas">
          <div className="upload__paper">
            <div
              className={`dropzone${dragOver ? ' is-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) acceptFile(f);
              }}
            >
              <span className="dropzone__icon">↑</span>
              <span>
                {loading
                  ? '불러오는 중…'
                  : '평면도 이미지를 끌어다 놓으면 바로 스케치 화면에 열립니다'}
              </span>
              <span className="dropzone__hint">
                PNG · JPG — 스케일 보정·벽 자동 인식은 에디터의 '밑그림' 패널에서
              </span>
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button className="btn btn--dark" onClick={() => fileRef.current?.click()}>
                  파일 선택
                </button>
                <button
                  className="btn btn--outline"
                  onClick={() => void openWithUnderlay(SAMPLE_URL, '샘플 도면', 10.9)}
                >
                  샘플 도면 사용
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) acceptFile(f);
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        </div>

        <aside className="upload__side">
          <h2>평면도를 업로드하세요</h2>
          <p className="desc">
            이미지를 올리면 곧바로 스케치 화면에 밑그림으로 깔립니다. 벽을 그리지
            않아도 가구 배치와 3D 미리보기를 쓸 수 있고, 필요하면 에디터의 '밑그림'
            패널에서 스케일을 맞추거나 벽을 자동 인식할 수 있습니다.
          </p>
          {hasCurrent && (
            <label className="upload__asfloor">
              <input
                type="checkbox"
                checked={asFloor}
                onChange={(e) => setAsFloor(e.target.checked)}
              />
              현재 문서의 <b>새 층</b>으로 추가 (Floor2 등 다층 도면)
            </label>
          )}
          <div className="tpl-section">
            <div className="tpl-section__title">또는 템플릿에서 시작</div>
            {TEMPLATES.map((tpl) => {
              const preview = tpl.build();
              return (
                <button
                  key={tpl.id}
                  className="tpl-card"
                  onClick={() => {
                    const plan = tpl.build();
                    addPlan(plan);
                    openPlan(plan.id);
                  }}
                >
                  <span className="tpl-card__thumb">
                    <MiniPlan plan={preview} width={104} height={68} />
                  </span>
                  <span className="tpl-card__body">
                    <span className="tpl-card__name">{tpl.name}</span>
                    <span className="tpl-card__meta mono">{tpl.sizeLabel}</span>
                    <span className="tpl-card__desc">{tpl.desc}</span>
                  </span>
                </button>
              );
            })}
            <button className="link-plain" onClick={startEmpty}>
              빈 도면에서 시작
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
