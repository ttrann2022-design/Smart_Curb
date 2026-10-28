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

  /// Where each parking lot is (lots are not graph nodes; like buildings,
  /// they are snapped onto the nearest walkway when routing).
  final Map<String, LatLng> lotPositions;

  /// True: lot occupancy comes live from the curbs in `units/` (names from
  /// `lots/`). False: no curbs here yet, so the lots in [lotPositions] are
  /// plain map points named by [lotNames], and the closest one to the
  /// destination by walking distance is recommended.
  final bool liveParking;
  final Map<String, String> lotNames;

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
    required this.lotPositions,
    required this.liveParking,
    this.lotNames = const {},
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
}

/// How a place is saved to a user's Home (`drivers/<uid>/locations/<id>`),
/// from the add dialog or by the assistant.
Map<String, Object> savedPlaceEntry(Place p) => {
      'shortName': p.shortName,
      'fullName': p.fullName,
      'address': p.address,
      'addedAt': ServerValue.timestamp,
    };
