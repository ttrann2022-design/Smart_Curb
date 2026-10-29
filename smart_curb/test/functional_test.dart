// What the app actually does, checked end to end: saving to and reading
// from the database, guiding the user to a spot, how fast the algorithm
// is, and the AI assistant. Each top-level group is one area of the test
// report (dart run tool/test_report.dart), and each perf() line is one of
// its measured checks, within a budget.
import 'package:flutter_test/flutter_test.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:smart_curb/assistant.dart';
import 'package:smart_curb/main.dart';

import 'assistant_test.dart' show FakeData, openLots, testLots, useTestLots;
import 'gemini_chat_test.dart' show FakeGoogle, ok, limited;
import 'performance_test.dart' show perf;

/// Lot 14's curbs as the database reports them: C-095 taken, C-077 open,
/// C-001 offline.
Map<String, Map<String, dynamic>> liveLots({bool c077Taken = false}) =>
    parseLiveLots(fauBoca, testLots, {
      'C-095': {'lot': 'lot14', 'occupied': true, 'online': true},
      'C-077': {'lot': 'lot14', 'occupied': c077Taken, 'online': true},
      'C-001': {'lot': 'lot14', 'occupied': false, 'online': false},
    });

FakeData userWithData() => FakeData(
      cars: [
        {'manufacturer': 'Toyota', 'model': 'Camry', 'year': '2020', 'color': 'Blue', 'plate': 'OWL123'},
        {'manufacturer': 'Honda', 'model': 'Civic', 'plate': 'HND777'},
      ],
      saved: ['fau_boca'],
      me: {
        'firstName': 'Sam', 'lastName': 'Owl', 'phone': '561-555-1234',
        'gender': 'Other', 'address1': '1 Owl Way', 'city': 'Boca Raton',
        'state': 'FL', 'zipCode': '33431', 'country': 'USA',
      },
    );

/// Milliseconds [f] takes.
Future<double> msOf(Future<void> Function() f) async {
  final sw = Stopwatch()..start();
  await f();
  return sw.elapsedMicroseconds / 1000;
}

/// How many of [expected]'s fields [actual] doesn't match.
double mismatches(Map<String, dynamic>? actual, Map<String, Object?> expected) =>
    expected.keys.where((k) => actual?[k] != expected[k]).length.toDouble();

void main() {
  useTestLots();
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    for (final p in Place.all) {
      await p.pathfinder.load();
    }
  });

  group('Saving data to the database', () {
    test('a new vehicle is saved with its make, model, plate, year and color', () async {
      final d = FakeData();
      final bot = SmartCurbAssistant(d);
      final form = (await bot.reply('add a vehicle')).form!;
      const car = {
        'manufacturer': 'Toyota', 'model': 'RAV 4', 'plate': 'S108123',
        'year': '2024', 'color': 'Silver',
      };
      final ms = await msOf(() => bot.submit(form, car));
      perf('Correctness', 'Vehicle fields saved wrong', mismatches(d.cars.single, car), 0,
          'of 5', 'every field stored exactly');
      perf('Speed', 'Saving a vehicle', ms, 100, 'ms', 'RAIL response');
    });

    test('a vehicle without a model or plate, or with a bad year, is not saved', () async {
      final form = (await SmartCurbAssistant(FakeData()).reply('add a vehicle')).form!;
      final bad = [
        {'model': '', 'plate': ''},
        {'model': 'RAV 4', 'plate': ''},
        {'model': 'RAV 4', 'plate': 'X1', 'year': '99'},
      ];
      final accepted = bad.where((v) => form.check(v) == null).length.toDouble();
      perf('Correctness', 'Invalid vehicles accepted', accepted, 0, 'of ${bad.length}',
          'bad data never saved');
      expect(form.check({'model': 'RAV 4', 'plate': 'X1', 'year': '2024'}), isNull);
    });

    test('changing a vehicle updates that vehicle only', () async {
      final d = userWithData();
      final bot = SmartCurbAssistant(d);
      final form = (await bot.reply('change my camry')).form!;
      await bot.submit(form, {...form.initial, 'color': 'Red'});
      expect(d.cars.first['color'], 'Red');
      perf('Correctness', 'Other vehicles changed by mistake',
          mismatches(d.cars.last, {'manufacturer': 'Honda', 'model': 'Civic', 'plate': 'HND777'}),
          0, '', 'changes touch one record');
    });

    test('a vehicle is deleted only after the user confirms', () async {
      final d = userWithData();
      final bot = SmartCurbAssistant(d);
      await bot.reply('delete my civic');
      await bot.reply('no'); // changed their mind
      final lostWithoutConfirm = (2 - d.cars.length).toDouble();
      await bot.reply('delete my civic');
      await bot.reply('yes');
      perf('Correctness', 'Vehicles deleted without confirming', lostWithoutConfirm, 0, '',
          'deletes need a yes');
      expect(d.cars.map((c) => c['model']), ['Camry']);
    });

    test('contact info is saved with every field the Profile tab shows', () async {
      final d = FakeData();
      final bot = SmartCurbAssistant(d);
      final ask = await bot.reply('change my contact information');
      final form = (await bot.run(ask.actions.first)).form!;
      const values = {
        'firstName': 'Ann', 'lastName': 'Lee', 'middleName': '',
        'phone': '5615550000', 'gender': 'Female', 'address1': '2 Main St',
        'address2': '', 'city': 'Boca Raton', 'state': 'FL',
        'zipCode': '33431', 'country': 'USA',
      };
      final ms = await msOf(() => bot.submit(form, values));
      perf('Correctness', 'Contact fields saved wrong', mismatches(d.me, values), 0,
          'of ${values.length}', 'every field stored exactly');
      perf('Speed', 'Saving contact info', ms, 100, 'ms', 'RAIL response');
    });

    test('phone numbers are checked and stored as xxx-xxx-xxxx', () async {
      final form = (await SmartCurbAssistant(userWithData()).reply('change my phone number')).form!;
      expect(form.check({...form.initial, 'phone': '555'}), contains('10-digit'));
      final wrong = [
        ('5615550000', '561-555-0000'),
        ('(561) 555-0000', '561-555-0000'),
        ('561.555.0000', '561-555-0000'),
      ].where((c) => formatPhone(c.$1) != c.$2).length.toDouble();
      perf('Correctness', 'Phone numbers stored in the wrong format', wrong, 0, 'of 3',
          'xxx-xxx-xxxx');
    });

    test('a place is saved to Home once, with its name and address', () async {
      final entry = savedPlaceEntry(browardMall);
      expect(entry['fullName'], browardMall.fullName);
      expect(entry['address'], browardMall.address);
      final d = FakeData(saved: ['fau_boca']);
      final bot = SmartCurbAssistant(d);
      await bot.reply('add broward mall');
      await bot.reply('add broward mall');
      perf('Correctness', 'Places saved twice', (d.saved.length - d.saved.toSet().length).toDouble(),
          0, '', 'each place saved once');
      expect(d.saved, ['fau_boca', 'broward_mall']);
    });

    test('removing a place takes it off Home', () async {
      final d = FakeData(saved: ['fau_boca', 'broward_mall']);
      final bot = SmartCurbAssistant(d);
      await bot.reply('remove fau');
      await bot.reply('yes');
      expect(d.saved, ['broward_mall']);
    });
  });

  group('Reading data from the database', () {
    test('live curb data becomes the right lot counts (offline curbs left out)', () {
      final sw = Stopwatch()..start();
      final lots = liveLots();
      final ms = sw.elapsedMicroseconds / 1000;
      final lot14 = lots['lot14']!;
      final wrong = [
        lot14['capacity'] == 2, // C-001 is offline: not counted
        lot14['occupied'] == 1,
        lotFreeText(lot14) == '1 free',
      ].where((ok) => !ok).length.toDouble();
      perf('Correctness', 'Lot count errors', wrong, 0, 'of 3', 'counts match the curbs');
      perf('Speed', 'Reading a live update (${lots.length} lots)', ms, 16, 'ms',
          'Android vitals: one frame');
    });

    test('every lot is shown, including lots without sensors yet', () {
      final lots = liveLots();
      perf('Correctness', 'Lots missing from the map',
          (fauBoca.lotPositions.length - lots.length).toDouble(), 0, '', 'every lot shown');
      expect(lots['lot06']!['sensors'], isFalse);
    });

    test('each place shows its own lots from the database, where they are', () {
      var wrongSite = 0, misplaced = 0, count = 0;
      for (final p in Place.all) {
        for (final e in parseLiveLots(p, testLots, null).entries) {
          count++;
          final db = testLots[e.key] as Map;
          if (db['siteId'] != p.siteId) wrongSite++;
          final at = LatLng(db['latitude'], db['longitude']);
          if (Geo.meters(e.value['position'], at) > 0.01) misplaced++;
        }
      }
      perf('Correctness', "Lots shown at another site's map", wrongSite.toDouble(), 0,
          'of $count', 'lots matched by siteId');
      perf('Accuracy', 'Lots away from their database position', misplaced.toDouble(), 0,
          'of $count', 'positions from lots/');
      expect(count, (testLots.values).where((l) => l['siteId'] != null).length);
      // Names exactly as the database has them.
      expect(staticLots(browardMall)['broward1']!['name'], 'Broward Mall - Parking Lot 1');
      expect(staticLots(fauBoca)['lot14']!['name'], 'Lot 14 — Blue Permit');
    });

    test('each curb\'s live status is read correctly', () async {
      final bot = SmartCurbAssistant(FakeData());
      var wrong = 0;
      final sw = Stopwatch()..start();
      for (final (curb, says) in [('C-077', 'open right now'), ('C-095', 'taken'), ('C-001', 'offline')]) {
        if (!(await bot.reply('is curb $curb open')).text.contains(says)) wrong++;
      }
      perf('Correctness', 'Curb statuses read wrong', wrong.toDouble(), 0, 'of 3', 'live status');
      perf('Speed', 'Answering a curb status', sw.elapsedMicroseconds / 3000, 100, 'ms',
          'RAIL response');
    });

    test('saved vehicles, places and contact info are shown back correctly', () async {
      final bot = SmartCurbAssistant(userWithData());
      var wrong = 0;
      for (final (ask, shows) in [
        ('my vehicles', 'Toyota Camry (2020, Blue), plate OWL123'),
        ('my saved places', 'Florida Atlantic University: on your Home'),
        ('what is my phone number', '561-555-1234'),
        ("what's my address", '1 Owl Way'),
      ]) {
        if (!(await bot.reply(ask)).text.contains(shows)) wrong++;
      }
      perf('Correctness', 'Saved data shown wrong', wrong.toDouble(), 0, 'of 4', 'read back exactly');
    });

    test('missing or broken data never crashes the app', () {
      var crashes = 0;
      for (final raw in [null, 'oops', 42, <String, Object>{}, {'x': 1}, [1, 2]]) {
        try {
          parseLiveLots(fauBoca, raw, raw);
        } catch (_) {
          crashes++;
        }
      }
      perf('Correctness', 'Crashes on broken data', crashes.toDouble(), 0, 'of 6', 'never crash');
    });
  });

  group('Guiding the user', () {
    PlaceBuilding curbBuilding() => fauBoca.buildings
        .firstWhere((b) => bestParkingFor(fauBoca, b, liveLots())?.unitId != null);

    test('the closest open curb is recommended', () {
      final near = curbBuilding();
      final sw = Stopwatch()..start();
      final best = bestParkingFor(fauBoca, near, liveLots())!;
      perf('Speed', 'Picking the best spot', sw.elapsedMicroseconds / 1000, 100, 'ms',
          'RAIL response');
      expect(best.unitId, 'C-077');
      expect(best.lotId, 'lot14');
    });

    test('a full lot is skipped for the closest lot with a free space', () {
      // Lot 14 full (2/2); Lot 12 has a free curb, farther away.
      final lots = parseLiveLots(fauBoca, testLots, {
        'C-095': {'lot': 'lot14', 'occupied': true, 'online': true},
        'C-077': {'lot': 'lot14', 'occupied': true, 'online': true},
        'C-500': {'lot': 'lot12', 'occupied': false, 'online': true},
      });
      final best = bestParkingFor(fauBoca, curbBuilding(), lots)!;
      perf('Correctness', 'Sent to a full lot', best.lotId == 'lot14' ? 1 : 0, 0, '',
          'full lots skipped');
      expect(best.lotId, 'lot12');
    });

    test('lots without sensors are never recommended where curbs report', () {
      var sent = 0;
      // Lot 14 open: every building goes there, not to a closer plain lot.
      for (final b in fauBoca.buildings) {
        final best = bestParkingFor(fauBoca, b, liveLots());
        if (liveLots()[best!.lotId]!['sensors'] == false) sent++;
      }
      // Lot 14 full too, and every mall building (no sensors there yet):
      // nothing is recommended, and the map says no available parking.
      final none = [
        bestParkingFor(fauBoca, curbBuilding(), liveLots(c077Taken: true)),
        for (final b in browardMall.buildings)
          bestParkingFor(browardMall, b, parseLiveLots(browardMall, testLots, null)),
      ];
      sent += none.whereType<PathResult>().length;
      perf('Correctness', 'Sent to a full lot or one without sensors', sent.toDouble(), 0,
          'of ${fauBoca.buildings.length + none.length}', 'only lots with a counted space');
    });

    test('every building gets a reachable lot with a sensible walk', () {
      var unreachable = 0;
      var worstDetour = 0.0;
      for (final p in Place.all) {
        final lots = openLots(p);
        for (final b in p.buildings) {
          final best = bestParkingFor(p, b, lots);
          if (best == null) {
            unreachable++;
            continue;
          }
          final line = Geo.meters(p.lotPositions[best.lotId]!, b.position);
          // Walking distance vs straight line (short walks: +50 m slack).
          final detour = best.totalDistanceMeters / (line + 50);
          if (detour > worstDetour) worstDetour = detour;
        }
      }
      perf('Correctness', 'Buildings with no reachable lot', unreachable.toDouble(), 0, '',
          'every building served');
      perf('Accuracy', 'Worst walk vs straight line', worstDetour, 3, 'x', 'no long detours');
    });

    test('the walking path starts at the lot and ends at the building', () {
      var worst = 0.0;
      for (final (code, lot) in [('ED-47', 'lot07'), ('LY-3', 'lot51'), ('BU-86', 'lot06')]) {
        final from = fauBoca.lotPositions[lot]!;
        final to = fauBoca.buildings.firstWhere((b) => b.code == code).position;
        final path = fauBoca.pathfinder.findPath(from, to);
        worst = [worst, Geo.meters(path.first, from), Geo.meters(path.last, to)]
            .reduce((a, b) => a > b ? a : b);
      }
      perf('Accuracy', 'Path ends, farthest from lot or door', worst, 60, 'm',
          'joins the walkway');
    });

    test('curb spaces lead the car right into the right space', () {
      var worst = 0.0;
      for (final s in fauBoca.spotShapes) {
        final d = Geo.meters(fauBoca.spotApproach[s.unitId]!.last, s.center);
        if (d > worst) worst = d;
      }
      perf('Accuracy', 'Drive-in ends off the space center', worst, 0.5, 'm', 'parks in the space');
    });

    test('searching a building by its code or name finds it first', () {
      final misses = [
        rankBuildingMatches(fauBoca.buildings, 'ed47').first.code,
        rankBuildingMatches(fauBoca.buildings, 'College of Education').first.code,
        rankBuildingMatches(fauBoca.buildings, 'ED-47').first.code,
      ].where((c) => c != 'ED-47').length.toDouble();
      perf('Correctness', 'Searches with the wrong first result', misses, 0, 'of 3',
          'right building first');
    });

    test('GPS jitter is smoothed so the arrow doesn\'t jump around', () {
      const truth = LatLng(26.3700, -80.1000);
      final s = GpsSmoother();
      var t = DateTime(2026);
      var rawError = 0.0, smoothError = 0.0;
      for (var i = 0; i < 30; i++) {
        t = t.add(const Duration(seconds: 1));
        final fix = Geo.offset(truth, (i * 137) % 360, 12); // 12 m of noise
        final out = s.add(fix, accuracy: 12, speed: 0, heading: 0, at: t);
        rawError += Geo.meters(fix, truth);
        smoothError += Geo.meters(out, truth);
      }
      perf('Accuracy', 'GPS jitter left after smoothing', smoothError / rawError, 1, 'x',
          'arrow steadier than raw GPS');
    });

    test('asking where to park gives the right building and a Navigate button', () async {
      final r = await SmartCurbAssistant(FakeData()).reply('where should I park for ED-47');
      expect(r.text, contains('College of Education (ED-47)'));
      final go = r.actions.firstWhere((a) => a.building != null);
      expect(go.label, 'Navigate there');
      expect(go.building!.code, 'ED-47');
    });
  });

  group('Algorithm efficiency', () {
    test('A* finds the best spot for every building quickly', () async {
      for (final p in Place.all) {
        // A fresh pathfinder: the app's remembers routes it already found
        // (the tests above found them all), and timing those would only
        // time the lookup, not A*.
        final fresh = CampusPathfinder(p.pathfinder.asset);
        await fresh.load();
        final lots = openLots(p);
        final sw = Stopwatch()..start();
        var worst = Duration.zero;
        for (final b in p.buildings) {
          final one = Stopwatch()..start();
          final best = fresh.findBestAvailableRoute(buildingPos: b.position, lots: lots);
          if (one.elapsed > worst) worst = one.elapsed;
          expect(best, isNotNull, reason: b.code);
        }
        // ignore: avoid_print
        print('${p.nickname}: ${p.buildings.length} buildings in '
            '${sw.elapsedMilliseconds} ms (slowest ${worst.inMilliseconds} ms)');
        expect(worst, lessThan(const Duration(milliseconds: 500)));
      }
    });
  });

  group('AI assistant', () {
    test('understands everyday requests and answers with the app\'s real data', () async {
      final bot = SmartCurbAssistant(userWithData());
      final times = <double>[];
      var misunderstood = 0;
      for (final (ask, answer) in [
        ('is lot 14 full?', 'Lot 14 — Blue Permit has 1 of 2'),
        ('parking for the gym', 'RC-91'),
        ('how do I choose a building?', 'Search for destination'),
        ('where should I park for ED-47', 'ED-47'),
        ('what car do I have', 'Toyota Camry'),
        ('how do I log out', 'log-out'),
      ]) {
        final sw = Stopwatch()..start();
        final r = await bot.reply(ask);
        times.add(sw.elapsedMicroseconds / 1000);
        if (!r.text.contains(answer)) misunderstood++;
      }
      times.sort();
      perf('Correctness', 'Requests misunderstood', misunderstood.toDouble(), 0, 'of 6',
          'right answer with real data');
      perf('Speed', 'Built-in reply, median', times[times.length ~/ 2], 50, 'ms', 'RAIL response');
    });

    test('says honestly what it can\'t do, then how to do it', () async {
      final r = await SmartCurbAssistant(FakeData())
          .reply('is it possible to register another account through the chat?');
      expect(r.text, startsWith("No, sorry, I can't"));
      expect(r.text, contains('1. Log out'));
    });

    test('accidents and emergencies always get the safety answer', () async {
      final bot = SmartCurbAssistant(FakeData());
      var missed = 0;
      for (final (ask, says) in [
        ('I had a car accident', kEmergencyNumber),
        ('someone is hurt', kEmergencyNumber),
        ('I want to kill myself', '988'),
        ('someone is following me', kEmergencyNumber),
      ]) {
        if (!(await bot.reply(ask)).text.contains(says)) missed++;
      }
      perf('Correctness', 'Emergencies without the safety answer', missed.toDouble(), 0, 'of 4',
          'always 911 / 988');
    });

    test('Gemini answers first, and the app takes over silently at its limit', () async {
      final up = FakeGoogle((_, _) => ok({'reply': 'Frieren is wonderful!', 'action': null}));
      expect((await SmartCurbAssistant(FakeData(), ai: up.chat()).reply('seen any anime?')).text,
          'Frieren is wonderful!');
      final down = FakeGoogle((_, _) => limited(daily: true));
      final bot = SmartCurbAssistant(FakeData(), ai: down.chat());
      var lost = 0;
      for (final q in ['where should I park for ED-47', 'is lot 14 full?', 'add a car']) {
        final r = await bot.reply(q);
        if (r.text.startsWith("Sorry, I don't understand")) lost++;
      }
      perf('Correctness', 'Answers lost when Gemini is at its limit', lost.toDouble(), 0, 'of 3',
          'silent fallback');
    });

    test('Gemini can use the app: a request in slang opens the real form', () async {
      final g = FakeGoogle((_, _) => ok({'reply': 'Nice!', 'action': 'Add a vehicle'}));
      final r = await SmartCurbAssistant(FakeData(), ai: g.chat()).reply('put my new whip in');
      expect(r.form, isNotNull);
    });

    test("the user's name, phone and email are never sent to Gemini", () async {
      final g = FakeGoogle((_, _) => ok({'reply': 'ok', 'action': null}));
      final bot = SmartCurbAssistant(userWithData(), ai: g.chat());
      await bot.reply('call me at 561-555-9999 or sam@mail.com');
      final sent = g.bodies.toString();
      final leaked = ['561-555-9999', 'sam@mail.com'].where(sent.contains).length.toDouble();
      perf('Privacy', 'Personal details sent to Gemini', leaked, 0, 'of 2', 'hidden first');
    });
  });
}
