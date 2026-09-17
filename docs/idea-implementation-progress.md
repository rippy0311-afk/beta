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

Progress: 17 / 1,000 target ideas implemented or concretely tracked.
