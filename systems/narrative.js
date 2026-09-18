/* Per-stage story text. Experimental collectibles are disabled, but each island keeps its repair identity. */
const NARRATIVE_STAGE_CONTENT = Object.freeze({
  1:{window:[1110,280],fragment:[1520,340],sign:'TODO: はじまりの足場を固定する',resident:'橋ができた！　これで、次の島に道が続くよ。',memory:'最初の一歩は、未完成でも足場になる。'},
  2:{window:[1360,250],fragment:[1860,310],sign:'雲裂き工区／風圧の値：未入力',resident:'風は怖くないよ。進む方向を教えてくれるから。',memory:'雲は壊れない。形を変えるだけだ。'},
  3:{window:[1640,210],fragment:[2120,300],sign:'宙吊り回廊／安全確認：途中',resident:'上を見て。壊れた空にも、ちゃんと道がある。',memory:'重力は、世界を下へ引く約束だった。'},
  4:{window:[1750,265],fragment:[2300,330],sign:'採掘路／採掘物：記憶の結晶',resident:'掘り出したのは石じゃない。忘れられた景色だよ。',memory:'失くした物にも、帰る場所を作ろう。'},
  5:{window:[1640,160],fragment:[2260,220],sign:'縦坑／空中移動：試験運用中',resident:'空で一度だけ、強く踏み出して。風が受け止める。',memory:'飛べない日にも、空は待ってくれる。'},
  6:{window:[1800,210],fragment:[2510,260],sign:'結晶庭／月光の屈折を調整中',resident:'結晶は、見てくれた光をずっと覚えている。',memory:'欠けた光も、花を咲かせられる。'},
  7:{window:[2080,230],fragment:[2800,290],sign:'連橋／夜間工事：継続中',resident:'暗い橋ほど、手すりの光がきれいに見える。',memory:'渡る人がいる限り、橋は完成し続ける。'},
  8:{window:[2130,180],fragment:[2980,250],sign:'尖塔／外壁の時間風化を観測',resident:'古い傷は、ここまで来た証でもあるんだ。',memory:'遠くを見るために、高くなる必要はない。'},
  9:{window:[2240,220],fragment:[3100,270],sign:'氷雲足場／低温注意',resident:'凍った雲でも、温かい思い出が眠ってる。',memory:'春は、氷の内側から始まる。'},
  10:{window:[2280,180],fragment:[3260,250],sign:'熔岩雲／熱量制御：警告',resident:'熱い場所ほど、直す手はゆっくりでいい。',memory:'火は壊すためだけに燃えていない。'},
  11:{window:[2440,200],fragment:[3390,260],sign:'落下遺跡／復元順序を探索中',resident:'落ちた物を全部拾わなくても、前へ進める。',memory:'崩れた順番には、守りたかった理由がある。'},
  12:{window:[2520,165],fragment:[3520,240],sign:'外縁／星喰いの影を記録',resident:'外の暗さを知っているから、島の光は強いんだ。',memory:'終わりに見える場所も、地図の余白だった。'},
  13:{window:[2600,180],fragment:[3700,240],sign:'最終工区／完成度：あと少し',resident:'ここまで直した世界は、もう君のことを覚えている。',memory:'完璧じゃなくても、ここは世界になった。'},
});
