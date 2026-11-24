// Pure recommendation logic for the repo's real `lots/` and `units/` schema.
// This is a heuristic, NOT Brad's A* routing algorithm.
export function unitState(unit) {
  if (!unit || unit.online !== true) return 'offline';
  if (unit.occupied === true) return 'occupied';
  if (unit.occupied === false) return 'available';
  return 'unknown';
}
export function lotSummary(lotId, units) {
  const stalls = Object.entries(units || {})
    .filter(([, unit]) => unit && String(unit.lot || '') === String(lotId))
    .sort(([a], [b]) => a.localeCompare(b, undefined, {numeric:true}))
    .map(([id, unit]) => ({id, state:unitState(unit)}));
  const counts={available:0,occupied:0,offline:0,unknown:0};
  for(const stall of stalls) counts[stall.state]++;
  const capacity=counts.available+counts.occupied;
  const occupancy=capacity>0?counts.occupied/capacity:1;
  return {stalls,counts,capacity,occupancy};
}
export function rankLots(lots, units, siteId='') {
  return Object.entries(lots || {})
    .filter(([,lot]) => !!lot && (!siteId || lot.siteId===siteId))
    .map(([id,lot]) => {
      const summary=lotSummary(id,units);
      // No unverified travel time. Prefer more confirmed vacancies, then less occupancy.
      const score=summary.counts.available>0 ? 10/(summary.counts.available+1)+summary.occupancy*2 : Infinity;
      return {id,name:String(lot.name||id),siteId:lot.siteId||'',...summary,score};
    })
    .sort((a,b)=>a.score-b.score || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
