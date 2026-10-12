import 'package:flutter_test/flutter_test.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:smart_curb/main.dart';

/// Each point's distance to the end of the path (what the map keeps for
/// its route).
List<double> suffixOf(List<LatLng> pts) {
  final s = List<double>.filled(pts.length, 0.0);
  for (var i = pts.length - 2; i >= 0; i--) {
    s[i] = s[i + 1] + Geo.meters(pts[i], pts[i + 1]);
  }
  return s;
}

/// Distance from [p] to the nearest point of the path.
double offPath(List<LatLng> pts, LatLng p) {
  var best = double.infinity;
  for (var i = 0; i < pts.length - 1; i++) {
    final q = Geo.lerp(pts[i], pts[i + 1], Geo.projectT(p, pts[i], pts[i + 1]));
    final d = Geo.meters(p, q);
    if (d < best) best = d;
  }
  return best;
}

void main() {
  // A drive east along a road, then a left turn north at the corner.
  const start = LatLng(26.3690, -80.1080);
  const corner = LatLng(26.3690, -80.1060);
  const end = LatLng(26.3710, -80.1060);
  final path = [start, corner, end];
  final suffix = suffixOf(path);
  final firstLeg = Geo.meters(start, corner);
  final total = suffix.first;

  test('pointAlong finds both ends and clamps past them', () {
    expect(Geo.meters(Geo.pointAlong(path, suffix, 0).point, start), lessThan(0.01));
    expect(Geo.meters(Geo.pointAlong(path, suffix, total).point, end), lessThan(0.01));
    expect(Geo.meters(Geo.pointAlong(path, suffix, -50).point, start), lessThan(0.01));
    expect(Geo.meters(Geo.pointAlong(path, suffix, total + 50).point, end), lessThan(0.01));
    expect(Geo.pointAlong(path, suffix, 0).seg, 0);
    expect(Geo.pointAlong(path, suffix, total).seg, 1);
  });

  test('pointAlong measures distance along the road, segment by segment', () {
    final half = Geo.pointAlong(path, suffix, firstLeg / 2);
    expect(half.seg, 0);
    expect(Geo.meters(start, half.point), closeTo(firstLeg / 2, 0.05));

    final pastCorner = Geo.pointAlong(path, suffix, firstLeg + 10);
    expect(pastCorner.seg, 1);
    expect(Geo.meters(corner, pastCorner.point), closeTo(10, 0.05));
  });

  test('gliding along the route never cuts the corner', () {
    // Two fixes 20 m before and after the corner. A straight glide between
    // them leaves the road (halfway, 10 m from both legs); a glide along the
    // route stays on it.
    final before = Geo.pointAlong(path, suffix, firstLeg - 20).point;
    final after = Geo.pointAlong(path, suffix, firstLeg + 20).point;
    expect(offPath(path, Geo.lerp(before, after, 0.5)), closeTo(10, 0.05));

    for (var i = 0; i <= 20; i++) {
      final s = (firstLeg - 20) + 40 * i / 20;
      expect(offPath(path, Geo.pointAlong(path, suffix, s).point), lessThan(0.01));
    }
  });

  test('pointAlong copes with repeated points in the route', () {
    final dup = [start, start, corner, corner, end];
    final dupSuffix = suffixOf(dup);
    for (final s in [0.0, firstLeg / 2, firstLeg, firstLeg + 10, dupSuffix.first]) {
      final p = Geo.pointAlong(dup, dupSuffix, s).point;
      expect(p.latitude.isFinite && p.longitude.isFinite, isTrue);
      expect(offPath(path, p), lessThan(0.01));
    }
  });
}
