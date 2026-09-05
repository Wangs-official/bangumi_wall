import { COLLECTION_TYPE_LABEL, SUBJECT_TYPE_LABEL, type WallItem } from './bangumi'

/** 卡片小标题可选字段，允许混选、按选择顺序拼接。 */
export const SUBTITLE_FIELDS = [
  { id: 'year', label: '年份' },
  { id: 'date', label: '完整日期' },
  { id: 'collectedAt', label: '收藏时间' },
  { id: 'myRate', label: '我的评分' },
  { id: 'score', label: 'Bangumi 评分' },
  { id: 'rank', label: '排名' },
  { id: 'status', label: '收藏状态' },
  { id: 'type', label: '条目类型' },
  { id: 'progress', label: '观看进度' },
] as const

export type SubtitleField = (typeof SUBTITLE_FIELDS)[number]['id']

export type TitleMode = 'cn' | 'original' | 'hidden'

export interface DisplayConfig {
  /** 封面墙 / 列表 */
  view: 'grid' | 'list'
  /** 显示我写的吐槽 */
  showComment: boolean
  titleMode: TitleMode
  /** 空数组即隐藏小标题 */
  subtitleFields: SubtitleField[]
  /** 封面尺寸档位 */
  size: 'sm' | 'md' | 'lg'
  /** 同屏出现多个类别时，在封面右上角标出类别图标 */
  showTypeIcon: boolean
}

export const DEFAULT_DISPLAY: DisplayConfig = {
  view: 'grid',
  showComment: false,
  titleMode: 'cn',
  subtitleFields: ['year'],
  size: 'md',
  showTypeIcon: true,
}

export function renderTitle(item: WallItem, mode: TitleMode): string | null {
  if (mode === 'hidden') return null
  if (mode === 'original') return item.originalName || item.name
  return item.name
}

function fieldValue(item: WallItem, field: SubtitleField): string | null {
  switch (field) {
    case 'year':
      return item.date ? item.date.slice(0, 4) : null
    case 'date':
      return item.date || null
    case 'collectedAt':
      return item.updatedAt ? item.updatedAt.slice(0, 10) : null
    case 'myRate':
      return item.rate ? `我 ${item.rate}` : null
    case 'score':
      return item.score ? item.score.toFixed(1) : null
    case 'rank':
      return item.rank ? `#${item.rank}` : null
    case 'status':
      return COLLECTION_TYPE_LABEL[item.status] ?? null
    case 'type':
      return SUBJECT_TYPE_LABEL[item.subjectType] ?? null
    case 'progress':
      return item.eps ? `${item.epStatus}/${item.eps}` : item.epStatus ? String(item.epStatus) : null
  }
}

/** 按用户选择的顺序拼接小标题；全部为空则返回 null，让卡片不占那一行。 */
export function renderSubtitle(item: WallItem, fields: SubtitleField[]): string | null {
  const parts = renderSubtitleParts(item, fields)
  // 星号只在拼接版里加；列表视图自己画星
  return parts.length ? parts.map((p) => (p.id === 'score' ? `★ ${p.text}` : p.text)).join(' · ') : null
}

/** 列表视图要按字段分开渲染（评分带星、状态/类型做成小方框），所以需要拆开的版本。 */
export function renderSubtitleParts(
  item: WallItem,
  fields: SubtitleField[],
): { id: SubtitleField; text: string }[] {
  if (!fields.length) return []
  return fields
    .map((id) => ({ id, text: fieldValue(item, id) }))
    .filter((p): p is { id: SubtitleField; text: string } => Boolean(p.text))
}
