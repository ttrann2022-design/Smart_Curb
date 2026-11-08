// The Place model: a map users can add to Home.
part of '../main.dart';

// ==========================================
// PLACES (each one a map users can add)
// ==========================================

/// A place users can add to their home page and open as a map: its area,
/// destinations, parking lots and walking network. The map screen reads
/// everything place-specific from here, so a new place needs no other code.
class Place {
  /// Key under `drivers/<uid>/locations` when a user adds it.
  final String id;

  /// Logo text, full name and address on the home page.
  final String shortName;
  final String fullName;
  final String address;

  /// The place's logo (shown instead of [shortName] when it loads), and
  /// the colour around it when it isn't square: its own background colour,
  /// so it reads as one tile.
  final String? logoAsset;
  final Color logoBackground;

  /// Short name in sentences ("Travel to FAU").
  final String nickname;

  /// Map screen app bar title and subtitle, and the guidance card's title
  /// before a destination is picked.
  final String mapTitle;
  final String areaName;
  final String guidanceTitle;

  /// Guidance card text inside and outside the place's box.
  final String insideLabel;
  final String outsideLabel;

  /// The map opens here, and flies back here on reset.
  final LatLng center;

  /// Where a driving route starts without a GPS fix, and where dev mode's
  /// "Travel to" button puts you.
  final LatLng entrance;

  /// The map can't be panned outside this box, and inside it counts as
  /// being at the place.
  final LatLng sw;
  final LatLng ne;
  final double minZoom;

  /// Destinations: tap one on the map or search for it.
  final List<PlaceBuilding> buildings;

  /// This place's customer site in the dashboard (`sites/<siteId>`): its
  /// parking lots are the ones in `lots/` with this `siteId`.
  final String siteId;

  /// Where each parking lot is, and its name on the map, by lot id: read
  /// from `lots/` (see [applyLots]), empty until it first arrives. Lots
  /// are not graph nodes; like buildings, they are snapped onto the
  /// nearest walkway when routing.
  final Map<String, LatLng> lotPositions = {};
  final Map<String, String> lotNames = {};

  /// True when any curb in `units/` (online or not) names one of this
  /// place's lots: its lot counts come live from those curbs. False: no
  /// curbs here yet, so the lots are plain map points with nothing to
  /// count. Worked out from the database (see [applyUnitsToAll]), so moving
  /// a curb into a lot there is all it takes.
  bool get liveParking => lotPositions.keys.any(_lotsWithCurbs.contains);

  /// Rows of parking spaces with a curb unit in each (see [CurbSpotRow]).
  final List<CurbSpotRow> spotRows;

  final CampusPathfinder pathfinder;

  Place({
    required this.id,
    required this.shortName,
    required this.fullName,
    required this.address,
    this.logoAsset,
    this.logoBackground = kCardAlt,
    required this.nickname,
    required this.mapTitle,
    required this.areaName,
    required this.guidanceTitle,
    required this.insideLabel,
    required this.outsideLabel,
    required this.center,
    required this.entrance,
    required this.sw,
    required this.ne,
    required this.minZoom,
    required this.buildings,
    required this.siteId,
    this.spotRows = const [],
    required this.pathfinder,
  });

  bool contains(LatLng p) =>
      p.latitude >= sw.latitude &&
      p.latitude <= ne.latitude &&
      p.longitude >= sw.longitude &&
      p.longitude <= ne.longitude;

  /// Every curb space, each shown on the map as a 3D block.
  late final spotShapes = [for (final r in spotRows) ...r.spaces()];

  /// Each curb's drive-in path (see [CurbSpotRow.approach]), by unit id.
  late final Map<String, List<LatLng>> spotApproach = {
    for (final r in spotRows)
      for (var i = 0; i < r.unitIds.length; i++) r.unitIds[i]: r.approach(i),
  };

  /// Every place users can add, in the order the add dialog lists them.
  static final List<Place> all = [fauBoca, browardMall];

  static Place? byId(String id) {
    for (final p in all) {
      if (p.id == id) return p;
    }
    return null;
  }

  /// This place's lots in a raw `lots/` snapshot (those with its
  /// [siteId] and a position), by lot id.
  Map<String, Map<String, dynamic>> siteLots(Object? rawLots) => {
        if (rawLots is Map)
          for (final e in rawLots.entries)
            if (e.value is Map &&
                (e.value as Map)['siteId'] == siteId &&
                _readLatLng(Map<String, dynamic>.from(e.value as Map)) != null)
              e.key.toString(): Map<String, dynamic>.from(e.value as Map),
      };

  /// Takes this place's lots, positions and names from a raw `lots/`
  /// snapshot. Anything but a map (no data yet, or no connection) keeps
  /// the lots it already has.
  void applyLots(Object? rawLots) {
    if (rawLots is! Map) return;
    final lots = siteLots(rawLots);
    lotPositions
      ..clear()
      ..addAll({for (final e in lots.entries) e.key: _readLatLng(e.value)!});
    lotNames
      ..clear()
      ..addAll({
        for (final e in lots.entries)
          e.key: e.value['name']?.toString() ?? prettyLotName(e.key),
      });
  }

  static StreamSubscription<DatabaseEvent>? _lotsSub;

  /// Keeps every place's lots in step with `lots/` while the app runs, so
  /// a lot the dashboard adds or moves shows up without an update.
  static void watchLots() {
    _lotsSub ??= FirebaseDatabase.instance.ref('lots').onValue.listen(
          (event) => applyLotsToAll(event.snapshot.value),
          onError: (_) {}, // keeps the lots it has
        );
  }

  static void applyLotsToAll(Object? rawLots) {
    for (final p in all) {
      p.applyLots(rawLots);
    }
  }

  /// Every lot id that at least one curb in `units/` names, at any place.
  static final Set<String> _lotsWithCurbs = {};

  static StreamSubscription<DatabaseEvent>? _unitsSub;

  /// Keeps [liveParking] in step with `units/` while the app runs, so a
  /// curb moved into a lot (or out of it) counts there without an update.
  static void watchUnits() {
    _unitsSub ??= FirebaseDatabase.instance.ref('units').onValue.listen(
          (event) => applyUnitsToAll(event.snapshot.value),
          onError: (_) {}, // keeps what it knows
        );
  }

  /// Takes which lots have curbs from a raw `units/` snapshot. Null means
  /// there are no curbs at all; anything else that isn't a map is ignored.
  static void applyUnitsToAll(Object? rawUnits) {
    if (rawUnits != null && rawUnits is! Map) return;
    _lotsWithCurbs
      ..clear()
      ..addAll([
        if (rawUnits is Map)
          for (final unit in rawUnits.values)
            if (unit is Map && '${unit['lot'] ?? ''}'.isNotEmpty)
              unit['lot'].toString(),
      ]);
  }
}

/// How a place is saved to a user's Home (`drivers/<uid>/locations/<id>`),
/// from the add dialog or by the assistant.
Map<String, Object> savedPlaceEntry(Place p) => {
      'shortName': p.shortName,
      'fullName': p.fullName,
      'address': p.address,
      'addedAt': ServerValue.timestamp,
    };
