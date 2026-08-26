import type { PlacedItem, Plan, Wall } from '../../model/types';

/**
 * 미리보기=커밋 계약의 원본 잔상(고스트) 계산.
 *
 * 드래그 중 plan 의 라이브 상태가 곧 프리뷰다(스냅·클램프·거부 반영 완료 상태).
 * 따라서 "프리뷰≠커밋" 이 생길 여지가 구조적으로 없다. 이 모듈은 그 위에
 * **원본이 어디 있었는지**(제스처 시작 스냅샷 기준)를 반투명 잔상으로 그리기 위한
 * 포즈 목록만 제공한다. 부모 이동·회전은 자식(표면 적층)도 함께 잔상에 포함한다.
 */
export type DragOriginPoses = { items: PlacedItem[]; walls: Wall[] };

export function dragOriginPoses(
  before: Plan,
  g:
    | { type: 'move' | 'rotate' | 'resize'; itemId: string }
    | { type: 'groupMove'; itemIds: string[] }
    | { type: 'wallEndpointMove' | 'wallBodyMove'; wallId: string },
): DragOriginPoses {
  switch (g.type) {
    case 'move':
    case 'rotate':
    case 'resize':
      return {
        items: before.items.filter(
          (i) => i.id === g.itemId || i.parentId === g.itemId,
        ),
        walls: [],
      };
    case 'groupMove':
      return {
        items: before.items.filter((i) => g.itemIds.includes(i.id)),
        walls: [],
      };
    case 'wallEndpointMove':
    case 'wallBodyMove':
      return { items: [], walls: before.walls.filter((w) => w.id === g.wallId) };
  }
}
