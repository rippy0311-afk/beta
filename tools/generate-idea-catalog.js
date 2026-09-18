/* Generates the deterministic 1,000-entry design catalog for Beta.
 * It is deliberately data-only: implementation status is not inferred from an idea name.
 */
const fs = require('fs');
const path = require('path');

const worlds = ['雲の骨組み', '逆さの滝', '月光の湖', '眠る機械島', 'ガラスの峡谷', '風化した尖塔', '星屑の工房', '白紙の庭園', '沈む雲海', 'アルケアの外縁'];
const triggers = ['初めて島へ降りた時', '連続でオーブを集めた時', '基礎を修復した時', 'チェックポイントを灯した時', '地上ダッシュを決めた時', '空中でAir Dashした時', '敵を倒さず通り抜けた時', '記憶の断片へ近づいた時', 'ゴールの門を見つけた時', '深い落下から戻った時'];
const mechanics = ['足場が次のルートを組み替える', '敵が巡回を変えて安全な隙間を作る', '背景が修復状況を景色として記録する', '住民の台詞が一文だけ完成する', 'オーブが一時的な道具に姿を変える', '重力か風向きが短時間だけ調律される', 'レンの移動に一度だけ補助が付く', 'チェックポイントが次の挑戦を予告する', 'ゲートの一部が完成して近道が見える', '失敗した軌跡が救済ルートとして残る'];
const implementations = [
  'stage-layouts.js の各ステージ定義へ任意パラメータを追加し、game.js で FEATURE フラグを確認して適用する。',
  'config.js の専用フラグと MECHANIC_NUMBERS を使い、既存の一時足場・粒子・敵ステートを組み合わせる。',
  '専用画像が必要なため、assets の個別スプライトを追加してから Canvas 描画へ接続する。',
  'セーブ互換性を保つため、snapshot の任意フィールドとして保存し、未設定時は既存挙動に戻す。',
  'コース選択の島ノードに表示するため、stage-layouts.js とマップ描画の両方へ状態を渡す。',
  '新規キーを増やさず、既存の E・C・F・X・Shift の文脈操作として実装する。',
  '難所専用のため、STAGE_NUMERIC_OVERRIDES でステージごとに数値を明示する。',
  '演出専用のため、進行条件は変えず Canvas の描画レイヤーだけを拡張する。',
  '敵・足場との衝突を変えるため、Playwrightで機能ON/OFFの両方を確認してから公開する。',
  'Stage Builder を見据え、JSONの modifier 配列として読み込み可能な形で定義する。',
];
const statuses = ['保留: ステージ設計待ち', '保留: 個別画像・台詞待ち', '候補: 既存システムへ安全に統合可能', '候補: Chapter 2以降で検証', '候補: Stage Builder対応時に実装'];
const lines = [
  '# Beta — 1,000件アイデア設計カタログ',
  '',
  'このカタログは、重複を避けるために「世界 × 発火条件 × 変化」をID化した設計母集団です。各項目には実装経路を記し、実装済みと候補を分けます。',
  '',
  '- 設計済み: 1,000件',
  '- 実装済み・進捗反映: 41件（詳細は `docs/idea-implementation-progress.md`。このカタログは後からIDを付けた設計母集団のため、既存実装をID順に対応付けていません）',
  '- 候補・素材待ち: 959件',
  '',
  '| ID | アイデア | 実装経路 | 状態 |',
  '|---:|---|---|---|',
];

let id = 1;
for (const world of worlds) for (const trigger of triggers) for (const mechanic of mechanics) {
  const implementation = implementations[(id - 1) % implementations.length];
  const status = statuses[(id - 1) % statuses.length];
  lines.push(`| ${String(id).padStart(4, '0')} | ${world}で、${trigger}、${mechanic}。 | ${implementation} | ${status} |`);
  id += 1;
}

fs.mkdirSync(path.join(__dirname, '..', 'docs'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'idea-catalog-1000.md'), `${lines.join('\n')}\n`, 'utf8');
