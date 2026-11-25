import { useMemo } from 'react';
import './quickStart.css';
import { TEMPLATES } from '../../model/templates';
import { MiniPlan } from '../../components/MiniPlan';
import { useStore } from '../../state/store';
import { isFirstVisit } from './firstVisit';


/**
 * 첫 방문 시작 경로 (기획 D). 대시보드에서 템플릿 하나를 누르면 바로 가구가 놓인 에디터가 열린다.
 * 대시보드 → 에디터 1클릭, 카탈로그 카드 → 도면 클릭까지 가구 1개 배치 3클릭.
 */
export function QuickStart() {
  const planOrder = useStore((s) => s.planOrder);
  const addPlan = useStore((s) => s.addPlan);
  const openPlan = useStore((s) => s.openPlan);
  const previews = useMemo(() => TEMPLATES.map((tpl) => ({ tpl, plan: tpl.build() })), []);
  if (!isFirstVisit(planOrder)) return null;

  return (
    <section className="quickstart" aria-labelledby="quickstart-title">
      <div className="quickstart__head">
        <h3 id="quickstart-title" className="quickstart__title">
          템플릿으로 바로 시작해 보세요
        </h3>
        <p className="quickstart__desc">가구까지 놓인 집을 열고, 옮겨 보고, 3D로 걸어 볼 수 있어요.</p>
      </div>
      <div className="quickstart__list">
        {previews.map(({ tpl, plan }) => (
          <button
            key={tpl.id}
            type="button"
            className="quickstart__card"
            onClick={() => {
              const fresh = tpl.build();
              addPlan(fresh);
              openPlan(fresh.id);
            }}
          >
            <span className="quickstart__thumb">
              <MiniPlan plan={plan} width={96} height={64} />
            </span>
            <span className="quickstart__body">
              <span className="quickstart__name">{tpl.name}</span>
              <span className="quickstart__meta">{tpl.sizeLabel}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
