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
    final pathfinder = fauBoca.pathfinder;
    await pathfinder.load();
    expect(pathfinder.usingOsmGraph, isTrue);
    expect(pathfinder.nodes.length, greaterThan(1000));

    final sw = Stopwatch()..start();
    for (final b in buildings.entries) {
      final parts = <String>[];
      for (final lot in fauBoca.lotPositions.entries) {
        final r = pathfinder.walkingRoute(lot.key, lot.value, b.value);
        final straight = Geo.meters(lot.value, b.value);
        // Found a real path through the network, not the 2-point fallback.
        expect(r.pathPoints.length, greaterThan(2), reason: '${lot.key}->${b.key}');
        // Walking is never shorter than a straight line, and not absurd.
        expect(r.totalDistanceMeters, greaterThanOrEqualTo(straight - 1));
        expect(r.totalDistanceMeters, lessThan(straight * 3 + 300));
        parts.add('${lot.key} ${r.totalDistanceMeters.round()}m (line ${straight.round()}m)');
      }
      // ignore: avoid_print
      print('${b.key.padRight(12)} ${parts.take(4).join(' | ')} ...');
    }
    final routes = buildings.length * fauBoca.lotPositions.length;
    // ignore: avoid_print
    print('$routes routes in ${sw.elapsedMilliseconds} ms');
  });

  test('Broward Mall: every lot reaches every store, closest lot is picked', () async {
    final pathfinder = browardMall.pathfinder;
    await pathfinder.load();
    expect(pathfinder.usingOsmGraph, isTrue);
    expect(pathfinder.nodes.length, greaterThan(1000));

    for (final b in browardMall.buildings) {
      for (final lot in browardMall.lotPositions.entries) {
        final r = pathfinder.walkingRoute(lot.key, lot.value, b.position);
        final straight = Geo.meters(lot.value, b.position);
        expect(r.pathPoints.length, greaterThan(2), reason: '${lot.key}->${b.code}');
        expect(r.totalDistanceMeters, greaterThanOrEqualTo(straight - 1));
        expect(r.totalDistanceMeters, lessThan(straight * 3 + 300));
      }
    }

    // No sensors at the mall: every lot qualifies (as the map screen builds
    // them), so the pick is simply the shortest walk.
    final lots = {
      for (final e in browardMall.lotPositions.entries)
        e.key: <String, dynamic>{
          'occupied': 0,
          'capacity': 0,
          'sensors': false,
          'position': e.value,
        },
    };
    String bestFor(String id) => pathfinder
        .findBestAvailableRoute(
          buildingPos: browardMall.buildings.firstWhere((b) => b.id == id).position,
          lots: lots,
        )!
        .lotId;
    // Each anchor has its own lot right outside.
    expect(bestFor('bm_dillards'), 'lot1');
    expect(bestFor('bm_macys'), 'lot2');
    expect(bestFor('bm_regal'), 'lot3');
    expect(bestFor('bm_jcpenney'), 'lot4');
  });
}
