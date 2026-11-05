// Online health check: the real services the app depends on answer.
// Needs internet. Skip with: flutter test --exclude-tags online
@Tags(['online'])
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:smart_curb/firebase_options.dart';
import 'package:smart_curb/gemini_chat.dart';
import 'package:smart_curb/main.dart';

import 'assistant_test.dart' show useTestLots;

void main() {
  useTestLots();
  TestWidgetsFlutterBinding.ensureInitialized();
  // Tests block the network by default; these checks need it (only these:
  // it's put back afterwards, for when all tests run together).
  HttpOverrides? blocked;
  setUpAll(() {
    blocked = HttpOverrides.current;
    HttpOverrides.global = null;
  });
  tearDownAll(() => HttpOverrides.global = blocked);

  test('Firebase Realtime Database answers', () async {
    final url = DefaultFirebaseOptions.android.databaseURL!;
    final res = await http
        .get(Uri.parse('$url/.json?shallow=true'))
        .timeout(const Duration(seconds: 15));
    // 200: readable; 401: reachable but needs sign-in (the app signs in).
    expect(res.statusCode, anyOf(200, 401),
        reason: 'Firebase answered ${res.statusCode}: ${res.body}');
    // ignore: avoid_print
    print('Firebase database: HTTP ${res.statusCode}');
  });

  test('every place gets its parking lots from the database', () async {
    final url = DefaultFirebaseOptions.android.databaseURL!;
    final res = await http
        .get(Uri.parse('$url/lots.json'))
        .timeout(const Duration(seconds: 15));
    expect(res.statusCode, 200, reason: 'lots/ answered ${res.statusCode}');
    final raw = jsonDecode(res.body);
    final counts = <String>[];
    for (final p in Place.all) {
      p.applyLots(raw);
      expect(p.lotPositions, isNotEmpty,
          reason: '${p.nickname}: no lots with siteId ${p.siteId}');
      for (final e in p.lotPositions.entries) {
        expect(p.contains(e.value), isTrue,
            reason: '${e.key} is outside ${p.nickname}');
      }
      counts.add('${p.nickname} ${p.lotPositions.length}');
    }
    // ignore: avoid_print
    print('Database lots: ${counts.join(', ')}');
  });

  test('OSRM road routing gives a real driving route', () async {
    final from = fauBoca.entrance;
    final to = fauBoca.lotPositions['lot14']!;
    final route = await RealRoadRouter.getRoadRoute(start: from, destination: to);
    expect(route.length, greaterThan(2), reason: 'only a straight line came back');
    expect(Geo.pathLength(route), greaterThan(Geo.meters(from, to) - 5));
    // ignore: avoid_print
    print('OSRM route: ${route.length} points, ${Geo.pathLength(route).round()} m');
  });

  test('Gemini answers with the app key (or the app falls back safely)',
      () async {
    final chat = GeminiChat();
    final answer = await chat.ask(
      system: 'Reply only as JSON {"reply": string, "action": null}.',
      history: const [],
      message: 'Say hello in three words.',
    );
    if (!chat.enabled) {
      markTestSkipped('No key in assets/config/secrets.json');
      return;
    }
    // Null means every model is at its limit or busy: the app then uses
    // its built-in assistant, which is fine, but worth knowing.
    // ignore: avoid_print
    print(answer == null
        ? 'Gemini: no model available right now (built-in assistant answers)'
        : 'Gemini (${answer.model}): ${answer.reply}');
    if (answer != null) expect(answer.reply, isNotEmpty);
  });

  test('the Gemini key file is valid JSON when present', () {
    final f = File('assets/config/secrets.json');
    if (!f.existsSync()) {
      markTestSkipped('No assets/config/secrets.json');
      return;
    }
    final json = jsonDecode(f.readAsStringSync());
    expect(json, isA<Map>());
    expect((json as Map)['GEMINI_API_KEY'], isA<String>());
  });
}
