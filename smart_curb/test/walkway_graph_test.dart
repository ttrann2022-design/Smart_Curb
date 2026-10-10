import 'package:flutter_test/flutter_test.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:smart_curb/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // A spread of buildings: near the lots, far west, far north, south.
  const buildings = {
    'ED-47': LatLng(26.373268, -80.105829),
    'BC-71': LatLng(26.373296, -80.100442),
    'CM-22': LatLng(26.372498, -80.104066),
    'GY-38 arena': LatLng(26.372357, -80.109352),
    'IR-70 dorm': LatLng(26.368233, -80.103209),
    'EE-96': LatLng(26.372883, -80.098079),
    'RD-01 north': LatLng(26.385306, -80.097104),
  };

  test('OSM walkway graph loads and routes every lot to every building', () async {
    await CampusPathfinder.load();
    expect(CampusPathfinder.usingOsmGraph, isTrue);
    expect(CampusPathfinder.nodes.length, greaterThan(1000));

    final sw = Stopwatch()..start();
    for (final b in buildings.entries) {
      final parts = <String>[];
      for (final lot in CampusPathfinder.lotPositions.entries) {
        final r = CampusPathfinder.walkingRoute(lot.key, lot.value, b.value);
        final straight = Geo.meters(lot.value, b.value);
        // Found a real path through the network, not the 2-point fallback.
        expect(r.pathPoints.length, greaterThan(2), reason: '${lot.key}->${b.key}');
        // Walking is never shorter than a straight line, and not absurd.
        expect(r.totalDistanceMeters, greaterThanOrEqualTo(straight - 1));
        expect(r.totalDistanceMeters, lessThan(straight * 3 + 300));
        parts.add('${lot.key} ${r.totalDistanceMeters.round()}m (line ${straight.round()}m)');
      }
      // ignore: avoid_print
      print('${b.key.padRight(12)} ${parts.join(' | ')}');
    }
    // ignore: avoid_print
    print('28 routes in ${sw.elapsedMilliseconds} ms');
  });
}
