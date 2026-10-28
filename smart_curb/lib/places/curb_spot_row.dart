// A row of Smart Curb parking spaces on the map.
part of '../main.dart';

/// A straight row of parking spaces with one curb unit in each, drawn on the
/// map as 3D blocks coloured by the unit's live status.
class CurbSpotRow {
  final String lotId;

  /// Centre of the first space in the row.
  final LatLng first;

  /// Compass direction the row runs, from the first space to the next.
  final double rowBearing;

  /// Curb unit ids, first space first.
  final List<String> unitIds;

  /// Cars enter each space from this side of the row (seen facing
  /// [rowBearing]); the curb is at the other end of the space.
  final bool enterFromRight;

  /// How far back along the row from the first space's centre the lane
  /// behind the row meets the road.
  final double laneLeadIn;

  /// From the spaces' open end to the centre of the lane behind them (so
  /// two facing rows' open ends are twice this apart). Widen it to make two
  /// facing rows fill the room between their lot's aisles.
  final double laneOffset;

  const CurbSpotRow({
    required this.lotId,
    required this.first,
    required this.rowBearing,
    required this.unitIds,
    required this.enterFromRight,
    required this.laneLeadIn,
    this.laneOffset = defaultLaneOffset,
  });

  /// The row across the lane from [row], facing it: open ends toward each
  /// other, so its curbs are at the far end of its spaces. Its spaces sit
  /// directly opposite [row]'s ([unitIds] starts opposite [row]'s first),
  /// and both rows are driven into from the one lane between them.
  CurbSpotRow.facing(
    CurbSpotRow row, {
    required this.unitIds,
    String? lotId,
  })  : lotId = lotId ?? row.lotId,
        first = Geo.offset(
          row.first,
          row.entryBearing,
          spaceDepth + 2 * row.laneOffset,
        ),
        rowBearing = row.rowBearing,
        enterFromRight = !row.enterFromRight,
        laneLeadIn = row.laneLeadIn,
        laneOffset = row.laneOffset;

  /// A 3 m lane: two facing rows fit between aisles 18 m apart with ~1 m to
  /// spare at each curb end.
  static const double defaultLaneOffset = 1.5; // m

  /// Compass direction from a space's centre toward its open end.
  double get entryBearing => rowBearing + (enterFromRight ? 90 : -90);

  /// Compass direction from a space's centre toward its curb (the front).
  double get curbBearing => (entryBearing + 180) % 360;

  /// The drive in to space [index]: from where the lane behind the row
  /// meets the road, along the lane to behind the space, then into it
  /// through its open end, stopping at its centre (curb ahead of the car).
  List<LatLng> approach(int index) {
    LatLng lane(double along) => Geo.offset(
          Geo.offset(first, rowBearing, along),
          entryBearing,
          spaceDepth / 2 + laneOffset,
        );
    return [
      lane(-laneLeadIn),
      lane(index * spaceWidth),
      Geo.offset(first, rowBearing, index * spaceWidth),
    ];
  }

  /// A standard US parking space (9 ft wide along the row, 18 ft deep),
  /// drawn 20% larger so the blocks read well on the map.
  static const double spaceWidth = 2.7 * 1.2; // m
  static const double spaceDepth = 5.5 * 1.2; // m

  /// Space left between neighbouring blocks so each one reads separately.
  static const double gap = 0.3 * 1.2; // m

  /// Each space's unit id, centre, outline (a closed ring of corners) and
  /// which way its curb is ([curbBearing]).
  List<({String unitId, LatLng center, List<LatLng> ring, double curbBearing})>
      spaces() {
    const halfW = (spaceWidth - gap) / 2;
    const halfD = spaceDepth / 2;
    final across = rowBearing + 90;
    LatLng corner(LatLng c, double w, double d) =>
        Geo.offset(Geo.offset(c, rowBearing, w), across, d);
    return [
      for (var i = 0; i < unitIds.length; i++)
        () {
          final c = Geo.offset(first, rowBearing, i * spaceWidth);
          final ring = [
            corner(c, halfW, halfD),
            corner(c, halfW, -halfD),
            corner(c, -halfW, -halfD),
            corner(c, -halfW, halfD),
          ];
          return (
            unitId: unitIds[i],
            center: c,
            ring: [...ring, ring.first],
            curbBearing: curbBearing,
          );
        }(),
    ];
  }
}
