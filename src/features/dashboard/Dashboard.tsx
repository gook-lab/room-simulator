import { useCallback, useEffect, useRef, useState } from 'react';
import './dashboard.css';
import type { Plan } from '../../model/types';
import { finishCost } from '../../model/finishes';
import { aggregateLibrary, shoppingListText } from '../../model/library';
import { exportPlan, importPlan } from '../../model/planIO';
import { renderPlanSvgString } from '../editor2d/ExportSvg';
import { useStore } from '../../state/store';
import { MiniPlan } from '../../components/MiniPlan';
import { planCardMeta, workingPlan } from './planCardFormat';
import { useCopyShareLink } from '../share/useCopyShareLink';

type Section = 'plans' | 'shopping';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function planArea(plan: Plan): number {
  return plan.rooms.reduce((s, r) => s + r.areaSqm, 0);
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
  const showToast = useStore((s) => s.showToast);
  const dashboardFocus = useStore((s) => s.dashboardFocus);
  const clearDashboardFocus = useStore((s) => s.clearDashboardFocus);
  const copyShareLink = useCopyShareLink();
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

  // 상단 내비 = 이 화면의 두 구역으로 이동. 도착한 구역을 포커스하고 잠깐 테두리로 짚는다.
  const plansRef = useRef<HTMLElement>(null);
  const shoppingRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<Section>(() =>
    useStore.getState().dashboardFocus === 'shopping' ? 'shopping' : 'plans',
  );
  const focusSection = useCallback((target: Section) => {
    const el = target === 'plans' ? plansRef.current : shoppingRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    el.focus({ preventScroll: true });
    el.classList.add('is-flash');
    setTimeout(() => el.classList.remove('is-flash'), 1200);
  }, []);
  // 에디터 '쇼핑 리스트' 버튼으로 왔으면 지금 연 도면의 쇼핑 리스트를 바로 보여 준다
  useEffect(() => {
    if (dashboardFocus !== 'shopping') return;
    clearDashboardFocus();
    focusSection('shopping');
  }, [dashboardFocus, clearDashboardFocus, focusSection]);

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
    showToast('JSON 파일을 내려받았어요', `받은 분은 'JSON 가져오기'로 열 수 있어요.`);
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
        showToast('PNG 이미지를 내려받았어요');
      }, 'image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const printPlan = (plan: Plan) => {
    const svgStr = renderPlanSvgString(plan);
    const w = window.open('', '_blank');
    if (!w) {
      showToast('인쇄 창을 열지 못했어요', '브라우저에서 팝업을 허용한 뒤 다시 눌러 주세요.');
      return;
    }
    // 도면 이름은 받은 파일 · 링크에서 올 수 있다 — 새 창 문서에 그대로 쓰면 스크립트가 된다
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(safeName(plan))}</title>` +
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
  const estimatePlan = workingPlan(plans, orderedPlans, currentPlanId);
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
      showToast('복사하지 못했어요', '브라우저의 클립보드 권한을 확인해 주세요.');
    }
  };
  return (
    <div className="dashboard">
      <header className="dashboard__topbar">
        <span className="brand">
          <span className="brand__mark" />
          <span className="brand__word">Room Simulator</span>
        </span>
        <nav className="dashboard__nav" aria-label="화면 구역">
          {(
            [
              ['plans', '내 도면'],
              ['shopping', '쇼핑 리스트'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`dashboard__nav-item${section === key ? ' is-active' : ''}`}
              aria-current={section === key ? 'location' : undefined}
              onClick={() => {
                setSection(key);
                focusSection(key);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="dashboard__body">
        <main className="dashboard__main" ref={plansRef} tabIndex={-1}>
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
            {orderedPlans.map((p) => {
              const thumb = (
                <span className="plan-card__thumb">
                  {p.id === estimatePlan?.id && <span className="plan-card__badge">작업 중</span>}
                  <MiniPlan plan={p} width={280} height={150} fluid />
                </span>
              );
              const floor = p.floorLabel && <span className="plan-card__floor">{p.floorLabel}</span>;
              return (
                <article key={p.id} className="plan-card">
                  {renamingId === p.id ? (
                    <div className="plan-card__open">
                      {thumb}
                      <span className="plan-card__body">
                        <span className="plan-card__name">
                          <input
                            className="plan-card__rename"
                            aria-label="도면 이름"
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename();
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                          />
                          {floor}
                        </span>
                      </span>
                    </div>
                  ) : (
                    <button type="button" className="plan-card__open" onClick={() => openPlan(p.id)}>
                      {thumb}
                      <span className="plan-card__body">
                        <span className="plan-card__name">
                          {p.name}
                          {floor}
                        </span>
                        <span className="plan-card__meta">
                          {planCardMeta(planArea(p), p.items.length, aggregateLibrary(p).totalSum)}
                        </span>
                      </span>
                    </button>
                  )}
                  <div className="plan-card__actions" role="group" aria-label={`${p.name} 관리`}>
                    <button
                      type="button"
                      aria-label="이름 바꾸기"
                      title="이름 바꾸기"
                      onClick={() => {
                        setRenamingId(p.id);
                        setRenameValue(p.name);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      aria-label="복제"
                      title="복제"
                      onClick={() => duplicatePlan(p.id)}
                    >
                      ⧉
                    </button>
                    <button
                      type="button"
                      aria-label="JSON 파일로 내보내기"
                      title="JSON 내보내기"
                      onClick={() => downloadJson(p)}
                    >
                      ⤓
                    </button>
                    <button
                      type="button"
                      aria-label="삭제"
                      title="삭제"
                      className="plan-card__action-danger"
                      onClick={() => handleDelete(p)}
                    >
                      🗑
                    </button>
                  </div>
                </article>
              );
            })}
            <button className="plan-card--empty" onClick={() => navigate('upload')}>
              <span className="plus">+</span>
              평면도 업로드
            </button>
          </div>
        </main>

        <aside className="dashboard__side">
          <div className="side-heading">
            <h2 className="side-heading__title" id="shopping-title">
              쇼핑 리스트
            </h2>
            <span className="side-heading__meta">{estimatePlan?.name}</span>
          </div>

          <div
            className="estimate-card"
            ref={shoppingRef}
            tabIndex={-1}
            aria-labelledby="shopping-title"
          >
            <div className="estimate-card__label">실판매가 합계 (확인된 상품)</div>
            <div className="estimate-card__total">
              {library.realCount > 0 ? `₩ ${library.realSum.toLocaleString('ko-KR')}` : '—'}
            </div>
            <div className="estimate-card__caption">
              {library.realCount > 0
                ? `상품을 확인한 가구 ${library.realCount}점이에요. 가격은 조회했을 때 기준이에요.`
                : '실제 상품과 이어진 가구가 아직 없어요.'}
            </div>
            {library.rows.length > 0 && (
              <div className="estimate-card__caption">
                추정 포함 합계 ₩{library.totalSum.toLocaleString('ko-KR')}
                {library.estCount > 0
                  ? ` · ${library.estCount}점은 카탈로그 가격으로 셌어요. 도면 카드의 '추정 포함' 금액이에요.`
                  : " · 도면 카드의 '추정 포함' 금액이에요."}
              </div>
            )}
            <div className="estimate-card__divider" />
            {library.rows.length === 0 && (
              <div className="library-empty">아직 놓은 가구가 없어요</div>
            )}
            {library.rows.filter((r) => r.priceKrw != null).map((r) => (
              <div className="estimate-row" key={r.catalogId}>
                <span className="estimate-row__name">
                  {r.name}
                  {r.count > 1 && <span className="library-qty"> ×{r.count}</span>}
                </span>
                {r.priceKrw != null && (
                  <span className="estimate-row__price">
                    ₩{(r.priceKrw * r.count).toLocaleString('ko-KR')}
                    {r.url && (
                      <a
                        className="library-link"
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`${r.mall ?? ''}에서 보기`}
                        aria-label={`${r.name} 상품 페이지 (새 창)`}
                      >
                        ↗
                      </a>
                    )}
                  </span>
                )}
              </div>
            ))}
            {library.estCount > 0 && (
              <details className="price-pending" open={library.realCount === 0}>
                <summary>가격 확인 전 {library.estCount}개</summary>
                {library.rows
                  .filter((r) => r.priceKrw == null)
                  .map((r) => (
                    <div className="estimate-row" key={r.catalogId}>
                      <span className="estimate-row__name">
                        {r.name}
                        {r.count > 1 && <span className="library-qty"> ×{r.count}</span>}
                      </span>
                    </div>
                  ))}
              </details>
            )}
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
                  대략 계산한 값이에요. 실제 시공비와 다를 수 있어요.
                </div>
              </details>
            )}
          </div>

          <div className="share-card">
            <div className="share-card__title">링크로 공유</div>
            <div className="share-card__pending">
              링크를 받은 분은 앱을 설치하지 않고 보기 전용으로 열어요. 고치고 싶으면 '내
              도면으로 복사'를 누르면 돼요.
              {estimatePlan?.tracing && ' 밑그림 이미지는 링크에 담기지 않아요.'}
            </div>
            <button
              className="btn btn--outline"
              onClick={() => estimatePlan && void copyShareLink(estimatePlan.id)}
              disabled={!estimatePlan}
            >
              링크 복사
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
            {listCopied ? '복사했어요' : '쇼핑 리스트 복사'}
          </button>
        </aside>
      </div>

      {deleted && (
        <div className="snackbar">
          '{deleted.name}
          {deleted.floorLabel ? ` ${deleted.floorLabel}` : ''}' 도면을 지웠어요
          <button onClick={undoDelete}>되돌리기</button>
        </div>
      )}
    </div>
  );
}
