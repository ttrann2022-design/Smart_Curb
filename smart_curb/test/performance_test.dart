// Performance & efficiency, measured against published standards:
//  - Google's RAIL model: handle input within 50 ms (visible response
//    under 100 ms), and per-frame work under 16 ms (60 fps).
//  - Android vitals: frames over 16 ms are "slow", over 700 ms "frozen".
//  - ISO/IEC 25010 "performance efficiency": time behaviour, resource
//    utilization and capacity.
// Plus empirical time complexity: how the time grows as the data grows.
//
// Each measurement prints one line the test report turns into a table:
//   PERF|<area>|<what>|<value>|<budget>|<unit>|<standard>
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:smart_curb/assistant.dart';
import 'package:smart_curb/main.dart';

import 'assistant_test.dart' show FakeData, openLots, useTestLots;

/// Records a measurement and checks it's within [budget].
void perf(String area, String what, double value, double budget, String unit,
    String standard) {
  // ignore: avoid_print
  print('PERF|$area|$what|${value.toStringAsFixed(value < 10 ? 2 : 0)}'
      '|${budget.toStringAsFixed(budget < 10 ? 2 : 0)}|$unit|$standard');
  expect(value, lessThanOrEqualTo(budget), reason: '$what: $value $unit > $budget');
}

/// Milliseconds per call of [f], best of a few rounds (less noise).
double timeMs(void Function() f, {int repeat = 20, int rounds = 3}) {
  var best = double.infinity;
  for (var r = 0; r < rounds; r++) {
    final sw = Stopwatch()..start();
    for (var i = 0; i < repeat; i++) {
      f();
    }
    best = math.min(best, sw.elapsedMicroseconds / 1000 / repeat);
  }
  return best;
}

/// The growth exponent k in time ≈ c·n^k, from timings at n and 4n and
/// 16n (1 = linear, 2 = quadratic).
double growth(double Function(int n) timeAt, int n) {
  final t1 = timeAt(n), t2 = timeAt(n * 4), t3 = timeAt(n * 16);
  final k1 = math.log(t2 / t1) / math.log(4);
  final k2 = math.log(t3 / t2) / math.log(4);
  return (k1 + k2) / 2;
}

/// Live data for [units] curbs spread over FAU's lots.
({Map<String, Object> lots, Map<String, Object> units}) liveData(int units) {
  final ids = fauBoca.lotPositions.keys.toList();
  return (
    lots: {for (final id in ids) id: {'name': prettyLotName(id)}},
    units: {
      for (var i = 0; i < units; i++)
        'C-$i': {
          'lot': ids[i % ids.length],
          'occupied': i.isEven,
          'online': i % 7 != 0,
        },
    },
  );
}

void main() {
  useTestLots();
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    for (final p in Place.all) {
      await p.pathfinder.load();
    }
  });

  group('time behaviour', () {
    test('chat reply (built-in assistant) under the 50 ms input budget', () async {
      final bot = SmartCurbAssistant(FakeData(saved: ['fau_boca']));
      const messages = [
        'hi', 'where should I park for ED-47', 'is lot 14 full?',
        'what do the colors mean', 'my vehicles', 'how do I choose a building?',
        'open spots right now', 'parking for the gym', 'I had a car accident',
        'how do I register another account', 'asdf qwerty', 'thanks!',
      ];
      await bot.reply('warm up');
      final times = <double>[];
      for (final q in messages) {
        final sw = Stopwatch()..start();
        await bot.reply(q);
        times.add(sw.elapsedMicroseconds / 1000);
      }
      times.sort();
      perf('Time behaviour', 'Chat reply, median', times[times.length ~/ 2], 50,
          'ms', 'RAIL response');
      perf('Time behaviour', 'Chat reply, slowest', times.last, 100, 'ms',
          'RAIL response');
    });

    test('building search fits in one frame per keystroke', () {
      final buildings = fauBoca.buildings;
      var worst = 0.0;
      for (final q in ['e', 'ed', 'ed-4', 'lib', 'college of', 'business', 'zz']) {
        worst = math.max(worst, timeMs(() => rankBuildingMatches(buildings, q)));
      }
      perf('Time behaviour', 'Building search per keystroke', worst, 16, 'ms',
          'RAIL animation / 60 fps frame');
    });

    test('best spot for a building within the response budget', () {
      final lots = openLots(fauBoca);
      var worst = 0.0;
      for (final b in fauBoca.buildings) {
        worst = math.max(worst,
            timeMs(() => bestParkingFor(fauBoca, b, lots), repeat: 1, rounds: 2));
      }
      perf('Time behaviour', 'Best parking, repeat lookup (cached)', worst, 100,
          'ms', 'RAIL response');
    });

    test('a live parking update is processed within one frame', () {
      final d = liveData(300);
      final t = timeMs(() => parseLiveLots(fauBoca, d.lots, d.units));
      perf('Time behaviour', 'Live update, 300 curbs', t, 16, 'ms',
          'Android vitals: frame < 16 ms');
    });

    test('each GPS fix is smoothed almost instantly', () {
      final s = GpsSmoother();
      var t = DateTime(2026);
      var i = 0;
      final ms = timeMs(() {
        t = t.add(const Duration(seconds: 1));
        s.add(LatLng(26.37 + i++ * 1e-5, -80.10),
            accuracy: 8, speed: 5, heading: 90, at: t);
      }, repeat: 500);
      perf('Time behaviour', 'GPS fix smoothing', ms, 1, 'ms',
          'RAIL animation (per-frame work)');
    });
  });

  group('resource utilization', () {
    test('map data assets stay small', () {
      for (final f in ['assets/campus_walkways.json', 'assets/broward_walkways.json']) {
        final kb = File(f).lengthSync() / 1024;
        perf('Resource utilization', 'Asset ${f.split('/').last}', kb, 5 * 1024,
            'KB', 'ISO 25010 resource utilization');
      }
    });

    test('the chat stays fast however long it gets', () async {
      final bot = SmartCurbAssistant(FakeData());
      Future<double> avg(int n) async {
        final sw = Stopwatch()..start();
        for (var i = 0; i < n; i++) {
          await bot.reply(i.isEven ? 'is lot 14 full?' : 'what do the colors mean');
        }
        return sw.elapsedMicroseconds / 1000 / n;
      }

      final early = await avg(30);
      for (var i = 0; i < 300; i++) {
        await bot.reply('hello number $i');
      }
      final late = await avg(30);
      perf('Resource utilization', 'Chat slowdown after 330 messages',
          late / early, 2, 'x', 'ISO 25010 resource utilization (bounded memory)');
    });
  });

  group('capacity', () {
    test('handles 10,000 curbs in one update', () {
      final d = liveData(10000);
      final t = timeMs(() => parseLiveLots(fauBoca, d.lots, d.units), repeat: 3);
      perf('Capacity', 'Live update, 10,000 curbs', t, 100, 'ms',
          'RAIL response / ISO 25010 capacity');
    });

    test('every building at every place in one go', () {
      final sw = Stopwatch()..start();
      var n = 0;
      for (final p in Place.all) {
        final lots = openLots(p);
        for (final b in p.buildings) {
          bestParkingFor(p, b, lots);
          n++;
        }
      }
      perf('Capacity', 'All $n buildings routed (warm)', sw.elapsedMilliseconds.toDouble(),
          5000, 'ms', 'Android vitals: under 5 s (ANR)');
    });
  });

  group('time complexity', () {
    test('live update grows linearly with the number of curbs', () {
      final k = growth((n) {
        final d = liveData(n);
        return timeMs(() => parseLiveLots(fauBoca, d.lots, d.units), repeat: 3);
      }, 500);
      perf('Time complexity', 'Live update ≈ O(n^k), k', k, 1.4, '',
          'linear O(n) expected');
    });

    test('building search grows linearly with the number of buildings', () {
      final k = growth((n) {
        final many = [
          for (var i = 0; i < n; i++) fauBoca.buildings[i % fauBoca.buildings.length],
        ];
        return timeMs(() => rankBuildingMatches(many, 'college'), repeat: 5);
      }, 200);
      perf('Time complexity', 'Building search ≈ O(n^k), k', k, 1.4, '',
          'linear O(n) expected');
    });
  });
}
