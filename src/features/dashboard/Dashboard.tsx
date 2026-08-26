import { useEffect, useRef, useState } from 'react';
import './dashboard.css';
import type { Plan } from '../../model/types';
import { totalPrice } from '../../model/geometry';
import { finishCost } from '../../model/finishes';
import { aggregateLibrary, shoppingListText } from '../../model/library';
import { exportPlan, importPlan } from '../../model/planIO';
import { renderPlanSvgString } from '../editor2d/ExportSvg';
import { useStore } from '../../state/store';
import { MiniPlan } from '../../components/MiniPlan';

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
  const deletePlan = useStore((s) => s.deleteFloor); // 층 문서는 해당 층만 삭제 (마지막 문서 보호)
  const renamePlan = useStore((s) => s.renamePlan);
  const duplicatePlan = useStore((s) => s.duplicatePlan);
  const [listCopied, setListCopied] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // 실수 삭제 방어: 스낵바 되돌리기 (localStorage 특성상 복구 불가 → 메모리 보관)
  const [deleted, setDeleted] = useState<Plan | null>(null);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
  }, []);
  const importRef = useRef<HTMLInputElement>(null);

  const handleDelete = (p: Plan) => {
    const label = p.floorLabel ? `'${p.name} ${p.floorLabel}' 층` : `'${p.name}'`;
    if (!window.confirm(`${label} 도면을 삭제할까요?`)) return;
    deletePlan(p.id);
    setDeleted(p);
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    deleteTimer.current = setTimeout(() => setDeleted(null), 6000);
  };

  const undoDelete = () => {
    if (!deleted) return;
    addPlan(deleted);
    setDeleted(null);
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) renamePlan(renamingId, renameValue.trim());
    setRenamingId(null);
  };

  const downloadJson = (plan: Plan) => {
    const blob = new Blob([exportPlan(plan)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${plan.name.replace(/[\\/:*?"<>|]/g, '_')}.room-simulator.json`;
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
  // 견적 → 가구 라이브러리(쇼핑 리스트) 재포지셔닝: 실판매가만 가격 표시
  const library = estimatePlan
    ? aggregateLibrary(estimatePlan)
    : { rows: [], realSum: 0, realCount: 0, totalSum: 0, estCount: 0 };
  const finish = estimatePlan ? finishCost(estimatePlan) : { rows: [], total: 0 };

  const copyShoppingList = async () => {
    if (!estimatePlan) return;
    try {
      await navigator.clipboard.writeText(shoppingListText(estimatePlan));
      setListCopied(true);
      setTimeout(() => setListCopied(false), 1500);
    } catch {
      // clipboard 권한 없음 — 무시
    }
  };
  return (
    <div className="dashboard">
      <header className="dashboard__topbar">
        <span className="brand">
          <span className="brand__mark" />
          <span className="brand__word">Room Simulator</span>
        </span>
        <nav className="dashboard__nav">
          <button className="dashboard__nav-item is-active">내 도면</button>
          <button className="dashboard__nav-item">가구 라이브러리</button>
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
              <div key={p.id} className="plan-card" role="button" onClick={() => openPlan(p.id)}>
                <span className="plan-card__thumb">
                  {idx === 0 && <span className="plan-card__badge">작업중</span>}
                  <MiniPlan plan={p} width={280} height={150} />
                  <span className="plan-card__actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      title="이름 바꾸기"
                      onClick={() => {
                        setRenamingId(p.id);
                        setRenameValue(p.name);
                      }}
                    >
                      ✎
                    </button>
                    <button title="복제" onClick={() => duplicatePlan(p.id)}>
                      ⧉
                    </button>
                    <button title="JSON 내보내기" onClick={() => downloadJson(p)}>
                      ⤓
                    </button>
                    <button
                      title="삭제"
                      className="plan-card__action-danger"
                      onClick={() => handleDelete(p)}
                    >
                      🗑
                    </button>
                  </span>
                </span>
                <span className="plan-card__body">
                  <div className="plan-card__name">
                    {renamingId === p.id ? (
                      <input
                        className="plan-card__rename"
                        autoFocus
                        value={renameValue}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                      />
                    ) : (
                      p.name
                    )}
                    {p.floorLabel && <span className="plan-card__floor">{p.floorLabel}</span>}
                  </div>
                  <div className="plan-card__meta">
                    {Math.round(planArea(p))}㎡ · 가구 {p.items.length} ·{' '}
                    {shortPrice(totalPrice(p))}
                  </div>
                </span>
              </div>
            ))}
            <button className="plan-card--empty" onClick={() => navigate('upload')}>
              <span className="plus">+</span>
              평면도 업로드
            </button>
          </div>
        </main>

        <aside className="dashboard__side">
          <div className="side-heading">
            <span className="side-heading__title">가구 라이브러리</span>
            <span className="side-heading__meta">{estimatePlan?.name}</span>
          </div>

          <div className="estimate-card">
            <div className="estimate-card__label">실판매가 합계 (확인된 상품)</div>
            <div className="estimate-card__total">
              {library.realCount > 0 ? `₩ ${library.realSum.toLocaleString('ko-KR')}` : '—'}
            </div>
            <div className="estimate-card__caption">
              {library.realCount > 0
                ? `실판매가 ${library.realCount}점 — 가격은 조회 시점 기준`
                : '실제 상품이 연동된 가구가 아직 없습니다'}
              {library.estCount > 0 &&
                ` · 추정 포함 합계 ₩${library.totalSum.toLocaleString('ko-KR')} (${library.estCount}점 추정)`}
            </div>
            <div className="estimate-card__divider" />
            {library.rows.length === 0 && (
              <div className="library-empty">배치된 가구가 없습니다</div>
            )}
            {library.rows.map((r) => (
              <div className="estimate-row" key={r.catalogId}>
                <span className="estimate-row__name">
                  {r.name}
                  {r.count > 1 && <span className="library-qty"> ×{r.count}</span>}
                </span>
                {r.priceKrw != null ? (
                  <span className="estimate-row__price">
                    ₩{(r.priceKrw * r.count).toLocaleString('ko-KR')}
                    {r.url && (
                      <a
                        className="library-link"
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`${r.mall ?? ''}에서 보기`}
                      >
                        ↗
                      </a>
                    )}
                  </span>
                ) : (
                  <span className="estimate-row__price library-noprice">—</span>
                )}
              </div>
            ))}
            {finish.rows.length > 0 && (
              <details className="finish-fold">
                <summary>마감 시공 — 참고 추정 ₩{finish.total.toLocaleString('ko-KR')}</summary>
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
                <div className="finish-fold__note">
                  단가 근사 기반 추정치입니다 — 실제 시공비와 다를 수 있습니다.
                </div>
              </details>
            )}
          </div>

          <div className="share-card">
            <div className="share-card__title">공유</div>
            {/* 링크 공유는 백엔드가 없어 아직 실동작하지 않음 — 가짜 URL 대신 정직하게 안내 */}
            <div className="share-card__pending">
              링크 공유는 준비 중입니다. 지금은 JSON 파일로 도면을 전달할 수 있어요 — 받은
              사람이 「JSON 가져오기」로 열면 됩니다.
            </div>
            <button
              className="btn btn--outline"
              onClick={() => estimatePlan && downloadJson(estimatePlan)}
              disabled={!estimatePlan}
            >
              JSON 내보내기로 공유
            </button>
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

          <button className="btn btn--primary btn--block" onClick={() => void copyShoppingList()}>
            {listCopied ? '복사됨 ✓' : '쇼핑 리스트 복사'}
          </button>
        </aside>
      </div>

      {deleted && (
        <div className="snackbar">
          '{deleted.name}
          {deleted.floorLabel ? ` ${deleted.floorLabel}` : ''}' 삭제됨
          <button onClick={undoDelete}>되돌리기</button>
        </div>
      )}
    </div>
  );
}
