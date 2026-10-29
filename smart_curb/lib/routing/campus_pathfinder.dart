// A* walking paths over a place's walkway graph, and their results.
part of '../main.dart';

class PathResult {
  final String lotId;

  /// The open curb to park at, or null to park anywhere in the lot.
  final String? unitId;
  final List<LatLng> pathPoints;
  final double totalDistanceMeters;

  const PathResult({
    required this.lotId,
    this.unitId,
    required this.pathPoints,
    required this.totalDistanceMeters,
  });

  /// Where to park: the curb's space, or the lot itself (the walk's start).
  LatLng get parkAt => pathPoints.first;
}

class _GraphSnap {
  final String a;
  final String b;
  final LatLng point;
  final double dist;
  const _GraphSnap(this.a, this.b, this.point, this.dist);
}

/// Tiny binary min-heap for the A* open set (O(log n) instead of sorting).
class _MinHeap {
  final List<double> _keys = [];
  final List<String> _vals = [];

  bool get isNotEmpty => _keys.isNotEmpty;

  void push(double key, String val) {
    _keys.add(key);
    _vals.add(val);
    var i = _keys.length - 1;
    while (i > 0) {
      final p = (i - 1) >> 1;
      if (_keys[p] <= _keys[i]) break;
      _swap(i, p);
      i = p;
    }
  }

  String pop() {
    final top = _vals[0];
    final lastK = _keys.removeLast();
    final lastV = _vals.removeLast();
    if (_keys.isNotEmpty) {
      _keys[0] = lastK;
      _vals[0] = lastV;
      var i = 0;
      final n = _keys.length;
      while (true) {
        final l = 2 * i + 1;
        final r = l + 1;
        var m = i;
        if (l < n && _keys[l] < _keys[m]) m = l;
        if (r < n && _keys[r] < _keys[m]) m = r;
        if (m == i) break;
        _swap(i, m);
        i = m;
      }
    }
    return top;
  }

  void _swap(int a, int b) {
    final k = _keys[a];
    _keys[a] = _keys[b];
    _keys[b] = k;
    final v = _vals[a];
    _vals[a] = _vals[b];
    _vals[b] = v;
  }
}

/// A* walking routes over one place's walkway network.
class CampusPathfinder {
  /// [asset] holds the place's walking network (see [load]). [nodes] and
  /// [edges] are a small hand-made graph used until it loads, or if it
  /// can't be read.
  CampusPathfinder(this.asset, {this.nodes = const {}, this.edges = const []});

  final String asset;

  /// True once the full OpenStreetMap walkway network has been loaded.
  bool usingOsmGraph = false;

  /// Loads the walking network (every sidewalk, footpath, crossing, road
  /// and parking aisle from OpenStreetMap) from [asset]. Format: `nodes` =
  /// flat [lat, lon, ...], `edges` = flat [nodeIndex, nodeIndex, ...]. If it
  /// can't be read, the hand-made graph stays in use.
  Future<void> load() async {
    try {
      final raw = await rootBundle.loadString(asset);
      final json = jsonDecode(raw) as Map<String, dynamic>;
      final n = (json['nodes'] as List).cast<num>();
      final e = (json['edges'] as List).cast<num>();
      final newNodes = <String, LatLng>{
        for (var i = 0; i < n.length ~/ 2; i++)
          'n$i': LatLng(n[2 * i].toDouble(), n[2 * i + 1].toDouble()),
      };
      final newEdges = <List<String>>[
        for (var i = 0; i < e.length ~/ 2; i++)
          ['n${e[2 * i].toInt()}', 'n${e[2 * i + 1].toInt()}'],
      ];
      if (newNodes.isEmpty || newEdges.isEmpty) return;
      nodes = newNodes;
      edges = newEdges;
      _adj = _buildAdjacency();
      _cache.clear();
      _snapCache.clear();
      usingOsmGraph = true;
    } catch (err) {
      debugPrint('[walkways] using the built-in graph: $err');
    }
  }

  /// Walkway nodes: the hand-made graph until [load] replaces it with the
  /// full network.
  Map<String, LatLng> nodes;

  /// Walkways, listed once each. They are always two-way, so a one-sided
  /// neighbor list can no longer break the graph.
  List<List<String>> edges;

  late Map<String, Map<String, double>> _adj = _buildAdjacency();

  Map<String, Map<String, double>> _buildAdjacency() {
    final adj = <String, Map<String, double>>{};
    for (final e in edges) {
      final a = nodes[e[0]];
      final b = nodes[e[1]];
      assert(a != null, 'Walkway edge references unknown node "${e[0]}"');
      assert(b != null, 'Walkway edge references unknown node "${e[1]}"');
      if (a == null || b == null || e[0] == e[1]) continue;
      final w = Geo.meters(a, b);
      adj.putIfAbsent(e[0], () => {})[e[1]] = w;
      adj.putIfAbsent(e[1], () => {})[e[0]] = w;
    }
    return adj;
  }

  /// Lots, curbs and buildings never move, so each walk is computed once.
  final Map<String, PathResult> _cache = {};

  /// The walk from [from] (lot [lotId], or curb [unitId] in it) to a building.
  PathResult walkingRoute(
    String lotId,
    LatLng from,
    LatLng buildingPos, {
    String? unitId,
  }) {
    // Keyed by where the walk starts too: a lot moved in `lots/` gets a
    // fresh route, not the one from its old spot.
    final key = '$lotId|${unitId ?? ''}|${from.latitude},${from.longitude}'
        '|${buildingPos.latitude},${buildingPos.longitude}';
    return _cache.putIfAbsent(key, () {
      final path = findPath(from, buildingPos);
      return PathResult(
        lotId: lotId,
        unitId: unitId,
        pathPoints: path,
        totalDistanceMeters: Geo.pathLength(path),
      );
    });
  }

  /// Closest lot with a free space, by real walking distance. Full lots,
  /// lots whose sensors report nothing (capacity 0), and lots with no
  /// sensors at all (`sensors: false`, nobody can say they have space) are
  /// skipped. Null when no lot is left: there is no available parking.
  PathResult? findBestAvailableRoute({
    required LatLng buildingPos,
    required Map<String, Map<String, dynamic>> lots,
  }) {
    PathResult? best;
    for (final entry in lots.entries) {
      final occupied = (entry.value['occupied'] as num?)?.toInt() ?? 0;
      final capacity = (entry.value['capacity'] as num?)?.toInt() ?? 0;
      if (entry.value['sensors'] == false) continue;
      if (capacity <= 0 || occupied >= capacity) continue;

      final lotPos = entry.value['position'] as LatLng?;
      if (lotPos == null) continue;

      final r = walkingRoute(entry.key, lotPos, buildingPos);
      if (best == null || r.totalDistanceMeters < best.totalDistanceMeters) {
        best = r;
      }
    }
    return best;
  }

  /// Lots and buildings never move, so where each one joins the network is
  /// worked out once (there are thousands of walkway segments to check).
  final Map<String, List<_GraphSnap>> _snapCache = {};

  /// How much farther than its nearest walkway the destination may still
  /// join the network. Building positions are their centres, and the nearest
  /// walkway can be on the far side (BU-86's is south, but Lot 6 is north, so
  /// every route walked all the way around it). A building can be entered
  /// from any side, so the goal joins every walkway in reach and A* picks
  /// the side that is actually shorter; the walk from that walkway to the
  /// centre is part of the route's cost. The start (a lot or the user's
  /// position) still joins only its nearest walkway, or a route could skip
  /// the network at both ends.
  static const double _goalReach = 45.0; // meters

  /// Projects p onto every walkway segment (not just nodes) within [reach]
  /// of the nearest one, so points between nodes route correctly.
  List<_GraphSnap> _snapToGraph(LatLng p, {double reach = 0}) {
    // Walking reroutes start from live GPS points (each one new), so keep the
    // cache from growing forever.
    if (_snapCache.length > 500) _snapCache.clear();
    return _snapCache.putIfAbsent('$reach|${p.latitude},${p.longitude}', () {
      final all = <_GraphSnap>[];
      var nearest = double.infinity;
      for (final e in edges) {
        final pa = nodes[e[0]];
        final pb = nodes[e[1]];
        if (pa == null || pb == null) continue;
        final q = Geo.lerp(pa, pb, Geo.projectT(p, pa, pb));
        final d = Geo.meters(p, q);
        all.add(_GraphSnap(e[0], e[1], q, d));
        if (d < nearest) nearest = d;
      }
      return [
        for (final s in all)
          if (s.dist <= nearest + reach) s,
      ];
    });
  }

  List<LatLng> findPath(LatLng start, LatLng goal) {
    final ss = _snapToGraph(start);
    final gs = _snapToGraph(goal, reach: _goalReach);
    const sId = '__start';
    const gId = '__goal';

    // Temporary nodes/edges joining start and goal to the walkways: the
    // point itself, a node where it meets each walkway in reach, and that
    // walkway's two ends.
    final extra = <String, Map<String, double>>{};
    final pos = <String, LatLng>{sId: start, gId: goal};
    void link(String u, String v, double w) {
      extra.putIfAbsent(u, () => {})[v] = w;
      extra.putIfAbsent(v, () => {})[u] = w;
    }

    void join(String end, String prefix, List<_GraphSnap> snaps) {
      for (var i = 0; i < snaps.length; i++) {
        final s = snaps[i];
        final id = '$prefix$i';
        pos[id] = s.point;
        link(end, id, s.dist);
        link(id, s.a, Geo.meters(s.point, nodes[s.a]!));
        link(id, s.b, Geo.meters(s.point, nodes[s.b]!));
      }
    }

    join(sId, '__s', ss);
    join(gId, '__g', gs);
    for (var i = 0; i < ss.length; i++) {
      for (var j = 0; j < gs.length; j++) {
        if (ss[i].a == gs[j].a && ss[i].b == gs[j].b) {
          link('__s$i', '__g$j', Geo.meters(ss[i].point, gs[j].point)); // same walkway
        }
      }
    }

    LatLng posOf(String id) => pos[id] ?? nodes[id]!;

    final gScore = <String, double>{sId: 0.0};
    final cameFrom = <String, String>{};
    final closed = <String>{};
    final open = _MinHeap()..push(Geo.meters(start, goal), sId);

    while (open.isNotEmpty) {
      final current = open.pop();
      if (!closed.add(current)) continue; // stale heap entry

      if (current == gId) {
        final ids = <String>[gId];
        var c = gId;
        while (cameFrom.containsKey(c)) {
          c = cameFrom[c]!;
          ids.add(c);
        }
        final raw = ids.reversed.map(posOf); // starts at start, ends at goal
        // Drop near-duplicate consecutive points.
        final out = <LatLng>[raw.first];
        for (final p in raw.skip(1)) {
          if (Geo.meters(out.last, p) > 0.5) out.add(p);
        }
        if (out.length == 1) out.add(goal);
        return out;
      }

      final gc = gScore[current]!;
      final neighborMaps = [_adj[current], extra[current]];
      for (final m in neighborMaps) {
        if (m == null) continue;
        m.forEach((nId, w) {
          if (closed.contains(nId)) return;
          final tentative = gc + w;
          if (tentative < (gScore[nId] ?? double.infinity)) {
            gScore[nId] = tentative;
            cameFrom[nId] = current;
            open.push(tentative + Geo.meters(posOf(nId), goal), nId);
          }
        });
      }
    }

    return [start, goal]; // unreachable (graph disconnected)
  }
}

// ---------------------------------------------------------
// REAL STREET ROUTING (OSRM)
// ---------------------------------------------------------
