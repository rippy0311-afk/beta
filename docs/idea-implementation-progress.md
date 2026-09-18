# Idea Implementation Progress

The source list contains 2,000 broad concepts. This file records only ideas that are implemented or deliberately deferred, so scheduled work can avoid duplicates.

| Batch | Source ideas | Implementation | Feature flags | Status |
|---|---:|---|---|---|
| 001 | 17, 28, 35, 38, 39 | Orbs and purified enemies restore a scene tint; carried orbs add glowing embroidery; nearby enemies scatter warning paper; abandoned construction sketches cross the sky. | `orbRestorationTint`, `enemyColorRecovery`, `orbEmbroidery`, `paperDangerSense`, `ghostConstructionMeteors` | Implemented |
| 002 | 8, 14, 19 | Repeated falls are remembered at checkpoints; standing peacefully near an enemy briefly calms it; purifying an enemy restores colour just like defeating it. | `checkpointFailureChronicle`, `patientEnemyPause`, `purificationColorRecovery` | Implemented |
| 003 | 5, 12, 29 | Construction signs change from TODO to DONE after a repair; future windows brighten as restoration proceeds; restored residents cast a lantern trail toward the next orb or gate. | `repairSignCompletion`, `futureWindowRestoration`, `residentLanternTrail` | Implemented |
| 004 | 6 | Collecting three orbs without landing calls down a short-lived star-constellation platform beneath Ren. | `constellationBridge` | Implemented |
| 005 | 40, 42 | Previously restored islands glow in the far distance; unrepaired foundations read as an unknown blueprint from afar and resolve into a usable repair site as Ren approaches. | `distantRestorationIslands`, `repairDiscoverySilhouette` | Implemented |
| 006 | New: repair calm, purification guide, repair outcome preview | Repairing briefly pacifies nearby enemies; a defeated or purified enemy leaves a luminous trail to the next repair, orb, or gate; standing near a foundation previews the route it will build. | `repairCalmsEnemies`, `purificationGuideTrail`, `repairOutcomePreview` | Implemented |
| 007 | New: orb resonance sprint, enemy memory step | Rapidly collecting two or more orbs gives Ren a short speed resonance; defeated or purified enemies leave a brief, standable echo-step where they were. | `orbResonanceSprint`, `enemyMemoryStep` | Implemented |
| 008 | 2 | Pressing C spends one held orb and converts its short arc into a temporary construction platform in front of Ren. | `orbBuildPlatform` | Implemented |
| 009 | New: orb safety net | On a deep fall, one held orb is consumed to create a single emergency platform before Ren respawns. | `orbSafetyNet` | Implemented |
| 010 | New: memory sense, repair fireflies, patrol ghost, checkpoint ribbon, cloud bloom | Carried orbs sense nearby memory fragments; repaired foundations gain fireflies; standing still reveals enemy patrol lines; HUD can point to the next checkpoint; restored colour brings small clouds into bloom. | `orbMemorySense`, `repairAmbientFireflies`, `enemyRouteGhosts`, `checkpointMapRibbon`, `completionCloudBloom` | Implemented |
| 011 | New: dash scare, orb startle | Ground dash and a fresh orb pickup briefly send nearby enemies away, offering nonlethal route control. | `dashScaresEnemies`, `orbStartlesEnemies` | Implemented |
| 012 | New: ground-pound bounce | An F-key ground pound rebounds from a platform, turning a downward commitment into a high recovery jump. | `groundPoundBounce` | Implemented |
| 013 | New: air-strike dash refill, purification jump refill | An aerial strike restores Air Dash; a mid-air purification restores the double jump when unlocked. | `airStrikeDashRefill`, `purificationJumpRefill` | Implemented |

Progress: 31 / 1,000 target ideas implemented or concretely tracked.
