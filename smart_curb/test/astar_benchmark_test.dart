// The teammate's crowd-weighted A* model (../run_parking_test.py and
// ../test_benchmarker.py), run on the app's REAL data: FAU's and Broward
// Mall's walkway networks, their real lots and buildings, with crowd
// ratings for busy lots and busy paths. The Python files used a made-up
// 6x6 grid; the algorithm here is the same, step for step.
import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:smart_curb/main.dart';

import 'assistant_test.dart' show useTestLots;

/// A walking graph: node -> [(neighbor, meters)].
typedef Graph = Map<String, List<(String, double)>>;

class AStarResult {
  AStarResult(this.status, this.path, this.cost, this.timeMs, this.expanded,
      this.generated, this.maxOpen);
  final String status; // SUCCESS or NO_PATH_FOUND
  final List<String> path;
  final double cost; // infinity when no path
  final double timeMs;
  final int expanded, generated, maxOpen;
}

/// A* where each step costs its distance times a crowd multiplier for the
/// node it enters: rating 1 (clear) to 5 (blocked / full). heuristicWeight
/// 1.0 is plain A*; above 1 is weighted (greedier) A*.
class AStarBenchmarker {
  AStarBenchmarker(this.graph, this.heuristics, this.crowdRatings,
      {this.heuristicWeight = 1.0});

  final Graph graph;
  final Map<String, double> heuristics;
  final Map<String, int> crowdRatings;
  final double heuristicWeight;

  static const crowdMultipliers = {
    1: 1.0, // empty / fast
    2: 1.2, // mild crowd
    3: 1.5, // moderate crowd
    4: 2.5, // heavy congestion
    5: double.infinity, // blocked / full
  };

  double _edgeCost(String neighbor, double base) =>
      base * (crowdMultipliers[crowdRatings[neighbor] ?? 1] ?? double.infinity);

  double _h(String node) => (heuristics[node] ?? 0) * heuristicWeight;

  AStarResult search(String start, String goal) {
    final sw = Stopwatch()..start();
    final open = _Heap()..push(_h(start), start);
    final cameFrom = <String, String>{};
    final g = <String, double>{start: 0};
    var expanded = 0, generated = 1, maxOpen = 1;

    while (open.isNotEmpty) {
      maxOpen = math.max(maxOpen, open.length);
      final (f, current) = open.pop();
      // Lazy deletion: skip stale queue entries.
      if (g.containsKey(current) && f > g[current]! + _h(current)) continue;
      expanded++;

      if (current == goal) {
        final path = [current];
        var c = current;
        while (cameFrom.containsKey(c)) {
          c = cameFrom[c]!;
          path.add(c);
        }
        return AStarResult('SUCCESS', path.reversed.toList(),
            (g[goal]! * 100).round() / 100, sw.elapsedMicroseconds / 1000,
            expanded, generated, maxOpen);
      }

      for (final (neighbor, base) in graph[current] ?? const <(String, double)>[]) {
        final w = _edgeCost(neighbor, base);
        if (w == double.infinity) continue; // blocked
        final tentative = g[current]! + w;
        if (!g.containsKey(neighbor) || tentative < g[neighbor]!) {
          cameFrom[neighbor] = current;
          g[neighbor] = tentative;
          open.push(tentative + _h(neighbor), neighbor);
          generated++;
        }
      }
    }
    return AStarResult('NO_PATH_FOUND', const [], double.infinity,
        sw.elapsedMicroseconds / 1000, expanded, generated, maxOpen);
  }
}

/// A min-heap of (f, node), ties broken by node name (like Python's heapq).
class _Heap {
  final _items = <(double, String)>[];
  int get length => _items.length;
  bool get isNotEmpty => _items.isNotEmpty;

  static bool _less((double, String) a, (double, String) b) =>
      a.$1 < b.$1 || (a.$1 == b.$1 && a.$2.compareTo(b.$2) < 0);

  void push(double f, String node) {
    _items.add((f, node));
    var i = _items.length - 1;
    while (i > 0) {
      final p = (i - 1) >> 1;
      if (!_less(_items[i], _items[p])) break;
      final t = _items[i];
      _items[i] = _items[p];
      _items[p] = t;
      i = p;
    }
  }

  (double, String) pop() {
    final top = _items.first;
    final last = _items.removeLast();
    if (_items.isNotEmpty) {
      _items[0] = last;
      var i = 0;
      while (true) {
        final l = 2 * i + 1, r = l + 1;
        var m = i;
        if (l < _items.length && _less(_items[l], _items[m])) m = l;
        if (r < _items.length && _less(_items[r], _items[m])) m = r;
        if (m == i) break;
        final t = _items[i];
        _items[i] = _items[m];
        _items[m] = t;
        i = m;
      }
    }
    return top;
  }
}

/// A place's real walking network, with its lots and a building attached
/// like the template's parking hubs: each to its nearest walkway point.
class RealNetwork {
  RealNetwork(this.place) {
    final nodes = place.pathfinder.nodes;
    for (final e in nodes.entries) {
      graph[e.key] = [];
      pos[e.key] = e.value;
    }
    for (final e in place.pathfinder.edges) {
      if (e.length < 2 || !nodes.containsKey(e[0]) || !nodes.containsKey(e[1])) continue;
      final d = Geo.meters(nodes[e[0]]!, nodes[e[1]]!);
      graph[e[0]]!.add((e[1], d));
      graph[e[1]]!.add((e[0], d));
    }
    for (final lot in place.lotPositions.entries) {
      attach('LOT:${lot.key}', lot.value);
    }
  }

  final Place place;
  final Graph graph = {};
  final Map<String, LatLng> pos = {};

  /// The walkway point each attached node (lot / building) hangs off.
  final Map<String, String> accessOf = {};

  int get walkwayNodes => place.pathfinder.nodes.length;

  /// Adds [id] at [at], linked both ways to its 3 nearest walkway points
  /// (a lot or building is reached from more than one path, like the app's
  /// snapping to the nearest walkway).
  void attach(String id, LatLng at) {
    final nearest = [
      for (final e in place.pathfinder.nodes.entries)
        (id: e.key, d: Geo.meters(at, e.value)),
    ]..sort((a, b) => a.d.compareTo(b.d));
    graph[id] = [];
    for (final n in nearest.take(3)) {
      if (n != nearest.first && n.d > math.max(150, nearest.first.d * 2)) break;
      graph[id]!.add((n.id, n.d));
      graph[n.id]!.add((id, n.d));
    }
    pos[id] = at;
    accessOf[id] = nearest.first.id;
  }

  String building(String code) {
    final b = place.buildings.firstWhere((b) => b.code == code);
    final id = 'BLDG:$code';
    if (!graph.containsKey(id)) attach(id, b.position);
    return id;
  }

  /// Straight-line meters from every node to [goal] (admissible: no walk
  /// is shorter).
  Map<String, double> heuristicsTo(String goal) {
    final g = pos[goal]!;
    return {for (final e in pos.entries) e.key: Geo.meters(e.value, g)};
  }

  /// Every walkway point within [meters] of [center].
  Iterable<String> near(LatLng center, double meters) => place.pathfinder.nodes
      .entries
      .where((e) => Geo.meters(e.value, center) <= meters)
      .map((e) => e.key);
}

/// A lot's crowd rating from how full it is: 5 means full.
int ratingFor(double occupancy) => occupancy >= 1
    ? 5
    : occupancy >= 0.75
        ? 4
        : occupancy >= 0.5
            ? 3
            : occupancy >= 0.25
                ? 2
                : 1;

void main() {
  useTestLots();
  TestWidgetsFlutterBinding.ensureInitialized();
  late RealNetwork fau;
  late RealNetwork mall;
  late Map<String, int> busyDay;

  setUpAll(() async {
    for (final p in Place.all) {
      await p.pathfinder.load();
    }
    fau = RealNetwork(fauBoca);
    mall = RealNetwork(browardMall);

    // A busy weekday at FAU: every lot's occupancy (Lot 14 from the curb
    // data the app's tests use: 1 of 2 free; the rest a fixed simulated
    // day), plus a lunch rush on the paths around the Student Union and a
    // crowd by the library.
    final rnd = math.Random(2026);
    busyDay = {
      for (final id in fauBoca.lotPositions.keys)
        'LOT:$id': ratingFor(id == 'lot14' ? 0.5 : rnd.nextDouble() * 1.1),
    };
    final union = fauBoca.buildings.firstWhere((b) => b.code == 'UN-31').position;
    final library = fauBoca.buildings.firstWhere((b) => b.code == 'LY-3').position;
    for (final n in fau.near(union, 80)) {
      busyDay[n] = 4;
    }
    for (final n in fau.near(library, 50)) {
      busyDay[n] = 3;
    }
  });

  group('the model on the real map', () {
    test('the real networks are large and connected enough to route on', () {
      // ignore: avoid_print
      print('Real FAU walkway network: ${fau.walkwayNodes} points, '
          '${fauBoca.lotPositions.length} lots attached; Broward: '
          '${mall.walkwayNodes} points');
      expect(fau.walkwayNodes, greaterThan(100));
      expect(mall.walkwayNodes, greaterThan(20));
    });

    test('it agrees with the app\'s own walking paths (no crowds)', () {
      // Same building, same lot, nobody around: the model's distance and
      // the app's path should be about the same walk.
      for (final (code, lot) in [('ED-47', 'lot07'), ('LY-3', 'lot51'), ('BU-86', 'lot06')]) {
        final start = fau.building(code);
        final goal = 'LOT:$lot';
        final res = AStarBenchmarker(fau.graph, fau.heuristicsTo(goal), const {})
            .search(start, goal);
        final b = fauBoca.buildings.firstWhere((b) => b.code == code);
        final app = Geo.pathLength(
            fauBoca.pathfinder.findPath(fauBoca.lotPositions[lot]!, b.position));
        // ignore: avoid_print
        print('Model vs app, $code to $lot: ${res.cost.round()} m vs ${app.round()} m');
        expect(res.status, 'SUCCESS');
        expect((res.cost - app).abs(), lessThan(60 + app * 0.15),
            reason: '$code to $lot: model ${res.cost} m, app $app m');
      }
    });

    // The template's benchmark, on real buildings and lots: plain (w=1.0)
    // and weighted (w=1.25) A* on a busy day.
    for (final (code, lots) in [
      ('ED-47', ['lot07', 'lot14', 'lot05', 'garage2']),
      ('UN-31', ['lot16', 'lot51', 'garage1']),
    ]) {
      test('busy day: from $code to real lots, plain and weighted', () {
        final start = fau.building(code);
        for (final lot in lots) {
          final goal = 'LOT:$lot';
          final h = fau.heuristicsTo(goal);
          for (final w in [1.0, 1.25]) {
            final bm = AStarBenchmarker(fau.graph, h, busyDay, heuristicWeight: w);
            bm.search(start, goal); // warm up
            final res = bm.search(start, goal);
            // ignore: avoid_print
            print('A* benchmark: $code→$lot  w=$w  ${res.status}  cost ${res.cost}  '
                '${res.expanded} nodes  ${res.timeMs.toStringAsFixed(3)} ms');
            expect(res.timeMs, lessThan(50), reason: 'RAIL: well under 50 ms');
            if (busyDay[goal] == 5) {
              expect(res.status, 'NO_PATH_FOUND', reason: '$lot is full');
            } else {
              expect(res.status, 'SUCCESS', reason: '$code to $lot');
              expect(res.path.first, start);
              expect(res.path.last, goal);
            }
          }
        }
      });
    }

    test('every FAU lot from every one of 5 buildings, timed', () {
      var routes = 0;
      final sw = Stopwatch()..start();
      for (final code in ['ED-47', 'LY-3', 'BU-86', 'UN-31', 'EE-96']) {
        final start = fau.building(code);
        for (final id in fauBoca.lotPositions.keys) {
          final goal = 'LOT:$id';
          AStarBenchmarker(fau.graph, fau.heuristicsTo(goal), busyDay).search(start, goal);
          routes++;
        }
      }
      sw.stop();
      // ignore: avoid_print
      print('Crowd-weighted model: $routes routes in ${sw.elapsedMilliseconds} ms');
      expect(sw.elapsed, lessThan(const Duration(seconds: 10)));
    });

    test('Broward Mall: Macy\'s to every lot', () {
      final code = browardMall.buildings.firstWhere((b) => b.name.contains('Macy')).code;
      final start = mall.building(code);
      for (final id in browardMall.lotPositions.keys) {
        final goal = 'LOT:$id';
        final res = AStarBenchmarker(mall.graph, mall.heuristicsTo(goal), const {})
            .search(start, goal);
        expect(res.status, 'SUCCESS', reason: id);
        expect(res.timeMs, lessThan(50));
      }
    });
  });

  // test_benchmarker.py's five edge cases, on the real FAU map: walking
  // from the College of Education (ED-47) to Lot 7 (and Lot 14).
  group('edge cases on the real map (test_benchmarker.py)', () {
    late String start;
    const goal = 'LOT:lot07';
    setUp(() => start = fau.building('ED-47'));
    AStarResult go(Map<String, int> ratings, {String to = goal}) =>
        AStarBenchmarker(fau.graph, fau.heuristicsTo(to), ratings).search(start, to);

    test('1. construction on the usual path forces a reroute', () {
      final usual = go(const {});
      expect(usual.status, 'SUCCESS');
      // Close points along the usual path, one at a time, until one has a
      // way around (some are the only bridge, like a single doorway).
      final inner = usual.path.sublist(2, usual.path.length - 2);
      var rerouted = false;
      for (final blocked in inner) {
        final res = go({blocked: 5});
        if (res.status != 'SUCCESS') continue;
        expect(res.path, isNot(contains(blocked)), reason: 'should avoid the block');
        expect(res.cost, greaterThanOrEqualTo(usual.cost - 0.01));
        rerouted = true;
        break;
      }
      expect(rerouted, isTrue, reason: 'no detour found around any point');
    });

    test('2. the lot is 100% full: no path', () {
      final res = go({goal: 5});
      expect(res.status, 'NO_PATH_FOUND');
      expect(res.cost, double.infinity);
      expect(res.path, isEmpty);
    });

    test('3. the lot cut off (every walkway into it closed): no path', () {
      final res = go({for (final (n, _) in fau.graph[goal]!) n: 5});
      expect(res.status, 'NO_PATH_FOUND');
    });

    test('4. the lot fills up mid-route: the cost goes up (2.5x on arrival)', () {
      final open = go({goal: 1});
      final busy = go({goal: 4});
      expect(busy.status, 'SUCCESS');
      expect(busy.cost, greaterThan(open.cost));
    });

    test('5. failover: a full lot has no path, an open one does', () {
      const ratings = {'LOT:lot07': 5, 'LOT:lot14': 1};
      expect(go(ratings).status, 'NO_PATH_FOUND');
      expect(go(ratings, to: 'LOT:lot14').status, 'SUCCESS');
    });
  });
}
