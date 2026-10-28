// Google AI Studio (Gemini API) chat: a real language model for what the
// assistant's own rules don't understand.
//
// Free tier: each model has its own requests-per-minute and per-day limits.
// When one is at its limit (or busy), the next in [kAiModels] takes over;
// when none can answer (or there's no key or connection), [GeminiChat.ask]
// returns null and the caller answers by itself, so the chat never stops.

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;

/// The API key is never written in the code. It's read from
/// [kSecretsAsset], `{"GEMINI_API_KEY": "..."}` (git-ignored; copy
/// secrets.example.json), so a plain `flutter run` works. A key given with
/// `--dart-define=GEMINI_API_KEY=...` wins over the file. No key: the
/// assistant works without AI.
const String kGeminiApiKey = String.fromEnvironment('GEMINI_API_KEY');
const String kSecretsAsset = 'assets/config/secrets.json';

/// Tried in order. Gemma has the free tier's highest limits; Flash-Lite is
/// a fast backup with its own quota. Check AI Studio > Rate limits for the
/// numbers on your key.
const List<String> kAiModels = ['gemma-4-26b-a4b-it', 'gemini-3.5-flash-lite'];

/// One message of the conversation so far.
class AiTurn {
  final bool fromUser;
  final String text;
  const AiTurn(this.fromUser, this.text);
}

/// The model's answer: what to say, and optionally an app action to run
/// instead ("Add a vehicle"), in the assistant's own words.
class AiAnswer {
  final String reply;
  final String? action;
  final String model;
  const AiAnswer(this.reply, this.action, this.model);
}

class GeminiChat {
  /// With no [apiKey], it's found as described at [kGeminiApiKey].
  GeminiChat({
    String? apiKey,
    this.models = kAiModels,
    http.Client? client,
    this.timeout = const Duration(seconds: 12),
  }) : _http = client ?? http.Client() {
    _key = apiKey ?? '';
    _ready = apiKey != null ? Future.value(apiKey) : _findKey();
    _ready.then((k) => _key = k);
  }

  late String _key;
  late final Future<String> _ready;
  final List<String> models;
  final http.Client _http;
  final Duration timeout;

  /// Has a key (false until it's been read, a moment after start).
  bool get enabled => _key.isNotEmpty;

  static Future<String> _findKey() async {
    if (kGeminiApiKey.isNotEmpty) return kGeminiApiKey;
    try {
      final json = jsonDecode(await rootBundle.loadString(kSecretsAsset));
      final key = json is Map ? json['GEMINI_API_KEY'] : null;
      return key is String ? key.trim() : '';
    } catch (_) {
      return ''; // no secrets.json: chat without AI
    }
  }

  /// Models resting after a limit or an error, until when.
  final Map<String, DateTime> _restingUntil = {};

  static const _endpoint =
      'https://generativelanguage.googleapis.com/v1beta/models';

  /// Asks the first model that's available. Null when none could answer.
  Future<AiAnswer?> ask({
    required String system,
    required List<AiTurn> history,
    required String message,
  }) async {
    if ((await _ready).isEmpty) return null;
    for (final model in models) {
      final rest = _restingUntil[model];
      if (rest != null && DateTime.now().isBefore(rest)) continue;
      try {
        final answer = await _ask(model, system, history, message);
        if (answer != null) return answer;
      } on _Resting catch (r) {
        debugPrint('[ai] $model resting until ${r.until}: ${r.why}');
        _restingUntil[model] = r.until;
      } catch (e) {
        // Timeout, no connection, a reply that isn't usable...
        debugPrint('[ai] $model: $e');
        _restingUntil[model] = DateTime.now().add(const Duration(seconds: 20));
      }
    }
    return null;
  }

  Future<AiAnswer?> _ask(String model, String system, List<AiTurn> history,
      String message) async {
    // The conversation, with turns from the same side merged (the API
    // expects user and model to take turns).
    final contents = <Map<String, Object>>[];
    void add(bool fromUser, String text) {
      final role = fromUser ? 'user' : 'model';
      if (contents.isNotEmpty && contents.last['role'] == role) {
        final parts = contents.last['parts'] as List<Map<String, String>>;
        parts.add({'text': text});
      } else {
        contents.add({
          'role': role,
          'parts': <Map<String, String>>[{'text': text}],
        });
      }
    }

    for (final t in history) {
      add(t.fromUser, t.text);
    }
    add(true, message);
    if (contents.first['role'] != 'user') contents.removeAt(0);

    final res = await _http
        .post(
          Uri.parse('$_endpoint/$model:generateContent'),
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': _key,
          },
          body: jsonEncode({
            'systemInstruction': {
              'parts': [
                {'text': system},
              ],
            },
            'contents': contents,
            'generationConfig': {
              'temperature': 0.6,
              'maxOutputTokens': 500,
              'responseMimeType': 'application/json',
              // A chat answer, not a puzzle: no long hidden reasoning, so
              // replies come back in a second or two.
              'thinkingConfig': {'thinkingLevel': 'minimal'},
            },
          }),
        )
        .timeout(timeout);

    if (res.statusCode == 200) return _read(model, res.body);
    throw _restFor(res.statusCode, res.body);
  }

  /// The answer in a 200 response (the model's own reasoning parts, if any,
  /// skipped). Null if it gave nothing usable (e.g. blocked by safety).
  static AiAnswer? _read(String model, String body) {
    final json = jsonDecode(body) as Map<String, dynamic>;
    final candidates = json['candidates'] as List?;
    if (candidates == null || candidates.isEmpty) return null;
    final parts = ((candidates.first as Map)['content'] as Map?)?['parts'] as List?;
    if (parts == null) return null;
    final text = [
      for (final p in parts)
        if (p is Map && p['thought'] != true && p['text'] is String)
          p['text'] as String,
    ].join().trim();
    if (text.isEmpty) return null;
    return parseAnswer(model, text);
  }

  /// `{"reply": ..., "action": ...}`, even wrapped in ``` fences or with
  /// words around it; plain text is taken as the reply.
  @visibleForTesting
  static AiAnswer? parseAnswer(String model, String text) {
    Map<String, dynamic>? obj;
    final start = text.indexOf('{');
    final end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        final decoded = jsonDecode(text.substring(start, end + 1));
        if (decoded is Map<String, dynamic>) obj = decoded;
      } on FormatException {
        obj = null;
      }
    }
    if (obj == null) {
      final plain = text.replaceAll(RegExp(r'```[a-z]*'), '').trim();
      return plain.isEmpty ? null : AiAnswer(_tidy(plain), null, model);
    }
    final reply = obj['reply'];
    final action = obj['action'];
    final replyText = reply is String ? _tidy(reply) : '';
    final actionText =
        action is String && action.trim().isNotEmpty ? action.trim() : null;
    if (replyText.isEmpty && actionText == null) return null;
    return AiAnswer(replyText, actionText, model);
  }

  /// Plain chat text: no markdown bold/headers, and not too long.
  static String _tidy(String s) {
    var t = s
        .replaceAll(RegExp(r'\*\*|__|^#+\s*', multiLine: true), '')
        .replaceAll(RegExp(r'^\s*[-*]\s+', multiLine: true), '• ')
        .trim();
    if (t.length > 1200) t = '${t.substring(0, 1197).trimRight()}...';
    return t;
  }

  /// When the free tier's daily quotas reset after [nowUtc]: the next
  /// midnight in US Pacific time (07:00 UTC during daylight saving time,
  /// 08:00 UTC otherwise).
  @visibleForTesting
  static DateTime nextQuotaReset(DateTime nowUtc) {
    int offset(DateTime utc) => _pacificDaylightTime(utc) ? 7 : 8;
    // Today's date in Pacific time, then the midnight that starts tomorrow.
    final pacific = nowUtc.subtract(Duration(hours: offset(nowUtc)));
    final midnight = DateTime.utc(pacific.year, pacific.month, pacific.day + 1);
    // Daylight time changes at 2 AM, so midnight has that day's offset
    // (checked a few hours in).
    return midnight.add(Duration(hours: offset(midnight.add(const Duration(hours: 8)))));
  }

  /// US daylight saving time: from 2 AM on the second Sunday of March to
  /// 2 AM on the first Sunday of November.
  static bool _pacificDaylightTime(DateTime utc) {
    DateTime sunday(int month, int nth) {
      var d = DateTime.utc(utc.year, month);
      while (d.weekday != DateTime.sunday) {
        d = d.add(const Duration(days: 1));
      }
      return d.add(Duration(days: 7 * (nth - 1)));
    }

    final start = sunday(3, 2).add(const Duration(hours: 10)); // 2 AM PST
    final end = sunday(11, 1).add(const Duration(hours: 9)); // 2 AM PDT
    return !utc.isBefore(start) && utc.isBefore(end);
  }

  /// How long a model rests after an error [status].
  static _Resting _restFor(int status, String body) {
    final now = DateTime.now();
    if (status == 429) {
      // Out of quota: until tomorrow for the daily limit (it resets at
      // midnight Pacific time), or the wait Google suggests for the
      // per-minute one.
      if (body.contains('PerDay')) {
        return _Resting(nextQuotaReset(now.toUtc()).toLocal(), 'daily limit');
      }
      final wait = RegExp(r'"retryDelay":\s*"(\d+)').firstMatch(body);
      final seconds = int.tryParse(wait?.group(1) ?? '') ?? 60;
      return _Resting(now.add(Duration(seconds: seconds + 1)), 'per-minute limit');
    }
    if (status == 401 || status == 403) {
      return _Resting(now.add(const Duration(hours: 1)), 'key not accepted');
    }
    if (status == 400 || status == 404) {
      return _Resting(now.add(const Duration(hours: 1)), 'model unavailable');
    }
    return _Resting(now.add(const Duration(seconds: 30)), 'busy ($status)');
  }
}

class _Resting implements Exception {
  final DateTime until;
  final String why;
  _Resting(this.until, this.why);
}
