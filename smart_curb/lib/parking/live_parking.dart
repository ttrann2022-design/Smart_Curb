// Live lot data from Firebase and choosing where to park.
part of '../main.dart';

// ==========================================
// LIVE PARKING DATA (shared by the map and the assistant)
// ==========================================

/// "lot06" -> "Lot 6", "garage2" -> "Garage 2" (used when a lot has no name).
String prettyLotName(String id) {
  final m = RegExp(r'^([a-z]+)0*(\d+)$', caseSensitive: false).firstMatch(id);
  if (m == null) return id.toUpperCase();
  final word = m.group(1)!;
  return '${word[0].toUpperCase()}${word.substring(1).toLowerCase()} ${m.group(2)}';
}

/// "Lot 12 — Red Permit" -> "Lot 12": the short name fits the map label
/// (the dashboard's lot sign splits names the same way).
String shortLotName(String name) => name.split(' — ').first.trim();

LatLng? _readLatLng(Map<String, dynamic> data) {
  final lat = data['lat'] ?? data['latitude'];
  final lng = data['lng'] ?? data['longitude'];
  if (lat is num && lng is num) return LatLng(lat.toDouble(), lng.toDouble());
  return null;
}

/// [place]'s lots from raw `lots/` and `units/` snapshots. Groups the curb
/// units by their `lot` id: a lot's capacity is how many of its curbs are
/// online, and its occupied count is how many of those are taken. Offline
/// curbs count toward neither until they report again. `lots/` only
/// supplies display names. Lots with no curbs at all are sensorless (see
/// [sensorlessLot]).
Map<String, Map<String, dynamic>> parseLiveLots(
  Place place,
  Object? rawLotsValue,
  Object? rawUnitsValue,
) {
  final rawLots = rawLotsValue is Map ? rawLotsValue : const {};
  final rawUnits = rawUnitsValue is Map ? rawUnitsValue : const {};

  final capacity = <String, int>{};
  final occupied = <String, int>{};
  final spots = <String, List<Map<String, dynamic>>>{};
  rawUnits.forEach((unitId, unit) {
    if (unit is! Map) return;
    final lot = unit['lot']?.toString();
    if (lot == null || lot.isEmpty) return;
    final occ = unit['occupied'];
    final isOcc = occ == true || occ == 1 || occ == 'true';
    // Units without an `online` flag are treated as reporting.
    final on = unit['online'];
    final isOnline = !(on == false || on == 0 || on == 'false');
    // An offline curb's state is unknown, so it is left out of the lot's
    // total and its free count alike (labels, colours and best-lot
    // routing all use this tally). It still shows, gray, in the spot list.
    if (isOnline) {
      capacity[lot] = (capacity[lot] ?? 0) + 1;
      if (isOcc) occupied[lot] = (occupied[lot] ?? 0) + 1;
    }
    (spots[lot] ??= []).add({
      'id': unitId.toString(),
      'occupied': isOcc,
      'online': isOnline,
    });
  });
  for (final list in spots.values) {
    list.sort((a, b) => (a['id'] as String).compareTo(b['id'] as String));
  }

  final result = <String, Map<String, dynamic>>{};
  // Every lot the place knows, every lot in `lots/`, and any lot a unit
  // points at that is in neither.
  final lotIds = {
    ...place.lotPositions.keys,
    for (final k in rawLots.keys) k.toString(),
    ...spots.keys,
  };
  for (final lotId in lotIds) {
    final val = rawLots[lotId];
    final lotData =
        val is Map ? Map<String, dynamic>.from(val) : <String, dynamic>{};
    final pos = place.lotPositions[lotId] ?? _readLatLng(lotData);
    if (pos == null) continue;
    final name = shortLotName(lotData['name']?.toString() ??
        place.lotNames[lotId] ??
        prettyLotName(lotId));

    // No curbs installed at all (online or not): a plain map point, like
    // a place without live parking (see [staticLots]).
    if (!spots.containsKey(lotId)) {
      result[lotId] = sensorlessLot(name, pos);
      continue;
    }

    final total = capacity[lotId] ?? 0;
    final occ = occupied[lotId] ?? 0;
    final ratio = total > 0 ? occ / total : 0.0;
    // Same thresholds as the dashboard's lot bars (Overview.jsx).
    final Color color;
    if (total == 0) {
      color = kTextMuted;
    } else if (ratio >= 0.90) {
      color = kRed;
    } else if (ratio >= 0.70) {
      color = kAmber;
    } else {
      color = kOpen;
    }

    result[lotId] = {
      'name': name,
      'status': '$occ/$total',
      'occupied': occ,
      'capacity': total,
      'sensors': true,
      'position': pos,
      'color': color,
      // Every curb unit in the lot, for the tap-a-lot spot grid.
      'units': spots[lotId] ?? const <Map<String, dynamic>>[],
    };
  }
  return result;
}

/// A place without curbs (see [Place.liveParking]): all its lots are
/// sensorless.
Map<String, Map<String, dynamic>> staticLots(Place place) => {
      for (final e in place.lotPositions.entries)
        e.key: sensorlessLot(
          place.lotNames[e.key] ?? prettyLotName(e.key),
          e.value,
        ),
    };

/// A lot with no curbs: a plain map point, gray like a lot with nothing
/// reporting, with nothing to count. It can always be recommended (see
/// [CampusPathfinder.findBestAvailableRoute]).
Map<String, dynamic> sensorlessLot(String name, LatLng pos) => {
      'name': name,
      'status': '',
      'occupied': 0,
      'capacity': 0,
      'sensors': false,
      'position': pos,
      'color': kTextMuted,
      'units': const <Map<String, dynamic>>[],
    };

/// "3 free", or null for a lot without sensors (nothing to count).
String? lotFreeText(Map<String, dynamic> lot) => lot['sensors'] == false
    ? null
    : '${(lot['capacity'] as int) - (lot['occupied'] as int)} free';

/// Where to park at [place] for [building], given its [lots]: the
/// recommended lot (the closest one with space, by walking distance) and,
/// in it, the open curb with the shortest walk to the building. When none
/// of the lot's open curbs has a known position, the lot itself.
PathResult? bestParkingFor(
  Place place,
  PlaceBuilding building,
  Map<String, Map<String, dynamic>> lots,
) {
  final lot = place.pathfinder.findBestAvailableRoute(
    buildingPos: building.position,
    lots: lots,
  );
  if (lot == null) return null;

  final open = {
    for (final u in lots[lot.lotId]!['units'] as List<Map<String, dynamic>>)
      if (u['online'] == true && u['occupied'] != true) u['id'] as String,
  };
  PathResult? best;
  for (final s in place.spotShapes) {
    if (!open.contains(s.unitId)) continue;
    final r = place.pathfinder.walkingRoute(
      lot.lotId,
      s.center,
      building.position,
      unitId: s.unitId,
    );
    if (best == null || r.totalDistanceMeters < best.totalDistanceMeters) {
      best = r;
    }
  }
  return best ?? lot;
}
