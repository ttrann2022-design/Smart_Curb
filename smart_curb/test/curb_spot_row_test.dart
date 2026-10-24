import 'package:flutter_test/flutter_test.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:smart_curb/main.dart';

void main() {
  const row = CurbSpotRow(
    lotId: 'lot14',
    first: LatLng(26.373640, -80.099539),
    rowBearing: 179.0,
    unitIds: ['C-095', 'C-077', 'C-042', 'C-001'],
    enterFromRight: true,
    laneLeadIn: 2.4,
  );

  test('spaces sit one stall apart, in order, along the row', () {
    final s = row.spaces();
    expect(s.map((e) => e.unitId), ['C-095', 'C-077', 'C-042', 'C-001']);
    expect(Geo.meters(s.first.center, row.first), lessThan(0.01));
    for (var i = 1; i < s.length; i++) {
      expect(Geo.meters(s[i - 1].center, s[i].center),
          closeTo(CurbSpotRow.spaceWidth, 0.01));
      expect(Geo.bearing(s[i - 1].center, s[i].center), closeTo(179.0, 0.1));
    }
  });

  test('each space is a closed stall-sized rectangle', () {
    final ring = row.spaces().first.ring;
    expect(ring.length, 5);
    expect(ring.first, ring.last);
    expect(Geo.meters(ring[0], ring[1]), closeTo(CurbSpotRow.spaceDepth, 0.01));
    expect(Geo.meters(ring[1], ring[2]),
        closeTo(CurbSpotRow.spaceWidth - CurbSpotRow.gap, 0.01));
  });

  test('the drive in runs along the lane behind the row, then in from the open end', () {
    final spaces = row.spaces();
    final behind = CurbSpotRow.spaceDepth / 2 + CurbSpotRow.laneOffset;
    for (var i = 0; i < spaces.length; i++) {
      final a = row.approach(i);
      expect(a.length, 3);
      // Starts where the lane meets the road, before the first space.
      expect(Geo.meters(a[0], row.approach(0)[0]), lessThan(0.01));
      // Lane leg runs parallel to the row.
      if (i > 0) expect(Geo.bearing(a[0], a[1]), closeTo(179.0, 0.1));
      // Behind the space on the entry side (right of south = west)...
      expect(Geo.meters(a[1], spaces[i].center), closeTo(behind, 0.01));
      expect(Geo.bearing(spaces[i].center, a[1]), closeTo(269.0, 0.1));
      // ...and in, ending at the space's centre, heading toward the curb.
      expect(Geo.meters(a[2], spaces[i].center), lessThan(0.01));
      expect(Geo.bearing(a[1], a[2]), closeTo(89.0, 0.1));
    }
  });

  group('a facing row across the lane', () {
    final across = CurbSpotRow.facing(row, unitIds: ['C-301', 'C-302', 'C-303']);
    final mine = row.spaces();
    final theirs = across.spaces();

    test('sits directly opposite, open ends 2 x laneOffset apart', () {
      for (var i = 0; i < theirs.length; i++) {
        // Straight across (west), not shifted along the row.
        expect(Geo.bearing(mine[i].center, theirs[i].center), closeTo(269.0, 0.1));
        expect(Geo.meters(mine[i].center, theirs[i].center),
            closeTo(CurbSpotRow.spaceDepth + 2 * CurbSpotRow.laneOffset, 0.01));
      }
    });

    test('shares the lane, and is entered from its open end (curb reversed)', () {
      for (var i = 0; i < theirs.length; i++) {
        final a = across.approach(i);
        final b = row.approach(i);
        // Same lane: same start where it meets the road, same point behind.
        expect(Geo.meters(a[0], b[0]), lessThan(0.01));
        expect(Geo.meters(a[1], b[1]), lessThan(0.01));
        // Turns in the other way (west), toward its curb at the far end.
        expect(Geo.meters(a[2], theirs[i].center), lessThan(0.01));
        expect(Geo.bearing(a[1], a[2]), closeTo(269.0, 0.1));
      }
    });
  });
}
