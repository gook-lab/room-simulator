import { useCallback, useEffect, useRef, useState } from 'react';
import './upload.css';
import type { Plan, Room, Vec2, Wall } from '../../model/types';
import { polygonArea } from '../../model/geometry';
import { useStore } from '../../state/store';

const PAPER_W = 780;
const PAPER_H = 560;

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

/** 샘플 자동 인식 결과 (목업 수준의 프리필) */
const SAMPLE_TRACE: TraceLine[] = [
  {
    points: [
      { x: 140, y: 80 },
      { x: 700, y: 80 },
      { x: 700, y: 480 },
      { x: 140, y: 480 },
    ],
    closed: true,
  },
  {
    points: [
      { x: 420, y: 80 },
      { x: 420, y: 480 },
    ],
    closed: false,
  },
  {
    points: [
      { x: 420, y: 270 },
      { x: 700, y: 270 },
    ],
    closed: false,
  },
];

type TraceLine = { points: Vec2[]; closed: boolean };

let idSeq = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${idSeq++}`;

export function UploadTrace() {
  const navigate = useStore((s) => s.navigate);
  const addPlan = useStore((s) => s.addPlan);
  const openPlan = useStore((s) => s.openPlan);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [refLine, setRefLine] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const [drawingRef, setDrawingRef] = useState(false);
  const [meters, setMeters] = useState('4.20');
  const [traced, setTraced] = useState<TraceLine[]>([]);
  const [current, setCurrent] = useState<Vec2[]>([]);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [dragVertex, setDragVertex] = useState<{ line: number; pt: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const toPaper = useCallback((e: { clientX: number; clientY: number }): Vec2 => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(PAPER_W, e.clientX - rect.left)),
      y: Math.max(0, Math.min(PAPER_H, e.clientY - rect.top)),
    };
  }, []);

  const acceptFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(reader.result as string);
      setIsSample(false);
      setStep(2);
    };
    reader.readAsDataURL(file);
  }, []);

  const useSample = useCallback(() => {
    setImageUrl(SAMPLE_URL);
    setIsSample(true);
    setStep(2);
  }, []);

  // 3단계 진입: 샘플이면 자동 인식 결과 프리필
  const goStep3 = useCallback(() => {
    if (isSample && traced.length === 0) {
      setTraced(SAMPLE_TRACE.map((l) => ({ ...l, points: l.points.map((p) => ({ ...p })) })));
    }
    setStep(3);
  }, [isSample, traced.length]);

  /* ===== 포인터 (2단계: 기준선 / 3단계: 벽 그리기) ===== */

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toPaper(e);
    if (step === 2) {
      setRefLine({ a: p, b: p });
      setDrawingRef(true);
      return;
    }
    if (step === 3) {
      // 정점 히트 → 드래그 편집
      for (let li = 0; li < traced.length; li++) {
        for (let pi = 0; pi < traced[li].points.length; pi++) {
          const v = traced[li].points[pi];
          if (Math.hypot(v.x - p.x, v.y - p.y) < 9) {
            setDragVertex({ line: li, pt: pi });
            return;
          }
        }
      }
      // 폴리라인 그리기
      if (current.length >= 3 && Math.hypot(current[0].x - p.x, current[0].y - p.y) < 12) {
        setTraced((t) => [...t, { points: current, closed: true }]);
        setCurrent([]);
        return;
      }
      setCurrent((c) => [...c, p]);
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toPaper(e);
    if (step === 2 && drawingRef) {
      setRefLine((l) => (l ? { ...l, b: p } : l));
      return;
    }
    if (step === 3) {
      if (dragVertex) {
        setTraced((t) =>
          t.map((line, li) =>
            li === dragVertex.line
              ? { ...line, points: line.points.map((pt, pi) => (pi === dragVertex.pt ? p : pt)) }
              : line,
          ),
        );
        return;
      }
      setCursor(p);
    }
  };

  const onPointerUp = () => {
    setDrawingRef(false);
    setDragVertex(null);
  };

  // Enter → 진행 중 폴리라인 확정, Esc → 취소
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Enter' && current.length >= 2) {
        setTraced((t) => [...t, { points: current, closed: false }]);
        setCurrent([]);
      } else if (e.key === 'Escape') {
        if (current.length > 0) setCurrent([]);
        else navigate('dashboard');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, navigate]);

  /* ===== Plan 생성 ===== */

  const pxPerM = (() => {
    const m = parseFloat(meters);
    if (!refLine || !m || m <= 0) return null;
    const len = Math.hypot(refLine.b.x - refLine.a.x, refLine.b.y - refLine.a.y);
    return len > 10 ? len / m : null;
  })();

  const wallSegCount = traced.reduce(
    (s, l) => s + (l.closed ? l.points.length : l.points.length - 1),
    0,
  );
  const closedRooms = traced.filter((l) => l.closed);
  const estAreaSqm = pxPerM
    ? closedRooms.reduce((s, l) => s + polygonArea(l.points) / (pxPerM * pxPerM), 0)
    : 0;

  const buildAndOpen = (empty: boolean) => {
    const scale = pxPerM ?? 60;
    const toM = (p: Vec2): Vec2 => ({
      x: Number((p.x / scale).toFixed(3)),
      y: Number((p.y / scale).toFixed(3)),
    });
    const walls: Wall[] = [];
    const rooms: Room[] = [];
    if (!empty) {
      for (const line of traced) {
        const segs = line.closed ? line.points.length : line.points.length - 1;
        for (let i = 0; i < segs; i++) {
          walls.push({
            id: newId('wall'),
            a: toM(line.points[i]),
            b: toM(line.points[(i + 1) % line.points.length]),
            thickness: 0.15,
            height: 2.4,
          });
        }
        if (line.closed && line.points.length >= 3) {
          const polygon = line.points.map(toM);
          rooms.push({
            id: newId('room'),
            name: `방 ${rooms.length + 1}`,
            wallIds: walls.slice(-segs).map((w) => w.id),
            polygon,
            areaSqm: polygonArea(polygon),
            floor: 'living',
          });
        }
      }
    }
    const plan: Plan = {
      id: newId('plan'),
      name: empty ? '새 도면' : '업로드 도면',
      unitScale: scale,
      walls,
      openings: [],
      rooms,
      items: [],
      tracing:
        !empty && imageUrl
          ? {
              imageUrl,
              opacity: 0.5,
              locked: true,
              visible: true,
              widthM: PAPER_W / scale,
              heightM: PAPER_H / scale,
            }
          : undefined,
      updatedAt: new Date().toISOString(),
    };
    addPlan(plan);
    openPlan(plan.id);
  };

  /* ===== 렌더 ===== */

  const stepState = (n: number) => (n < step ? 'is-done' : n === step ? 'is-current' : '');

  return (
    <div className="upload">
      <header className="upload__topbar">
        <button className="brand" onClick={() => navigate('dashboard')} title="대시보드로">
          <span className="brand__mark" />
        </button>
        <span className="upload__title">새 도면 만들기</span>
        <div className="stepper">
          {(['업로드', '스케일', '벽 확인'] as const).map((label, i) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {i > 0 && <span className="stepper__line" />}
              <span className={`stepper__step ${stepState(i + 1)}`}>
                <span className="stepper__dot">{i + 1}</span>
                {label}
              </span>
            </span>
          ))}
        </div>
      </header>

      <div className="upload__body">
        <div className="upload__canvas">
          <div className="upload__paper">
            {imageUrl && <img className="upload__paper-img" src={imageUrl} alt="원본 도면" />}

            {step === 1 && (
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
                <span>평면도 이미지를 끌어다 놓거나 선택하세요</span>
                <span className="dropzone__hint">PNG · JPG (PDF는 이미지로 변환 후)</span>
                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  <button className="btn btn--dark" onClick={() => fileRef.current?.click()}>
                    파일 선택
                  </button>
                  <button className="btn btn--outline" onClick={useSample}>
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
                  }}
                />
              </div>
            )}

            {step >= 2 && (
              <svg
                ref={svgRef}
                width={PAPER_W}
                height={PAPER_H}
                style={{ cursor: 'crosshair' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                {/* 3단계: 트레이싱 벽 오버레이 */}
                {step === 3 && (
                  <g>
                    {traced.map((line, li) => (
                      <g key={li}>
                        <polyline
                          points={line.points
                            .concat(line.closed ? [line.points[0]] : [])
                            .map((p) => `${p.x},${p.y}`)
                            .join(' ')}
                          fill="none"
                          stroke="#0e9f6e"
                          strokeWidth={6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={0.9}
                        />
                        {line.points.map((p, pi) => (
                          <circle
                            key={pi}
                            cx={p.x}
                            cy={p.y}
                            r={6}
                            fill="#ffffff"
                            stroke="#0e9f6e"
                            strokeWidth={2}
                            style={{ cursor: 'grab' }}
                          />
                        ))}
                      </g>
                    ))}
                    {current.length > 0 && (
                      <g>
                        <polyline
                          points={current
                            .concat(cursor ? [cursor] : [])
                            .map((p) => `${p.x},${p.y}`)
                            .join(' ')}
                          fill="none"
                          stroke="#0e9f6e"
                          strokeWidth={4}
                          strokeDasharray="7 5"
                          strokeLinecap="round"
                        />
                        {current.map((p, pi) => (
                          <circle key={pi} cx={p.x} cy={p.y} r={5} fill="#0e9f6e" />
                        ))}
                        {current.length >= 3 && (
                          <circle
                            cx={current[0].x}
                            cy={current[0].y}
                            r={12}
                            fill="none"
                            stroke="#0e9f6e"
                            strokeWidth={1.5}
                            strokeDasharray="3 3"
                          />
                        )}
                      </g>
                    )}
                  </g>
                )}

                {/* 2단계: 스케일 기준선 */}
                {step === 2 && refLine && (
                  <g>
                    <line
                      x1={refLine.a.x}
                      y1={refLine.a.y}
                      x2={refLine.b.x}
                      y2={refLine.b.y}
                      stroke="#e8590c"
                      strokeWidth={3}
                    />
                    {[refLine.a, refLine.b].map((p, i) => {
                      const dx = refLine.b.x - refLine.a.x;
                      const dy = refLine.b.y - refLine.a.y;
                      const len = Math.hypot(dx, dy) || 1;
                      const nx = (-dy / len) * 10;
                      const ny = (dx / len) * 10;
                      return (
                        <line
                          key={i}
                          x1={p.x - nx}
                          y1={p.y - ny}
                          x2={p.x + nx}
                          y2={p.y + ny}
                          stroke="#e8590c"
                          strokeWidth={3}
                        />
                      );
                    })}
                  </g>
                )}
              </svg>
            )}

            {/* 스케일 입력 칩 */}
            {step === 2 && refLine && (
              <div
                className="scale-chip"
                style={{
                  left: (refLine.a.x + refLine.b.x) / 2,
                  top: Math.min(refLine.a.y, refLine.b.y),
                }}
              >
                이 선의 실제 길이
                <input
                  value={meters}
                  onChange={(e) => setMeters(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
                m
              </div>
            )}
          </div>
        </div>

        {/* 우측 패널 */}
        <aside className="upload__side">
          {step === 1 && (
            <>
              <h2>평면도를 업로드하세요</h2>
              <p className="desc">
                기존 도면 이미지를 올리면 그 위에 벽을 트레이싱해 편집 가능한 평면도를
                만듭니다. 스캔본·사진 모두 가능합니다.
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <h2>스케일을 맞춰주세요</h2>
              <p className="desc">
                도면에서 길이를 아는 벽 하나를 그어 실제 치수를 입력하면, 나머지 치수가
                자동으로 계산됩니다.
              </p>
              <div className="result-card">
                <div className="result-card__header">
                  <span className="result-card__title">자동 인식 결과</span>
                  <span className="badge-accent">신뢰도 92%</span>
                </div>
                <div className="result-row">
                  <span>벽</span>
                  <b>14개</b>
                </div>
                <div className="result-row">
                  <span>문 · 창</span>
                  <b>6 · 4</b>
                </div>
                <div className="result-row">
                  <span>추정 면적</span>
                  <b>{pxPerM ? `${((PAPER_W - 160) * (PAPER_H - 160) * 0.8 / (pxPerM * pxPerM)).toFixed(1)}㎡` : '— (스케일 필요)'}</b>
                </div>
              </div>
              <div className="warn-card">
                <div className="warn-card__title">확인 필요 2곳</div>
                <div className="warn-card__body">
                  욕실 칸막이와 발코니 경계가 흐릿합니다. 3단계에서 직접 이어주세요.
                </div>
              </div>
              <div className="upload__side-footer">
                <button
                  className="btn btn--primary btn--block"
                  disabled={!pxPerM}
                  style={pxPerM ? undefined : { opacity: 0.45, cursor: 'not-allowed' }}
                  onClick={goStep3}
                >
                  벽 확인으로
                </button>
                <button className="link-plain" onClick={() => buildAndOpen(true)}>
                  빈 도면에서 직접 그리기
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2>벽을 확인하세요</h2>
              <p className="desc">
                초록 선이 인식된 벽입니다. 정점을 드래그해 수정하고, 끊긴 벽은 클릭으로
                이어 그리세요. 시작점을 다시 클릭하면 룸이 닫히고, Enter로 열린 벽을
                확정합니다.
              </p>
              <div className="result-card">
                <div className="result-card__header">
                  <span className="result-card__title">트레이싱 현황</span>
                  <span className="badge-accent">수동 확인</span>
                </div>
                <div className="result-row">
                  <span>벽 세그먼트</span>
                  <b>{wallSegCount}개</b>
                </div>
                <div className="result-row">
                  <span>닫힌 룸</span>
                  <b>{closedRooms.length}개</b>
                </div>
                <div className="result-row">
                  <span>추정 면적</span>
                  <b>{estAreaSqm.toFixed(1)}㎡</b>
                </div>
              </div>
              <div className="upload__side-footer">
                <button
                  className="btn btn--primary btn--block"
                  disabled={wallSegCount === 0}
                  style={wallSegCount ? undefined : { opacity: 0.45, cursor: 'not-allowed' }}
                  onClick={() => buildAndOpen(false)}
                >
                  에디터에서 열기
                </button>
                <button className="link-plain" onClick={() => buildAndOpen(true)}>
                  빈 도면에서 직접 그리기
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
