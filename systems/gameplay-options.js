/*
 * Core gameplay options
 *
 * Beta is a horizontal pixel-action RPG about crossing floating islands,
 * collecting missing orbs, and repairing foundations. This list deliberately
 * contains only systems that support that loop. Experimental key powers were
 * retired rather than left as competing player-facing mechanics.
 */
const FEATURES = Object.freeze({
  titleScreen: true, hud: true, dialogue: true, collectibles: true,
  worldRestoration: true, checkpoint: true, mobileControls: true,
  particles: true, saveData: true, autoSave: true, persistentSettings: true,
  developerTools: true,

  // Core movement and combat readability.
  abilitySystem: true, orbMagnet: true, playerShadow: true, attackArc: true,
  dashAfterimages: true, airDashRing: true, checkpointAura: true,
  checkpointBeam: true, repairPulse: true, gateSparkles: true,
  dangerVignette: true, coyoteJump: true, jumpBuffer: true,
  variableJump: true, attackLunge: true, hitStop: true, orbTrail: true,
  repairDust: true, goalBeacon: true, cameraLookAhead: true,
  enemyPurification: true, windPlatforms: true, fallAssist: true,

  // Restoration must be seen in the island and gate, not as another power.
  orbGateFlight: true, repairAssembly: true, stageFlowHints: true,
  orbRestorationTint: true, repairSignCompletion: true,
  distantRestorationIslands: true, repairAmbientFireflies: true,

  // Stage Builder-defined route modifiers, used only where the layout asks.
  stageWindLanes: true, stageWindLaneMarkers: true,

  // Replay goals remain optional presentation, never a movement system.
  resultMedals: true, courseMedalArchive: true, courseMedalBriefing: true,
});
