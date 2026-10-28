import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:smart_curb/assistant.dart';
import 'package:smart_curb/gemini_chat.dart';
import 'package:smart_curb/main.dart';

import 'assistant_test.dart' show FakeData;

/// A Gemini response whose answer is [json] (after a hidden reasoning part,
/// as Gemma sends).
http.Response ok(Map<String, Object?> json) => http.Response(
      jsonEncode({
        'candidates': [
          {
            'content': {
              'role': 'model',
              'parts': [
                {'text': 'thinking it over...', 'thought': true},
                {'text': jsonEncode(json)},
              ],
            },
          },
        ],
      }),
      200,
    );

http.Response limited({bool daily = false}) => http.Response(
      jsonEncode({
        'error': {
          'code': 429,
          'status': 'RESOURCE_EXHAUSTED',
          'details': [
            {
              '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
              'violations': [
                {
                  'quotaId': daily
                      ? 'GenerateRequestsPerDayPerProjectPerModel-FreeTier'
                      : 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',
                },
              ],
            },
            {
              '@type': 'type.googleapis.com/google.rpc.RetryInfo',
              'retryDelay': '17s',
            },
          ],
        },
      }),
      429,
    );

/// A fake Google: answers with [respond], and records what was asked.
class FakeGoogle {
  FakeGoogle(this.respond);
  http.Response Function(String model, Map<String, dynamic> body) respond;
  final List<String> models = [];
  final List<Map<String, dynamic>> bodies = [];

  late final client = MockClient((req) async {
    final model = RegExp(r'models/([^:]+):').firstMatch(req.url.path)!.group(1)!;
    final body = jsonDecode(req.body) as Map<String, dynamic>;
    models.add(model);
    bodies.add(body);
    expect(req.headers['x-goog-api-key'], 'test-key');
    return respond(model, body);
  });

  GeminiChat chat() => GeminiChat(apiKey: 'test-key', client: client);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    for (final p in Place.all) {
      await p.pathfinder.load();
    }
  });

  group('GeminiChat', () {
    test('asks the first model, skipping its hidden reasoning', () async {
      final g = FakeGoogle((_, _) => ok({'reply': 'Hello there!', 'action': null}));
      final a = await g.chat().ask(system: 'sys', history: const [], message: 'hi');
      expect(a!.reply, 'Hello there!');
      expect(a.action, isNull);
      expect(g.models, [kAiModels.first]);
      final body = g.bodies.single;
      expect(body['systemInstruction'], isNotNull);
      expect(body['generationConfig']['responseMimeType'], 'application/json');
      expect(body['generationConfig']['thinkingConfig'], {'thinkingLevel': 'minimal'});
    });

    test('a model at its per-minute limit hands over to the next, then rests',
        () async {
      final g = FakeGoogle((model, _) => model == kAiModels.first
          ? limited()
          : ok({'reply': 'From the backup', 'action': null}));
      final chat = g.chat();
      final a = await chat.ask(system: 's', history: const [], message: 'q');
      expect(a!.reply, 'From the backup');
      expect(g.models, kAiModels);
      // Resting: the next question goes straight to the backup.
      await chat.ask(system: 's', history: const [], message: 'q2');
      expect(g.models, [...kAiModels, kAiModels[1]]);
    });

    test('all models out of quota, offline or no key: null', () async {
      final g = FakeGoogle((_, _) => limited(daily: true));
      final chat = g.chat();
      expect(await chat.ask(system: 's', history: const [], message: 'q'), isNull);
      // Out for the day: not even asked again.
      expect(await chat.ask(system: 's', history: const [], message: 'q'), isNull);
      expect(g.models, kAiModels);

      final down = FakeGoogle((_, _) => http.Response('oops', 503));
      expect(await down.chat().ask(system: 's', history: const [], message: 'q'),
          isNull);
      expect(GeminiChat(apiKey: '').enabled, isFalse);
      expect(await GeminiChat(apiKey: '').ask(system: 's', history: const [], message: 'q'),
          isNull);
    });

    test('daily quotas come back at midnight Pacific time, daylight saving too',
        () {
      DateTime reset(String utc) => GeminiChat.nextQuotaReset(DateTime.parse(utc));
      // Summer (PDT, UTC-7): midnight is 07:00 UTC.
      expect(reset('2026-10-28T18:00:00Z'), DateTime.parse('2026-10-29T07:00:00Z'));
      expect(reset('2026-07-04T06:59:00Z'), DateTime.parse('2026-07-04T07:00:00Z'));
      // Winter (PST, UTC-8): 08:00 UTC.
      expect(reset('2026-01-15T20:00:00Z'), DateTime.parse('2026-01-16T08:00:00Z'));
      // The nights the clocks change.
      expect(reset('2026-03-07T20:00:00Z'), DateTime.parse('2026-03-08T08:00:00Z'));
      expect(reset('2026-03-08T20:00:00Z'), DateTime.parse('2026-03-09T07:00:00Z'));
      expect(reset('2026-10-31T20:00:00Z'), DateTime.parse('2026-11-01T07:00:00Z'));
      expect(reset('2026-11-01T20:00:00Z'), DateTime.parse('2026-11-02T08:00:00Z'));
    });

    test('a resting model is tried again once its rest is over', () async {
      var calls = 0;
      final g = FakeGoogle((model, _) {
        calls++;
        return model == kAiModels.first && calls == 1
            ? http.Response(jsonEncode({
                'error': {
                  'code': 429,
                  'details': [
                    {'@type': 'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': '0s'},
                  ],
                },
              }), 429)
            : ok({'reply': 'from $model', 'action': null});
      });
      final chat = g.chat();
      expect((await chat.ask(system: 's', history: const [], message: 'a'))!.reply,
          'from ${kAiModels[1]}');
      await Future<void>.delayed(const Duration(milliseconds: 1100)); // rest is over
      expect((await chat.ask(system: 's', history: const [], message: 'b'))!.reply,
          'from ${kAiModels.first}');
    });

    test('reads answers in fences, with words around, or as plain text', () {
      expect(GeminiChat.parseAnswer('m', '```json\n{"reply":"Hi","action":null}\n```')!.reply, 'Hi');
      expect(GeminiChat.parseAnswer('m', 'Sure: {"reply":"","action":"Add a vehicle"}')!.action,
          'Add a vehicle');
      expect(GeminiChat.parseAnswer('m', 'Just **plain** text')!.reply, 'Just plain text');
      expect(GeminiChat.parseAnswer('m', '{"reply":"","action":null}'), isNull);
    });

    test('takes turns: user, model, user', () async {
      final g = FakeGoogle((_, _) => ok({'reply': 'ok', 'action': null}));
      await g.chat().ask(
        system: 's',
        history: const [AiTurn(true, 'a'), AiTurn(false, 'b'), AiTurn(true, 'c')],
        message: 'd',
      );
      final roles = [for (final c in g.bodies.single['contents'] as List) c['role']];
      expect(roles, ['user', 'model', 'user']); // 'c' and 'd' merged
    });
  });

  group('the model answers first; the rules are the backup', () {
    test('every message goes to the model, except safety and a pending yes/no',
        () async {
      final g = FakeGoogle((_, _) => ok({'reply': 'AI here!', 'action': null}));
      final bot = SmartCurbAssistant(
        FakeData(cars: [{'manufacturer': 'Honda', 'model': 'Civic'}]),
        ai: g.chat(),
      );
      for (final q in ['how are you?', 'what do the colors mean', 'tell me a joke']) {
        expect((await bot.reply(q)).text, 'AI here!', reason: q);
      }
      expect(g.models, hasLength(3));
      // Safety: the app's own words, without asking the model.
      expect((await bot.reply('I had a car accident')).text, contains('are you okay'));
      expect((await bot.reply('I want to kill myself')).text, contains('988'));
      expect(g.models, hasLength(3));
      // A yes/no the app asked: "yes" answers it, not the model.
      g.respond = (_, _) => ok({'reply': '', 'action': 'Delete my Civic'});
      final ask = await bot.reply('i sold my civic');
      expect(ask.text, contains('Delete your Honda Civic'));
      g.respond = (_, _) => ok({'reply': 'AI here!', 'action': null});
      expect((await bot.reply('yes')).text, contains('Done! I deleted'));
    });

    test('app requests run through the app, with the model\'s lead-in', () async {
      final g = FakeGoogle((_, _) => ok({
            'reply': 'Oh no, rough day! Let\'s get you parked.',
            'action': 'Where should I park for ED-47?',
          }));
      final bot = SmartCurbAssistant(FakeData(), ai: g.chat());
      final r = await bot.reply('ugh rough day, class at the education building, where do i park');
      expect(r.text, startsWith("Oh no, rough day! Let's get you parked. "));
      expect(r.text, contains('College of Education (ED-47)'));
      expect(r.actions.first.label, 'Navigate there');

      // A form keeps working, without the app's own "Sure!" said twice.
      g.respond = (_, _) => ok({'reply': 'Congrats on the new ride!', 'action': 'Add a vehicle'});
      final add = await bot.reply('just got a new whip');
      expect(add.form, isNotNull);
      expect(add.text, startsWith("Congrats on the new ride! Fill in your car's details"));
    });

    test('"can you register me?" still gets an honest no, then the steps',
        () async {
      final g = FakeGoogle((_, _) => ok({
            'reply': 'Sure!',
            'action': 'How do I register another account?',
          }));
      final bot = SmartCurbAssistant(FakeData(), ai: g.chat());
      final r = await bot.reply('is it possible to register another account through the chat?');
      expect(r.text, startsWith("No, sorry, I can't create or register an account"));
      expect(r.text, contains('1. Log out'));
      // Asking how (not asking the chat to do it): just the steps.
      final how = await bot.reply('how do I register another account');
      expect(how.text, isNot(contains('No, sorry')));
    });

    test("a request the app doesn't understand: the model's own words", () async {
      final g = FakeGoogle((_, _) =>
          ok({'reply': 'Here is my own answer.', 'action': 'Do a backflip'}));
      final bot = SmartCurbAssistant(FakeData(), ai: g.chat());
      expect((await bot.reply('do a backflip')).text, 'Here is my own answer.');
    });

    test('an echoed greeting is replaced by the app\'s own hello', () async {
      final g = FakeGoogle((_, _) => ok({'reply': 'good morning', 'action': null}));
      final bot = SmartCurbAssistant(FakeData(me: {'firstName': 'Sam'}), ai: g.chat());
      expect((await bot.reply('good morning')).text, startsWith('Good morning, Sam!'));
    });

    test('model at its limit or offline: the rules answer, silently', () async {
      final g = FakeGoogle((_, _) => limited(daily: true));
      final bot = SmartCurbAssistant(FakeData(), ai: g.chat());
      expect((await bot.reply('asdf qwerty')).text,
          startsWith("Sorry, I don't understand that"));
      expect((await bot.reply('where should I park for ED-47')).text, contains('ED-47'));
      expect((await bot.reply('how are you?')).text, contains('thanks for asking'));
      expect((await bot.reply('add a car')).form, isNotNull);
      expect((await bot.reply('are you powered by google gemini?')).text,
          contains("Google's Gemini"));
      final off = SmartCurbAssistant(FakeData());
      expect((await off.reply('are you powered by google gemini?')).text,
          contains("app's own knowledge"));
    });

    test('it knows the app, the time, and what it may hand over', () async {
      final g = FakeGoogle((_, _) => ok({'reply': 'ok', 'action': null}));
      await SmartCurbAssistant(FakeData(), ai: g.chat()).reply('hello there friend');
      final system = g.bodies.single['systemInstruction']['parts'][0]['text'] as String;
      expect(system, contains('Smart Curb AI Agent'));
      expect(system, contains('Florida Atlantic University'));
      expect(system, contains('Where should I park for <building name or code>?'));
      expect(system, contains('Delete my <make or model>'));
      expect(system, contains('${DateTime.now().year}'));
    });

    test("personal details aren't sent to the model", () async {
      final g = FakeGoogle((_, body) {
        final text = ((body['contents'] as List).last['parts'] as List).last['text'] as String;
        if (text == 'good morning') return ok({'reply': '', 'action': 'good morning'});
        if (text.contains('phone')) return ok({'reply': '', 'action': "What's my phone number?"});
        return ok({'reply': 'ok', 'action': null});
      });
      final bot = SmartCurbAssistant(
        FakeData(me: {'firstName': 'Samantha', 'lastName': 'Owl', 'phone': '561-555-1234'}),
        ai: g.chat(),
      );
      expect((await bot.reply('good morning')).text, contains('Samantha')); // the app greets by name
      expect((await bot.reply('what is my phone number')).text, contains('561-555-1234'));
      await bot.reply('blorp, write me to sam@mail.com or 561 555 9999');
      final sent = jsonEncode(g.bodies);
      expect(sent, isNot(contains('Samantha')));
      expect(sent, isNot(contains('561-555-1234')));
      expect(sent, isNot(contains('561 555 9999')));
      expect(sent, isNot(contains('sam@mail.com')));
      expect(sent, contains('blorp'));
    });
  });
}
