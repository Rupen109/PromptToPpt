import { authored, rect, W, H } from '../author'
import type { ObjDef, Place, TextObj } from '../author'

/**
 * Neural Network: a machine-learning briefing told by ONE connected graph. Eighteen nodes are the same objects on every slide and regroup into a constellation, a hub with its factors,
 * three clusters, a layered network, a loss chart, a large metric card, two small graphs, a pipeline, a risk tree and a rising timeline. The links are thin rotated rects that
 * `link()` re-computes from the node positions on every scene, so they stay attached while the nodes move; an amber path of its own travels node to node. Original choreography for SlidesDone.
 */
const C = { bg: '#050B1A', teal: '#19E3C6', violet: '#7C5CFF', amber: '#FFB020', ink: '#E8F1FF', mute: '#8CA0BE', link: '#5B8DB8', dim: '#2E4A72', panel: '#0A1730', line: '#27405F', ice: '#9FB8D8' }

type Pt = { x: number; y: number }
/** The Place of a thin rect that joins node a to node b: centred on the midpoint, as long as the distance, turned to the angle between them. */
export const link = (a: Pt, b: Pt, th = 2, extra: Partial<Place> = {}): Place => {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy)
  return { x: (a.x + b.x) / 2 - len / 2, y: (a.y + b.y) / 2 - th / 2, w: len, h: th, rot: (Math.atan2(dy, dx) * 180) / Math.PI, radius: th / 2, ...extra }
}
const pol = (cx: number, cy: number, r: number, deg: number): Pt => ({ x: cx + r * Math.cos((deg * Math.PI) / 180), y: cy + r * Math.sin((deg * Math.PI) / 180) })
const N = 18
const HERO_A = 0, HERO_B = 1
interface NS { x: number; y: number; d: number; fill?: string; a?: number; ring?: number; glow?: number }
type Edge = [number, number] | [number, number, number] | [number, number, number, number]
type Box = { x: number; y: number; w: number; h: number }
interface G {
  nodes: Record<number, NS>; edges: Edge[]; path?: number[][]; avoid?: Box[]; clip?: Box
  rings?: { x: number; y: number; r: number; a?: number }[]; burst?: [number, number]; card?: Place; extra?: Record<string, Place>; texts: Record<string, Place>; bg?: string
}
const nd = (list: [number, number, number, number, Partial<NS>?][]): Record<number, NS> => Object.fromEntries(list.map(([i, x, y, d, e]) => [i, { x, y, d, ...(e ?? {}) }]))
const T = (x: number, y: number, w: number, h: number, text: string, extra: Partial<Place> = {}): Place => ({ ...rect(x, y, w, h), text, ...extra })
const HEAD: Record<string, Place> = { brand: rect(80, 48, 520, 30), page: rect(1240, 48, 600, 30) }

// ── the scenes ──────────────────────────────────────────────────────────────────────────────────────────────────
const cover: [number, number, number, number, Partial<NS>?][] = [
  [0, 1500, 520, 120, { glow: 0.2 }], [1, 1180, 250, 64], [2, 1700, 250, 26, { fill: C.ice }], [3, 1790, 640, 34], [4, 1560, 830, 28, { fill: C.violet }], [5, 1290, 700, 40], [6, 1330, 430, 22, { fill: C.ice }],
  [7, 1000, 160, 22], [8, 700, 150, 26], [9, 330, 170, 20], [10, 200, 900, 30, { fill: C.violet }], [11, 560, 930, 22, { fill: C.ice }], [12, 900, 920, 34], [13, 1150, 900, 22, { fill: C.violet }],
  [14, 1800, 420, 20], [15, 1450, 170, 24, { fill: C.violet }], [16, 1700, 900, 22, { fill: C.ice }], [17, 1840, 150, 18],
]
const coverEdges: Edge[] = [[0, 1], [0, 5], [0, 6], [0, 3], [0, 14], [1, 6], [1, 7], [1, 15], [0, 2], [2, 14], [2, 15], [3, 4], [3, 14], [4, 5], [4, 16], [5, 12], [5, 13], [12, 13], [11, 12], [10, 11], [7, 8], [8, 9], [17, 2]]
const COVER_ZONE: Box = { x: 100, y: 250, w: 1200, h: 560 }
const closeNodes = cover.map(([i, x, y, d, e]) => [i, i === 0 ? 1500 : x, i === 0 ? 560 : 1080 - y, d, e] as [number, number, number, number, Partial<NS>?])

const BUL = [7, 1, 6, 5, 12, 13]
const bulY = (i: number) => 270 + 110 * i
const SAT = [1, 2, 3, 4, 5, 6, 7, 8]
const RC = { x: 1330, y: 560 }
const satPt = (k: number) => pol(RC.x, RC.y, 300, -90 + 45 * k)

const HUBS = [{ id: 0, x: 420, m: [2, 3, 4, 5, 7], fill: C.teal }, { id: 1, x: 960, m: [8, 9, 10, 11, 12], fill: C.violet }, { id: 6, x: 1500, m: [13, 14, 15, 16, 17], fill: C.ice }]
const clusterNodes: [number, number, number, number, Partial<NS>?][] = HUBS.flatMap((h, hi) => [
  [h.id, h.x, 760, hi === 0 ? 76 : 62, hi === 0 ? { glow: 0.2 } : hi === 1 ? { fill: C.violet } : {}] as [number, number, number, number, Partial<NS>?],
  ...h.m.map((m, k) => { const p = pol(h.x, 760, 128 + (k % 2) * 22, 72 * k + 20 + hi * 17); return [m, p.x, p.y, 20 + ((k + hi) % 3) * 4, { fill: h.fill }] as [number, number, number, number, Partial<NS>?] }),
])

const IN = [8, 9, 10, 11, 12], HID = [1, 13, 14, 15, 16, 17], OUT = [0, 2, 3, 4]
const LX = [380, 960, 1540]
const layerNodes: [number, number, number, number, Partial<NS>?][] = [
  ...IN.map((id, i) => [id, LX[0]!, 410 + 125 * i, 44] as [number, number, number, number]),
  ...HID.map((id, i) => [id, LX[1]!, 410 + 100 * i, 54, { fill: C.violet }] as [number, number, number, number, Partial<NS>?]),
  ...OUT.map((id, i) => [id, LX[2]!, 410 + (500 / 3) * i, i === 0 ? 70 : 46, i === 0 ? { glow: 0.2 } : {}] as [number, number, number, number, Partial<NS>?]),
]
const layerEdges: Edge[] = [
  ...IN.flatMap((a, i) => [[a, HID[i]!], [a, HID[i + 1]!], [a, HID[(i + 3) % 6]!]] as Edge[]),
  ...HID.flatMap((h, i) => [[h, OUT[i % 4]!], [h, OUT[(i + 1) % 4]!]] as Edge[]),
].map((e) => [e[0], e[1], 0.34] as Edge)

const TR = [2, 3, 4, 5, 6, 7, 8, 9, 10], VA = [11, 12, 13, 14, 15, 16, 17, 1, 0]
const TL = [1.05, 0.68, 0.47, 0.34, 0.27, 0.22, 0.19, 0.17, 0.155], VL = [1.08, 0.74, 0.54, 0.43, 0.37, 0.34, 0.33, 0.32, 0.3]
const cx = (i: number) => 960 + 97.5 * i, cy = (l: number) => 880 - l * 500
const lossNodes: [number, number, number, number, Partial<NS>?][] = [
  ...TR.map((id, i) => [id, cx(i), cy(TL[i]!), 20] as [number, number, number, number]),
  ...VA.map((id, i) => [id, cx(i), cy(VL[i]!), i === 8 ? 56 : 22, { fill: C.violet, ...(i === 8 ? { glow: 0.2 } : {}) }] as [number, number, number, number, Partial<NS>?]),
]
const chain = (ids: number[], a = 0.75, th = 3): Edge[] => ids.slice(1).map((id, i) => [ids[i]!, id, a, th] as Edge)

const HUB7 = { x: 1400, y: 550 }
const zoomNodes: [number, number, number, number, Partial<NS>?][] = [[0, HUB7.x, HUB7.y, 300, { glow: 0.1 }], ...Array.from({ length: 17 }, (_, k) => {
  const p = pol(HUB7.x, HUB7.y, 250 + (k % 3) * 62, k * 21.2 + 10)
  return [k + 1, p.x, p.y, 18 + (k % 4) * 6, { fill: [C.teal, C.violet, C.ice][k % 3]! }] as [number, number, number, number, Partial<NS>?]
})]

// two small graphs side by side: baseline rules (tree, ids 9-17) and the network (ids 0-8)
const treeNodes: [number, number, number, number, Partial<NS>?][] = [
  [9, 530, 410, 40], [10, 350, 510, 34], [11, 710, 510, 34], [12, 260, 610, 30], [13, 440, 610, 30], [14, 620, 610, 30], [15, 800, 610, 30], [16, 260, 700, 26], [17, 800, 700, 26],
].map(([i, x, y, d]) => [i!, x!, y!, d!, { fill: C.ice }] as [number, number, number, number, Partial<NS>?])
const netIn = [1, 2, 3], netHid = [4, 5, 6, 7], netOut = [0, 8]
const netNodes: [number, number, number, number, Partial<NS>?][] = [
  ...netIn.map((id, i) => [id, 1080, 440 + 110 * i, 38] as [number, number, number, number]),
  ...netHid.map((id, i) => [id, 1390, 400 + 100 * i, 44, { fill: C.violet }] as [number, number, number, number, Partial<NS>?]),
  [0, 1700, 500, 62, { glow: 0.2 }], [8, 1700, 600, 38],
]
const netEdges: Edge[] = [...netIn.flatMap((a) => netHid.map((b) => [a, b, 0.3] as Edge)), ...netHid.flatMap((a) => netOut.map((b) => [a, b, 0.3] as Edge))]
const treeEdges: Edge[] = [[9, 10], [9, 11], [10, 12], [10, 13], [11, 14], [11, 15], [12, 16], [15, 17]].map((e) => [e[0]!, e[1]!, 0.5] as Edge)

const STG = [9, 10, 0, 3, 4, 5], PKT = [1, 2, 6, 7, 8, 11, 12, 13, 14, 15, 16, 17]
const sx = (i: number) => 220 + 296 * i
const pipeNodes: [number, number, number, number, Partial<NS>?][] = [
  ...STG.map((id, i) => [id, sx(i), 600, id === 0 ? 130 : 80, { fill: i % 2 ? C.violet : C.teal, ...(id === 0 ? { glow: 0.2 } : {}) }] as [number, number, number, number, Partial<NS>?]),
  ...PKT.map((id, k) => {
    const g = Math.floor(k / 2), f = k % 2 ? 2 / 3 : 1 / 3
    const x = k < 10 ? sx(g) + (sx(g + 1) - sx(g)) * f : k === 10 ? 125 : 1795
    return [id, x, 600, 16, { fill: k % 2 ? C.teal : C.amber }] as [number, number, number, number, Partial<NS>?]
  }),
]

const RISK = [{ id: 1, y: 410, leaves: [4, 5] }, { id: 2, y: 640, leaves: [6, 7] }, { id: 3, y: 870, leaves: [8, 9] }]
const treeRiskNodes: [number, number, number, number, Partial<NS>?][] = [
  [0, 240, 640, 100, { glow: 0.2 }],
  ...RISK.flatMap((r, i) => [[r.id, 620, r.y, 56, { fill: i === 0 ? C.amber : C.violet, ...(i === 0 ? { ring: 1.7 } : {}) }] as [number, number, number, number, Partial<NS>?], ...r.leaves.map((l, k) => [l, 920, r.y + (k ? 42 : -42), 26] as [number, number, number, number])]),
]
const riskEdges: Edge[] = RISK.flatMap((r) => [[0, r.id, 0.55], ...r.leaves.map((l) => [r.id, l, 0.45] as Edge)] as Edge[])

const MS = [3, 4, 2, 1, 0]
const msX = (i: number) => 200 + 340 * i, msY = (i: number) => 800 - 105 * i
const stairNodes: [number, number, number, number, Partial<NS>?][] = MS.map((id, i) => [id, msX(i), msY(i), [34, 40, 46, 56, 100][i]!, id === 0 ? { glow: 0.2 } : {}] as [number, number, number, number, Partial<NS>?])

const SCENES: G[] = [
  { // 1 cover
    nodes: nd(cover), edges: coverEdges.map((e) => [e[0], e[1], 0.3] as Edge), path: [[9, 8, 7, 1, 0]], clip: COVER_ZONE, burst: [900, 0.35], avoid: [COVER_ZONE],
    texts: { ...HEAD, k: T(120, 262, 900, 34, 'ML PROJECT BRIEFING  ·  SAMPLE'), title: T(120, 322, 1220, 340, 'Predicting delivery\ndelays before\nthey happen', { px: 104 }), body: T(120, 700, 880, 100, 'Problem to production in one briefing: data, model, training, results, risks and next steps.') },
  },
  { // 2 agenda: nodes become bullets
    nodes: { ...nd([[0, 1740, 560, 100, { glow: 0.2 }], ...BUL.map((id, i) => [id, 1000, bulY(i), 34] as [number, number, number, number])]) }, edges: chain(BUL, 0.5), path: [[7, 1, 6]], burst: [700, 0.3], avoid: [{ x: 100, y: 130, w: 800, h: 750 }, { x: 1040, y: 230, w: 660, h: 640 }],
    texts: {
      ...HEAD, k: T(120, 172, 700, 34, 'CONTENTS'), title: T(120, 218, 860, 170, 'Six steps from\nquestion to launch', { px: 72 }), body: T(120, 430, 720, 110, 'Every slide regroups the same network of ideas.'),
      ...Object.fromEntries(['01  The problem', '02  The data', '03  The model', '04  Training and results', '05  Deployment', '06  Risks and next steps'].map((t, i) => [`L${i + 1}`, T(1062, bulY(i) - 20, 620, 40, t)])),
    },
  },
  { // 3 problem: a hub and its factors
    nodes: nd([[0, RC.x, RC.y, 150, { glow: 0.2 }], ...SAT.map((id, k) => [id, satPt(k).x, satPt(k).y, 50, { fill: k % 2 ? C.violet : C.teal, ...(k % 2 ? { ring: 1.7 } : {}) }] as [number, number, number, number, Partial<NS>?])]),
    edges: SAT.map((id) => [0, id, 0.4] as Edge), path: [[2, 0, 6]], rings: [{ ...RC, r: 300, a: 0.5 }, { ...RC, r: 190, a: 0.3 }], burst: [1000, 0.3], avoid: [{ x: 100, y: 130, w: 680, h: 760 }, { x: 900, y: 120, w: 980, h: 880 }],
    texts: {
      ...HEAD, k: T(120, 262, 640, 34, '01  THE PROBLEM'), title: T(120, 308, 650, 170, 'One late parcel,\neight causes', { px: 72 }), body: T(120, 520, 600, 260, 'Delays rarely have a single reason. Today support finds out after the customer complains. We want a warning a day earlier.'),
      C1: T(RC.x - 150, satPt(0).y - 82, 300, 38, 'Weather'), L1: T(satPt(1).x + 50, satPt(1).y - 20, 300, 40, 'Traffic'), L2: T(satPt(2).x + 50, satPt(2).y - 20, 240, 40, 'Carrier load'), L3: T(satPt(3).x + 50, satPt(3).y - 20, 300, 40, 'Route length'),
      C2: T(RC.x - 150, satPt(4).y + 46, 300, 38, 'Holidays'), R1: T(satPt(5).x - 330, satPt(5).y - 20, 280, 40, 'Stock-outs'), R2: T(satPt(6).x - 330, satPt(6).y - 20, 280, 40, 'Address data'), R3: T(satPt(7).x - 330, satPt(7).y - 20, 280, 40, 'Peak hours'),
      C3: T(RC.x - 150, RC.y + 92, 300, 38, 'Delay risk'),
    },
  },
  { // 4 data: three clusters
    nodes: nd(clusterNodes), edges: [...HUBS.flatMap((h) => h.m.map((m) => [h.id, m, 0.45] as Edge)), [0, 1, 0.5], [1, 6, 0.5]], path: [[0, 1, 6]],
    rings: HUBS.map((h) => ({ x: h.x, y: 760, r: 205, a: 0.55 })), burst: [800, 0.28],
    texts: {
      ...HEAD, k: T(120, 130, 700, 34, '02  THE DATA'), title: T(120, 176, 1500, 90, 'Three sources, one table', { px: 72 }), body: T(120, 282, 1200, 110, 'We join order history, carrier scans and local conditions into one row per delivery.'),
      ...Object.fromEntries(HUBS.flatMap((h, i) => [[`C${i + 1}`, T(h.x - 220, 452, 440, 40, ['Order history', 'Carrier scans', 'Weather and traffic'][i]!)], [`NC${i + 1}`, T(h.x - 220, 494, 440, 34, ['2.4 M rows (sample)', '18 events each (sample)', 'hourly by region (sample)'][i]!)]])),
    },
  },
  { // 5 model: layers
    nodes: nd([...layerNodes, [5, 160, 1000, 12], [6, 1780, 220, 12], [7, 1640, 1000, 12]]), edges: layerEdges, path: [[11, 16, 0]], burst: [600, 0.3],
    avoid: [{ x: 100, y: 130, w: 1400, h: 200 }, { x: 80, y: 360, w: 1780, h: 580 }],
    texts: {
      ...HEAD, k: T(120, 130, 700, 34, '03  THE MODEL'), title: T(120, 176, 1500, 90, 'A small network, three layers', { px: 72 }), body: T(120, 262, 1400, 50, 'Each node mixes what it receives; the links carry the weights.'),
      NC1: T(LX[0]! - 210, 336, 420, 34, 'Input layer  ·  5 signals'), NC2: T(LX[1]! - 210, 336, 420, 34, 'Hidden layer  ·  6 nodes'), NC3: T(LX[2]! - 210, 336, 420, 34, 'Output layer  ·  4 outcomes'),
      ...Object.fromEntries(['Distance', 'Weather', 'Carrier', 'Weight', 'Day of week'].map((t, i) => [`R${i + 1}`, T(LX[0]! - 280, 410 + 125 * i - 20, 240, 40, t)])),
      ...Object.fromEntries(['On time', '1 day late', '2+ days late', 'Lost'].map((t, i) => [`L${i + 1}`, T(LX[2]! + 70, 410 + (500 / 3) * i - 20, 260, 40, t)])),
    },
  },
  { // 6 training: loss chart from nodes and links
    nodes: nd(lossNodes), edges: [...chain(TR), ...chain(VA)], path: [[16, 17, 1, 0]], burst: [420, 0.3], card: { ...rect(1740 - 28, cy(0.3) - 28, 56, 56), radius: 28, a: 0 },
    extra: { axY: rect(898, 280, 3, 600), axX: rect(898, 878, 884, 3), gr1: rect(900, cy(0.5), 880, 2, { a: 0.5 }), gr2: rect(900, cy(1), 880, 2, { a: 0.5 }) },
    texts: {
      ...HEAD, k: T(120, 172, 660, 34, '04  TRAINING'), title: T(120, 218, 680, 150, 'The model learns,\nthen levels off', { px: 68 }), body: T(120, 410, 660, 260, 'Loss measures how wrong the model is. Training loss keeps falling; validation loss stops improving after epoch 8, so we stop there.'),
      L1: T(960, 205, 330, 38, 'Training loss', { color: C.teal }), L2: T(1330, 205, 380, 38, 'Validation loss', { color: C.violet }),
      NC1: T(cx(0) - 100, 896, 200, 32, 'epoch 1'), NC2: T(cx(4) - 100, 896, 200, 32, 'epoch 5'), NC3: T(cx(8) - 100, 896, 200, 32, 'epoch 9'),
      R4: T(1290, 590, 490, 38, 'Early stop  ·  loss 0.30', { color: C.amber }),
    },
  },
  { // 7 result: a node grows into a card
    nodes: nd(zoomNodes), edges: Array.from({ length: 17 }, (_, k) => [0, k + 1, 0.28] as Edge), burst: [1250, 0.32], card: { ...rect(80, 110, 1760, 890), radius: 36, a: 1 }, extra: {},
    texts: {
      ...HEAD, k: T(200, 200, 760, 34, '05  RESULT  ·  SAMPLE FIGURES'), stat: T(190, 262, 820, 310, '0.91', { px: 300, color: C.ink }),
      title: T(200, 600, 800, 110, 'ROC AUC on deliveries\nthe model never saw', { px: 44 }), body: T(200, 760, 760, 190, 'Sample result: it ranks a late parcel above an on-time one 91 times out of 100.', { px: 30 }),
    },
  },
  { // 8 evaluation: two small graphs
    nodes: nd([...treeNodes, ...netNodes]), edges: [...treeEdges, ...netEdges], path: [[2, 5, 0]], burst: [420, 0.3], card: { ...rect(1700 - 31, 500 - 31, 62, 62), radius: 31, a: 0 },
    extra: { P1: rect(120, 290, 820, 680, { a: 0.85 }), P2: rect(980, 290, 820, 680, { a: 0.85 }) },
    texts: {
      ...HEAD, k: T(120, 130, 700, 34, '06  EVALUATION'), title: T(120, 170, 1500, 90, 'Does the network beat the rules?', { px: 64 }),
      L1: T(160, 316, 700, 38, 'Baseline  ·  hand-written rules', { color: C.ice }), L2: T(1020, 316, 700, 38, 'Neural network  ·  3 layers', { color: C.teal }),
      stat1: T(160, 790, 280, 110, '71%', { color: C.ice }), stat2: T(1020, 790, 280, 110, '88%', { color: C.amber }),
      NL1: T(450, 805, 450, 80, 'on-time calls correct\n(sample figures)'), NL2: T(1310, 805, 450, 80, 'on-time calls correct\n(sample figures)'),
    },
  },
  { // 9 deployment: pipeline in a row
    nodes: nd(pipeNodes), edges: chain(STG, 0.55), path: [STG], burst: [700, 0.3],
    extra: { hl1: rect(sx(0) - 70, 462, 436, 3), hl2: rect(sx(2) - 70, 462, 436, 3), hl3: rect(sx(4) - 70, 462, 436, 3) },
    texts: {
      ...HEAD, k: T(120, 130, 700, 34, '07  DEPLOYMENT'), title: T(120, 176, 1500, 90, 'From data to model to product', { px: 72 }), body: T(120, 272, 1300, 100, 'A scheduled pipeline scores every open delivery each hour and sends the warnings to the support tool.'),
      C1: T(sx(0) + 73 - 150, 410, 300, 38, 'DATA', { color: C.teal }), C2: T(sx(2) + 73 - 150, 410, 300, 38, 'MODEL', { color: C.teal }), C3: T(sx(4) + 73 - 150, 410, 300, 38, 'PRODUCT', { color: C.teal }),
      ...Object.fromEntries(['Ingest', 'Features', 'Model', 'Validate', 'Serve', 'Monitor'].flatMap((t, i) => [[`C${i + 4}`, T(sx(i) - 140, i === 2 ? 690 : 666, 280, 40, t)], [`NC${i + 1}`, T(sx(i) - 140, i === 2 ? 735 : 711, 280, 70, ['Orders and scans, hourly', 'Distance, load, weather', 'Scores each open parcel', 'Checks drift and quality', 'REST API, 80 ms (sample)', 'Alerts when accuracy dips'][i]!)]])),
    },
  },
  { // 10 risks: a tree
    nodes: nd(treeRiskNodes), edges: riskEdges, path: [[0, 2, 6]], burst: [500, 0.3], avoid: [{ x: 100, y: 130, w: 1500, h: 150 }, { x: 1040, y: 330, w: 800, h: 640 }],
    texts: {
      ...HEAD, k: T(120, 130, 700, 34, '08  RISKS'), title: T(120, 176, 1600, 90, 'Three risks, and how we hold them', { px: 68 }), C1: T(90, 712, 300, 38, 'Project risks'),
      ...Object.fromEntries(RISK.flatMap((r, i) => [[`L${i + 1}`, T(1020, r.y - 66, 760, 40, ['Data drift', 'Uneven accuracy', 'Over-trust'][i]!, { color: i === 0 ? C.amber : C.ink })], [`NL${i + 1}`, T(1020, r.y - 22, 780, 72, ['Habits and routes change. Fix: watch inputs weekly, retrain each quarter.', 'Rural routes have less data. Fix: report accuracy by region, add targeted data.', 'Staff may follow scores blindly. Fix: show the reasons, keep a human decision.'][i]!)]])),
    },
  },
  { // 11 timeline: nodes become milestones
    nodes: nd(stairNodes), edges: chain(MS, 0.6), path: [[3, 4, 2]], burst: [600, 0.3],
    texts: {
      ...HEAD, k: T(120, 130, 700, 34, '09  NEXT STEPS'), title: T(120, 176, 1300, 90, 'Five milestones to scale-up', { px: 68 }),
      ...Object.fromEntries(['Dec  ·  Pilot', 'Feb  ·  Alerts live', 'Apr  ·  Retrain loop', 'Jun  ·  All regions', 'Sep  ·  Scale-up'].flatMap((t, i) => [[`L${i + 1}`, T(msX(i) - 30, msY(i) + 52, 320, 40, t, { color: i < 3 ? C.amber : C.ink })], [`NL${i + 1}`, T(msX(i) - 30, msY(i) + 96, 320, 70, ['Shadow mode in two regions', 'Warnings reach support', 'Monthly retraining, drift alerts', 'Roll out nationwide', 'Add returns and cost models'][i]!)]])),
    },
  },
  { // 12 closing: the cover again
    nodes: nd(closeNodes), edges: coverEdges.map((e) => [e[0], e[1], 0.3] as Edge), path: [[9, 8, 7, 1, 0]], clip: COVER_ZONE, burst: [900, 0.35], avoid: [COVER_ZONE],
    texts: { ...HEAD, k: T(120, 262, 900, 34, 'THANK YOU  ·  SAMPLE BRIEFING'), title: T(120, 322, 1220, 240, 'Questions,\nthen a pilot', { px: 104 }), body: T(120, 640, 880, 150, 'Decision needed: approve the two-region pilot.\nmlteam@yourcompany.com') },
  },
]

// ── compute: ambient nodes, links, rotations ─────────────────────────────────────────────────────────────────────
const rnd = (n: number) => { let t = (n + 0x6d2b79f5) | 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const inBox = (p: Pt, b: Box, pad: number) => p.x > b.x - pad && p.x < b.x + b.w + pad && p.y > b.y - pad && p.y < b.y + b.h + pad
const crosses = (a: Pt, b: Pt, z: Box) => Array.from({ length: 31 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / 30, y: a.y + ((b.y - a.y) * i) / 30 })).some((p) => inBox(p, z, 20))

const solved: NS[][] = SCENES.map((g) => {
  const out: NS[] = []
  const used = new Set<number>(Object.keys(g.nodes).map(Number))
  const inPath = new Set((g.path ?? []).flat())
  for (let i = 0; i < N; i++) if (used.has(i)) { const s = g.nodes[i]!; out[i] = { ...s, fill: s.fill ?? (inPath.has(i) && i > HERO_B ? C.amber : C.teal), ...(inPath.has(i) && i > HERO_B && !s.ring ? { ring: 1.8 } : {}) } }
  const placed: Pt[] = out.filter(Boolean).map((s) => ({ x: s.x, y: s.y }))
  for (let i = 0; i < N; i++) {
    if (used.has(i)) continue
    const bx = 90 + rnd(i * 2 + 1) * 1740, by = 120 + rnd(i * 2 + 2) * 860, d = 10 + (i % 3) * 4
    let pick: Pt = { x: bx, y: by }
    for (let k = 0; k < 120; k++) {
      const p = { x: Math.min(1840, Math.max(80, bx + k * 11 * Math.cos(k * 2.4))), y: Math.min(1000, Math.max(110, by + k * 11 * Math.sin(k * 2.4))) }
      if ((g.avoid ?? []).some((b) => inBox(p, b, 40)) || placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 70)) continue
      pick = p; break
    }
    placed.push(pick)
    out[i] = { x: pick.x, y: pick.y, d, fill: C.dim, a: 0.55 }
  }
  return out
})

const key = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`)
const linkKeys = new Set<string>(), pathKeys = new Set<string>()
SCENES.forEach((g, si) => {
  g.edges = g.edges.filter((e) => !g.clip || !crosses(solved[si]![e[0]]!, solved[si]![e[1]]!, g.clip))
  g.edges.forEach((e) => linkKeys.add(key(e[0], e[1])))
  g.path?.forEach((p) => p.slice(1).forEach((id, i) => pathKeys.add(key(p[i]!, id))))
})
const rotNear = (r: number, prev: number | undefined) => { if (prev === undefined) return ((((r + 90) % 180) + 180) % 180) - 90; let best = r; for (const k of [-540, -360, -180, 0, 180, 360, 540]) if (Math.abs(r + k - prev) < Math.abs(best - prev)) best = r + k; return best }

const objects: Record<string, ObjDef> = {}
const order: string[] = []
const add = (id: string, def: ObjDef) => { objects[id] = def; order.push(id) }
const face = (px: number, o: Partial<TextObj> = {}): TextObj => ({ kind: 'text', text: '', px, ...o })

add('field', { kind: 'image', art: 'neural-field.webp', alt: 'A faint field of data points and a hairline grid in deep navy' })
;['rg1', 'rg2', 'rg3'].forEach((id) => add(id, { kind: 'shape', shape: 'ellipse', stroke: C.line, strokeW: 2 }))
add('P1', { kind: 'shape', radius: 28, fill: C.panel, stroke: C.line, strokeW: 2 }); add('P2', { kind: 'shape', radius: 28, fill: C.panel, stroke: C.line, strokeW: 2 })
add('card', { kind: 'shape', radius: 36, fill: '#0D2040' });
add('burst', { kind: 'image', art: 'neural-burst.webp', alt: 'A soft neural burst of teal and violet light' })
;['axX', 'axY', 'gr1', 'gr2', 'hl1', 'hl2', 'hl3'].forEach((id) => add(id, { kind: 'shape', radius: 1, fill: C.line }))
const lk = [...linkKeys].sort(), pk = [...pathKeys].sort()
lk.forEach((k) => add(`lk_${k}`, { kind: 'shape', radius: 1, fill: C.link }))
pk.forEach((k) => add(`pk_${k}`, { kind: 'shape', radius: 2, fill: C.amber }))
for (let i = 0; i < N; i++) add(`g${i}`, { kind: 'shape', shape: 'ellipse', fill: C.teal })
for (let i = 0; i < N; i++) add(`o${i}`, { kind: 'shape', shape: 'ellipse', stroke: C.teal, strokeW: 3 })
for (let i = 0; i < N; i++) add(`n${i}`, { kind: 'shape', shape: 'ellipse', fill: C.teal })
add('orbA', { kind: 'image', art: 'neural-teal.webp', alt: 'A glowing teal node sphere' }); add('orbB', { kind: 'image', art: 'neural-violet.webp', alt: 'A glowing violet node sphere' })
add('brand', { kind: 'text', text: 'MERIDIAN  ·  ML BRIEFING', px: 22, weight: 700, color: C.ink, caps: true, spc: 5, face: 'heading' })
add('page', { kind: 'text', text: 'Sample briefing  ·  2026', px: 22, weight: 500, color: C.mute, align: 'r' })
add('k', face(24, { weight: 600, color: C.teal, caps: true, spc: 5 }))
add('title', face(72, { weight: 700, color: C.ink, face: 'heading', lh: 1.05, spc: -1.5 }))
add('body', face(32, { weight: 400, color: C.mute, lh: 1.45 }))
add('stat', face(300, { weight: 700, color: C.ink, face: 'heading', lh: 1, spc: -8 }))
add('stat1', face(96, { weight: 700, color: C.ink, face: 'heading', lh: 1, spc: -2 })); add('stat2', face(96, { weight: 700, color: C.ink, face: 'heading', lh: 1, spc: -2 }))
const AL = { L: 'l', C: 'ctr', R: 'r' } as const
for (const [p, n] of [['L', 10], ['C', 9], ['R', 5]] as const) for (let i = 1; i <= n; i++) add(`${p}${i}`, face(28, { weight: 600, color: C.ink, face: 'heading', align: AL[p], lh: 1.15 }))
for (const [p, n] of [['NL', 6], ['NC', 6]] as const) for (let i = 1; i <= n; i++) add(`${p}${i}`, face(24, { weight: 400, color: C.mute, align: p === 'NL' ? 'l' : 'ctr', lh: 1.4 }))
// text sits on top of everything
const textIds = order.filter((id) => objects[id]!.kind === 'text')
const visualIds = order.filter((id) => objects[id]!.kind !== 'text')
const fullOrder = [...visualIds, ...textIds]

const rotState: Record<string, number> = {}
const carry: Record<string, Place> = {}
const last = (id: string, p: Place, a: number) => { carry[id] = { ...p, a: 0 }; return { ...p, a } }

const scenes = SCENES.map((g, si) => {
  const ns = solved[si]!
  const place: Record<string, Place> = {}
  const f = 1.03 + 0.02 * (si % 3), dx = (((si * 37) % 5) - 2) * 18, dy = (((si * 23) % 5) - 2) * 10
  place['field'] = { x: -(f - 1) * 960 + dx, y: -(f - 1) * 540 + dy, w: W * f, h: H * f, a: 0.85 }
  const hero = ns[HERO_A]!
  place['burst'] = { x: hero.x - (g.burst?.[0] ?? hero.d * 7) / 2, y: hero.y - (g.burst?.[0] ?? hero.d * 7) / 2, w: g.burst?.[0] ?? hero.d * 7, h: g.burst?.[0] ?? hero.d * 7, a: g.burst?.[1] ?? 0.25 }
  ;['rg1', 'rg2', 'rg3'].forEach((id, i) => {
    const r = g.rings?.[i]
    if (r) { carry[id] = { x: r.x - r.r, y: r.y - r.r, w: 2 * r.r, h: 2 * r.r }; place[id] = { ...carry[id]!, a: r.a ?? 0.5 } } else place[id] = carry[id] ? { ...carry[id]!, a: 0 } : { x: 560, y: 140, w: 800, h: 800, a: 0 }
  })
  const tiny = { x: hero.x - hero.d * 0.4, y: hero.y - hero.d * 0.4, w: hero.d * 0.8, h: hero.d * 0.8, radius: hero.d * 0.4, a: 0 }
  place['card'] = g.card ?? tiny
  for (const [id, p] of Object.entries(g.extra ?? {})) place[id] = p
  const pt = (i: number): Pt => ({ x: ns[i]!.x, y: ns[i]!.y })
  const edgeMap = new Map(g.edges.map((e) => [key(e[0], e[1]), e]))
  const pathSet = new Set((g.path ?? []).flatMap((p) => p.slice(1).map((id, i) => key(p[i]!, id))))
  for (const k of lk) {
    const [a, b] = k.split('_').map(Number) as [number, number]
    const e = edgeMap.get(k)
    const p = link(pt(a), pt(b), (e?.[3] as number | undefined) ?? 2)
    const rot = rotNear(p.rot!, rotState[`lk_${k}`]); rotState[`lk_${k}`] = rot
    place[`lk_${k}`] = { ...p, rot, a: e ? (e[2] as number | undefined) ?? 0.4 : 0 }
  }
  for (const k of pk) {
    const [a, b] = k.split('_').map(Number) as [number, number]
    const p = link(pt(a), pt(b), 5)
    const rot = rotNear(p.rot!, rotState[`pk_${k}`]); rotState[`pk_${k}`] = rot
    place[`pk_${k}`] = { ...p, rot, a: pathSet.has(k) ? 0.95 : 0 }
  }
  for (let i = 0; i < N; i++) {
    const s = ns[i]!, a = s.a ?? 1
    const hero2 = i <= HERO_B
    const dd = hero2 ? s.d * 0.7 : s.d
    place[`n${i}`] = { x: s.x - dd / 2, y: s.y - dd / 2, w: dd, h: dd, a, fill: s.fill! }
    const gl = s.d * 3
    place[`g${i}`] = { x: s.x - gl / 2, y: s.y - gl / 2, w: gl, h: gl, a: (s.glow ?? 0) * 0.3, fill: s.fill! }
    const rr = s.d * (s.ring ?? 1.8)
    place[`o${i}`] = { x: s.x - rr / 2, y: s.y - rr / 2, w: rr, h: rr, a: s.ring ? 0.7 : 0 }
  }
  const oa = ns[HERO_A]!.d * 1.6, ob = ns[HERO_B]!.d * 1.6
  place['orbA'] = { x: hero.x - oa / 2, y: hero.y - oa / 2, w: oa, h: oa, a: hero.a ?? 1 }
  place['orbB'] = { x: ns[HERO_B]!.x - ob / 2, y: ns[HERO_B]!.y - ob / 2, w: ob, h: ob, a: ns[HERO_B]!.a ?? 1 }
  for (const [id, p] of Object.entries(g.texts)) place[id] = p
  void last
  const titles = ['Cover', 'Contents', 'Problem', 'Data', 'Model', 'Training', 'Result', 'Evaluation', 'Deployment', 'Risks', 'Next steps', 'Closing']
  const purposes = [
    'The opening: a scattered constellation of linked nodes around the title, with a glowing node at its heart.',
    'The nodes line up as the bullets of a six-step contents list and the first steps light up in amber.',
    'One node moves to the centre and eight factor nodes settle onto a ring around it, each with a name.',
    'The nodes split into three clusters, one for each data source, with a hub in each and an amber path across them.',
    'The same nodes re-form as a layered network of five inputs, six hidden nodes and four outcomes, with an amber path through it.',
    'The nodes become the points of two learning curves and the links their lines, ending in the node where training stops.',
    'The last node of the chart grows into a full-slide card with one large metric, the other nodes fanning out around it.',
    'The card shrinks away and the nodes split into two small graphs, a sparse rule tree beside the dense network, each with its score.',
    'The nodes line up in a row as six pipeline stages grouped into data, model and product, with data packets between them.',
    'The row regroups as a risk tree: the project at the root, three risks as branches, and their fixes beside them.',
    'The tree lifts into a rising staircase of five milestones, the amber path marking the ones already planned.',
    'The nodes return to a constellation that mirrors the cover, with the closing question and the decision needed.',
  ]
  return { id: `s${si + 1}`, title: titles[si]!, purpose: purposes[si]!, bg: g.bg ?? C.bg, place }
})

export const TECH_NEURAL = authored(
  {
    id: 'tech-neural', category: 'technology', name: 'Neural Network', tagline: 'One connected graph that regroups to tell the story',
    description: 'A dark, precise deck for machine-learning and AI projects: one network of linked nodes regroups from a constellation into a hub, clusters, layers, a learning curve, a metric card, a comparison, a pipeline, a risk tree and a timeline.',
    audience: 'The Neural Network template suits AI and machine-learning project briefings, data science and research updates, architecture and engineering reviews, LLM and deep-learning talks, technology roadmaps and any presentation where connections between parts are the story.',
    topics: ['AI', 'artificial intelligence', 'machine learning', 'neural network', 'deep learning', 'data science', 'LLM', 'technology presentation', 'research', 'architecture', 'software engineering', 'ML project', 'model training', 'data pipeline', 'MLOps', 'technology', 'analytics', 'engineering'],
    fonts: { heading: 'Space Grotesk', body: 'IBM Plex Sans' },
    colors: { background: C.bg, surface: C.panel, textPrimary: C.ink, textSecondary: C.mute, primary: C.teal, secondary: C.violet, accent: C.amber, onPrimary: C.bg },
    background: C.bg,
  },
  { objects, order: fullOrder, scenes },
)
void H
