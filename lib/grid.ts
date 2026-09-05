import { SUBJECT_TYPES } from './bangumi'

/**
 * 「生涯个人喜好表」：一格一个题目，把自己收藏里的作品放进去。
 * 灵感来自 itorr/anime-grid（https://github.com/itorr/anime-grid）。
 * 和原版的区别是不用搜索，直接从左边自己的收藏拖过来。
 */

export interface GridCell {
  /** 稳定 key，改题目时不会导致整格重建 */
  key: string
  label: string
  itemId: number | null
}

export interface GridState {
  cols: number
  cells: GridCell[]
}

/** 各类别的默认题目，5 列 3 行 */
const DEFAULT_LABELS: Record<number, string[]> = {
  2: [
    '入坑作', '最喜欢', '看最多次', '最想安利', '最佳剧情',
    '最佳画面', '最佳配乐', '最佳配音', '最治愈', '最感动',
    '最虐心', '最被低估', '最过誉', '最离谱', '最讨厌',
  ],
  1: [
    '入坑作', '最喜欢', '重读最多', '最想安利', '最佳剧情',
    '最佳文笔', '最佳设定', '最佳角色', '最治愈', '最感动',
    '最虐心', '最被低估', '最过誉', '最离谱', '最讨厌',
  ],
  4: [
    '入坑作', '最喜欢', '玩得最久', '最想安利', '最佳剧情',
    '最佳美术', '最佳音乐', '最佳玩法', '最治愈', '最感动',
    '最肝', '最被低估', '最过誉', '最离谱', '最讨厌',
  ],
  3: [
    '入坑作', '最喜欢', '听最多', '最想安利', '最佳作曲',
    '最佳编曲', '最佳歌词', '最佳演唱', '最治愈', '最感动',
    '最虐心', '最被低估', '最过誉', '最离谱', '最讨厌',
  ],
  6: [
    '入坑作', '最喜欢', '看最多次', '最想安利', '最佳剧情',
    '最佳镜头', '最佳配乐', '最佳演技', '最治愈', '最感动',
    '最虐心', '最被低估', '最过誉', '最离谱', '最讨厌',
  ],
}

export const GRID_TITLE: Record<number, string> = {
  1: '阅读生涯个人喜好表',
  2: '动画生涯个人喜好表',
  3: '音乐生涯个人喜好表',
  4: '游戏生涯个人喜好表',
  6: '影视生涯个人喜好表',
}

export const GRID_TYPES = SUBJECT_TYPES

let seq = 0
export function newCell(label = '新题目'): GridCell {
  return { key: `c${Date.now().toString(36)}${(seq++).toString(36)}`, label, itemId: null }
}

export function defaultGrid(subjectType: number): GridState {
  const labels = DEFAULT_LABELS[subjectType] ?? DEFAULT_LABELS[2]
  return { cols: 5, cells: labels.map((l) => ({ ...newCell(l) })) }
}

const VERSION = 1

export function gridKey(username: string, subjectType: number) {
  return `bw_grid:${username}:${subjectType}`
}

export function loadGrid(username: string, subjectType: number): GridState {
  try {
    const raw = localStorage.getItem(gridKey(username, subjectType))
    if (raw) {
      const g = JSON.parse(raw) as GridState & { v?: number }
      if (g.v === VERSION && Array.isArray(g.cells) && g.cells.length) {
        return { cols: g.cols || 5, cells: g.cells }
      }
    }
  } catch {
    /* 坏数据就退回默认表 */
  }
  return defaultGrid(subjectType)
}

export function saveGrid(username: string, subjectType: number, state: GridState) {
  try {
    localStorage.setItem(gridKey(username, subjectType), JSON.stringify({ v: VERSION, ...state }))
  } catch {
    /* 无痕模式写不了，忽略 */
  }
}

/** 条目在 Bangumi 上的搜索页，作为兜底出口 */
export function bangumiSearchUrl(keyword: string, subjectType: number) {
  return `https://bgm.tv/subject_search/${encodeURIComponent(keyword)}?cat=${subjectType}`
}
