/*
 * Beta feature flags
 * 新しい機能は FEATURES に追加し、ゲーム側では必ずこの値を確認します。
 * false にすれば UI とロジックをまとめて停止できます。
 */
const FEATURES = Object.freeze({
  titleScreen: true,
  hud: true,
  dialogue: true,
  collectibles: true,
  worldRestoration: true,
  checkpoint: true,
  mobileControls: true,
  particles: true,
  sound: false,
  inventory: false,
  quests: false,
  saveData: true,
  autoSave: true,
  persistentSettings: true,
  debug: false,
  developerTools: true,
  abilitySystem: true,
  orbMagnet: true,
  comboMeter: true,
  speedStreaks: true,
  landingDust: true,
  orbPulse: true,
  orbCompass: true,
  checkpointAura: true,
  enemyEyes: true,
  stageBanner: true,
  courseTips: true,
});

const GAME_CONFIG = Object.freeze({
  width: 1280,
  height: 720,
  gravity: 1700,
  playerSpeed: 340,
  jumpVelocity: 660,
  totalShards: 20,
  initialDialogue: 'ピース「これ……たぶん、まだ途中だよ。修復ポイントのそばで E を押してみよう。」',
  endDialogue: '第1章クリア！ はじまり島に、新しい光がともった。',
});
