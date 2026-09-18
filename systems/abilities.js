/*
 * Ability subsystem
 *
 * Beta の移動能力は「地上Dash」と、STAGE 5で得るAir Dashだけを核にします。
 * 新しい能力を入れる場合は、このファイルで (1) 新操作を増やさない、
 * (2) セーブ未保存でも既存挙動へ戻る、(3) ステージ側の要求を先に定義する、
 * の3案を比較し、最初の案を優先してから game.js へ接続します。
 */
window.BETA_ABILITIES = Object.freeze({
  create() {
    return FEATURES.abilitySystem ? { airDash:false } : {};
  },
  createLevels() {
    return { airDash:1 };
  },
  unlockForStage(abilities, stage) {
    abilities.airDash=stage>=5;
  },
});
