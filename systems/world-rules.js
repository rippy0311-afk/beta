/* World physics and Stage Builder numeric defaults. */
const GAME_CONFIG = Object.freeze({
  width:1280, height:720, gravity:1700, playerSpeed:340, jumpVelocity:660,
  totalShards:20,
  initialDialogue:'ピース「これ……たぶん、まだ途中だよ。修復ポイントのそばで E を押してみよう。」',
  endDialogue:'第1章クリア！ はじまり島に、新しい光がともった。',
});
const MECHANIC_NUMBERS = Object.freeze({
  windSpeed:1.35, windBridgeAmplitude:22, windPlatformAmplitude:8,
  fallAssistWidth:150, fallAssistLife:4, gravityMultiplier:1,
  orbGateFlightDuration:.56, repairAssemblyDuration:.72, airDashDuration:.18,
  stageWindLaneMultiplier:1, stageWindLaneLiftMultiplier:1, stageWindLaneMaxRiseVelocity:390,
  resultSpeedBaseSeconds:58, resultSpeedPerDifficultySeconds:8,
});
const STAGE_NUMERIC_OVERRIDES = Object.freeze({
  1:{windPlatformAmplitude:3}, 2:{windPlatformAmplitude:7}, 3:{windPlatformAmplitude:12},
  4:{windPlatformAmplitude:5}, 5:{windPlatformAmplitude:16}, 6:{windPlatformAmplitude:7},
  7:{windPlatformAmplitude:10}, 8:{windPlatformAmplitude:7}, 9:{windPlatformAmplitude:4},
  10:{windBridgeAmplitude:30}, 11:{windPlatformAmplitude:8}, 12:{windPlatformAmplitude:13}, 13:{windPlatformAmplitude:0},
});
