import { useRef, useState } from 'react';
import './dashboard.css';
import type { Plan } from '../../model/types';
import { priceByRoom, totalPrice } from '../../model/geometry';
import { exportPlan, importPlan } from '../../model/planIO';
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
  const total = estimatePlan ? totalPrice(estimatePlan) : 0;
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
                  <div className="plan-card__name">{p.name}</div>
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
            <div className="estimate-card__label">가구 합계</div>
            <div className="estimate-card__total">
              ₩ {total.toLocaleString('ko-KR')}
            </div>
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
            <div className="share-card__title">백업</div>
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
