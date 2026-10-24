import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:smart_curb/main.dart';

const home = LatLng(26.3600, -80.1100);

/// [p] moved [east] and [north] meters.
LatLng offset(LatLng p, double east, double north) => LatLng(
      p.latitude + north / 111320,
      p.longitude + east / (111320 * math.cos(p.latitude * math.pi / 180)),
    );

void main() {
  final t0 = DateTime(2026, 10, 12, 16, 38);

  test('standing still indoors, fixes 30 m off barely move the arrow', () {
    final gps = GpsSmoother();
    final rnd = math.Random(7);
    LatLng? lastFix;
    LatLng? lastShown;
    var worstRawJump = 0.0;
    var worstShownJump = 0.0;
    for (var i = 0; i < 60; i++) {
      final fix = offset(home, rnd.nextDouble() * 60 - 30, rnd.nextDouble() * 60 - 30);
      final shown = gps.add(
        fix,
        accuracy: 30,
        speed: 0,
        heading: 0,
        at: t0.add(Duration(seconds: i)),
      );
      // How far the arrow moves from one second to the next, once the
      // first few readings have settled it.
      if (i >= 10) {
        worstRawJump = math.max(worstRawJump, Geo.meters(fix, lastFix!));
        worstShownJump = math.max(worstShownJump, Geo.meters(shown, lastShown!));
      }
      lastFix = fix;
      lastShown = shown;
    }
    expect(worstRawJump, greaterThan(40));
    expect(worstShownJump, lessThan(3));
  });

  test('driving at 45 mph, the arrow keeps up with the car', () {
    final gps = GpsSmoother();
    for (var i = 0; i < 30; i++) {
      final fix = offset(home, 20.0 * i, 0); // 20 m/s east
      final shown = gps.add(
        fix,
        accuracy: 5,
        speed: 20,
        heading: 90,
        at: t0.add(Duration(seconds: i)),
      );
      expect(Geo.meters(shown, fix), lessThan(3), reason: 'second $i');
    }
  });

  test('walking outdoors, the arrow keeps up instead of trailing behind', () {
    // Walking east at 1.4 m/s with ordinary outdoor GPS (±6 m of noise).
    final gps = GpsSmoother();
    final rnd = math.Random(3);
    var worstBehind = 0.0;
    for (var i = 0; i < 40; i++) {
      final truth = offset(home, 1.4 * i, 0);
      final fix = offset(truth, rnd.nextDouble() * 6 - 3, rnd.nextDouble() * 6 - 3);
      final shown = gps.add(
        fix,
        accuracy: 6,
        speed: 1.4,
        heading: 90,
        at: t0.add(Duration(seconds: i)),
      );
      if (i >= 10) {
        worstBehind = math.max(worstBehind, Geo.meters(shown, truth));
      }
    }
    expect(worstBehind, lessThan(2.5));
  });

  test('an unknown accuracy (0) is not treated as perfect', () {
    final gps = GpsSmoother();
    gps.add(home, accuracy: 5, speed: 0, heading: 0, at: t0);
    final shown = gps.add(
      offset(home, 40, 0),
      accuracy: 0,
      speed: 0,
      heading: 0,
      at: t0.add(const Duration(seconds: 1)),
    );
    expect(Geo.meters(shown, home), lessThan(10));
  });
}
