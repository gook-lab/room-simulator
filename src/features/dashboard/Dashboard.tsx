import { useRef, useState } from 'react';
import './dashboard.css';
import type { Plan } from '../../model/types';
import { priceByRoom, totalPrice } from '../../model/geometry';
import { finishCost } from '../../model/finishes';
import { exportPlan, importPlan } from '../../model/planIO';
import { renderPlanSvgString } from '../editor2d/ExportSvg';
import { useStore } from '../../state/store';
import { MiniPlan } from '../../components/MiniPlan';
import { catalogById } from '../../model/catalog';

function planArea(plan: Plan): number {
  return plan.rooms.reduce((s, r) => s + r.areaSqm, 0);
}

function shortPrice(v: number): string {
  if (v >= 1_000_000) return `₩${(v / 1_000_000).toFixed(1)}M`;
  return `₩${Math.round(v / 1000)}K`;
}

function updatedAgo(plans: Plan[]): string {
  const latest = Math.max(...plans.map((p) => new Date(p.updatedAt).getTime()));
  const min = Math.floor((Date.now() - latest) / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export function Dashboard() {
  const plans = useStore((s) => s.plans);
  const planOrder = useStore((s) => s.planOrder);
  const currentPlanId = useStore((s) => s.currentPlanId);
  const openPlan = useStore((s) => s.openPlan);
  const addPlan = useStore((s) => s.addPlan);
  const navigate = useStore((s) => s.navigate);
  const [shareViewers3d, setShareViewers3d] = useState(true);
  const [copied, setCopied] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const downloadJson = (plan: Plan) => {
    const blob = new Blob([exportPlan(plan)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${plan.name.replace(/[\\/:*?"<>|]/g, '_')}.roomcast.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const safeName = (plan: Plan) => plan.name.replace(/[\\/:*?"<>|]/g, '_');

  const downloadPng = async (plan: Plan) => {
    const svgStr = renderPlanSvgString(plan);
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('svg load'));
        img.src = url;
      });
      const scale = 2; // 인쇄 품질용 2x
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${safeName(plan)}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, 'image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const printPlan = (plan: Plan) => {
    const svgStr = renderPlanSvgString(plan);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${safeName(plan)}</title>` +
        `<style>@page{margin:10mm}body{margin:0;display:flex;justify-content:center}svg{max-width:100%;height:auto}</style>` +
        `</head><body>${svgStr}</body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  };

  const onImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = importPlan(String(reader.result));
      if (result.ok) {
        setImportError(null);
        addPlan(result.plan);
        openPlan(result.plan.id);
      } else {
        setImportError(result.error);
      }
    };
    reader.readAsText(file);
  };

  const orderedPlans = planOrder.map((id) => plans[id]).filter(Boolean);
  const estimatePlan = plans[currentPlanId] ?? orderedPlans[0];
  const rows = estimatePlan ? priceByRoom(estimatePlan) : [];
  const furnitureTotal = estimatePlan ? totalPrice(estimatePlan) : 0;
  const realPriceCount = estimatePlan
    ? estimatePlan.items.filter((i) => catalogById.get(i.catalogId)?.product).length +
      (estimatePlan.wallItems ?? []).filter((i) => catalogById.get(i.catalogId)?.product).length
    : 0;
  const estPriceCount = estimatePlan
    ? estimatePlan.items.length + (estimatePlan.wallItems ?? []).length - realPriceCount
    : 0;
  const finish = estimatePlan ? finishCost(estimatePlan) : { rows: [], total: 0 };
  const total = furnitureTotal + finish.total;
  const shareUrl = estimatePlan
    ? `roomcast.app/p/${estimatePlan.id.replace('plan-', '')}-${shareViewers3d ? '3d' : 'ro'}`
    : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`https://${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard 권한 없음 — 무시
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard__topbar">
        <span className="brand">
          <span className="brand__mark" />
          <span className="brand__word">Roomcast</span>
        </span>
        <nav className="dashboard__nav">
          <button className="dashboard__nav-item is-active">내 도면</button>
          <button className="dashboard__nav-item">가구 컬렉션</button>
          <button className="dashboard__nav-item">공유받은 도면</button>
          <span className="dashboard__avatar" />
        </nav>
      </header>

      <div className="dashboard__body">
        <main className="dashboard__main">
          <div className="dashboard__header">
            <div>
              <h2 className="dashboard__h2">내 도면</h2>
              <div className="dashboard__sub">
                {orderedPlans.length}개 · 마지막 수정 {updatedAgo(orderedPlans)}
              </div>
            </div>
            <button className="btn btn--dark" onClick={() => navigate('upload')}>
              새 도면 만들기
            </button>
          </div>

          <div className="plan-grid">
            {orderedPlans.map((p, idx) => (
              <button key={p.id} className="plan-card" onClick={() => openPlan(p.id)}>
                <span className="plan-card__thumb">
                  {idx === 0 && <span className="plan-card__badge">작업중</span>}
                  <MiniPlan plan={p} width={280} height={150} />
                </span>
                <span className="plan-card__body">
                  <div className="plan-card__name">
                    {p.name}
                    {p.floorLabel && <span className="plan-card__floor">{p.floorLabel}</span>}
                  </div>
                  <div className="plan-card__meta">
                    {Math.round(planArea(p))}㎡ · 가구 {p.items.length} ·{' '}
                    {shortPrice(totalPrice(p))}
                  </div>
                </span>
              </button>
            ))}
            <button className="plan-card--empty" onClick={() => navigate('upload')}>
              <span className="plus">+</span>
              평면도 업로드
            </button>
          </div>
        </main>

        <aside className="dashboard__side">
          <div className="side-heading">
            <span className="side-heading__title">견적 요약</span>
            <span className="side-heading__meta">{estimatePlan?.name}</span>
          </div>

          <div className="estimate-card">
            <div className="estimate-card__label">
              {finish.total > 0 ? '가구 + 마감 합계' : '가구 합계'}
            </div>
            <div className="estimate-card__total">
              ₩ {total.toLocaleString('ko-KR')}
            </div>
            {realPriceCount > 0 && (
              <div className="estimate-card__caption">
                실판매가 {realPriceCount}점 · 추정가 {estPriceCount}점 기준 — 가격은 조회 시점 기준
              </div>
            )}
            <div className="estimate-card__divider" />
            {rows.map((r) => (
              <div className="estimate-row" key={r.roomId ?? 'etc'}>
                <span className="estimate-row__name">
                  {r.roomName} · {r.count}점
                </span>
                <span className="estimate-row__price">
                  ₩{r.sum.toLocaleString('ko-KR')}
                </span>
              </div>
            ))}
            {finish.rows.length > 0 && (
              <>
                <div className="estimate-card__divider" style={{ marginTop: 12 }} />
                <div className="estimate-card__label" style={{ marginBottom: 6 }}>
                  마감 시공
                </div>
                {finish.rows.map((r) => (
                  <div className="estimate-row" key={`f-${r.roomId}`}>
                    <span className="estimate-row__name">
                      {r.roomName} · {r.labels.join(' + ')}
                    </span>
                    <span className="estimate-row__price">
                      ₩{r.sum.toLocaleString('ko-KR')}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="share-card">
            <div className="share-card__title">공유</div>
            <div className="share-link">
              <span className="share-link__url">{shareUrl}</span>
              <button className="share-link__copy" onClick={copyLink}>
                {copied ? '복사됨' : '복사'}
              </button>
            </div>
            <div className="share-toggle">
              <span>보는 사람도 3D 이동 가능</span>
              <button
                className={`toggle${shareViewers3d ? ' is-on' : ''}`}
                aria-pressed={shareViewers3d}
                onClick={() => setShareViewers3d((v) => !v)}
              />
            </div>
          </div>

          <div className="share-card">
            <div className="share-card__title">내보내기 · 백업</div>
            <div className="backup-actions" style={{ marginBottom: 8 }}>
              <button
                className="btn btn--outline"
                onClick={() => estimatePlan && downloadPng(estimatePlan)}
              >
                PNG 저장
              </button>
              <button
                className="btn btn--outline"
                onClick={() => estimatePlan && printPlan(estimatePlan)}
              >
                인쇄 (PDF)
              </button>
            </div>
            <div className="backup-actions">
              <button
                className="btn btn--outline"
                onClick={() => estimatePlan && downloadJson(estimatePlan)}
              >
                JSON 내보내기
              </button>
              <button className="btn btn--outline" onClick={() => importRef.current?.click()}>
                JSON 가져오기
              </button>
              <input
                ref={importRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onImportFile(f);
                  e.target.value = '';
                }}
              />
            </div>
            {importError && <div className="backup-error">{importError}</div>}
          </div>

          <button className="btn btn--primary btn--block">장바구니로 내보내기</button>
        </aside>
      </div>
    </div>
  );
}
