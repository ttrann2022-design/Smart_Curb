// Smart Curb AI Agent: the in-app assistant (the chat bubble on the Home,
// Vehicle and Profile tabs).
//
// It runs entirely in the app. It understands everyday wording (and small
// typos), answers from the app's own live data (lot counts from the curbs,
// the user's cars, places and profile), and offers tap-to-ask suggestions.
// Anything it can't place gets "Sorry, I don't understand that" and the
// menu again. [AssistantData] is the only part that talks to Firebase, so
// the brain ([SmartCurbAssistant]) can be tested without it, and a language
// model could later be put behind it on a server without the app holding
// an API key.

import 'dart:async';
import 'dart:math' as math;

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';

import 'gemini_chat.dart';
import 'main.dart';

// ==========================================
// REPLIES
// ==========================================

/// A suggestion under a reply. Tapping it asks [ask] (as if typed), takes
/// the next step of a conversation ([run]: "Yes, delete it", a car to pick),
/// opens [place]'s map (with [building] picked, if any), or goes to app tab
/// [tab]. Opening a place's map also adds it to the user's Home if it isn't
/// there.
class ChatAction {
  final String label;
  final String? ask;
  final Place? place;
  final PlaceBuilding? building;
  final int? tab;

  /// Does the step and gives the assistant's answer. The label is shown as
  /// the user's message.
  final Future<ChatReply> Function()? run;

  const ChatAction.ask(this.label, [String? question])
      : ask = question ?? label,
        place = null,
        building = null,
        tab = null,
        run = null;

  const ChatAction.navigate(this.label, Place this.place, PlaceBuilding this.building)
      : ask = null,
        tab = null,
        run = null;

  const ChatAction.openPlace(this.label, Place this.place)
      : ask = null,
        building = null,
        tab = null,
        run = null;

  const ChatAction.tab(this.label, int this.tab)
      : ask = null,
        place = null,
        building = null,
        run = null;

  ChatAction.run(this.label, Future<ChatReply> Function() this.run)
      : ask = null,
        place = null,
        building = null,
        tab = null;
}

class ChatReply {
  final String text;
  final List<ChatAction> actions;

  /// A form to fill in, under the reply (adding a car, contact info...).
  final ChatForm? form;

  /// Done as soon as the reply shows ("open the FAU map" opens it).
  final ChatAction? followUp;

  const ChatReply(this.text, [this.actions = const []])
      : form = null,
        followUp = null,
        clearsChat = false;

  const ChatReply.form(this.text, ChatForm this.form, [this.actions = const []])
      : followUp = null,
        clearsChat = false;

  const ChatReply.opening(this.text, ChatAction this.followUp,
      [this.actions = const []])
      : form = null,
        clearsChat = false;

  /// "Start over": the conversation so far is cleared, then this is said.
  const ChatReply.fresh(this.text, [this.actions = const []])
      : form = null,
        followUp = null,
        clearsChat = true;

  final bool clearsChat;
}

/// A field of a [ChatForm].
class ChatFormField {
  const ChatFormField(
    this.key,
    this.label, {
    this.hint = '',
    this.icon = Icons.edit_outlined,
    this.required = false,
    this.keyboard = TextInputType.text,
    this.phone = false,
    this.options,
  });

  /// Where the value is saved (the same keys the app's own forms use).
  final String key;
  final String label;
  final String hint;
  final IconData icon;
  final bool required;
  final TextInputType keyboard;

  /// Digits only, shown as xxx-xxx-xxxx while typing.
  final bool phone;

  /// Picked from these instead of typed.
  final List<String>? options;
}

/// A form shown in the chat, filled in and sent with Enter (or its button).
class ChatForm {
  const ChatForm({
    required this.fields,
    required this.submitLabel,
    required this.onSubmit,
    this.initial = const {},
    this.validate,
    this.summary,
    this.focus,
  });

  final List<ChatFormField> fields;

  /// What the fields start with (the car or contact info being changed).
  final Map<String, String> initial;
  final String submitLabel;

  /// Beyond the required fields: the first problem, or null.
  final String? Function(Map<String, String> values)? validate;

  /// Saves the values; the assistant's answer.
  final Future<ChatReply> Function(Map<String, String> values) onSubmit;

  /// The user's message once it's sent (default: the values, in order).
  final String Function(Map<String, String> values)? summary;

  /// The field to start typing in ("change my phone number": the phone).
  final String? focus;

  /// The first problem with [values] (shown under the form), or null.
  String? check(Map<String, String> values) {
    for (final f in fields) {
      if (f.required && (values[f.key] ?? '').trim().isEmpty) {
        final name = f.label.toLowerCase();
        return f.options != null
            ? 'Please choose your $name.'
            : 'Please fill in your $name.';
      }
    }
    return validate?.call(values);
  }

  String describe(Map<String, String> values) =>
      summary?.call(values) ??
      [
        for (final f in fields)
          if ((values[f.key] ?? '').trim().isNotEmpty) values[f.key]!.trim(),
      ].join(' · ');
}

/// App tabs a reply can send the user to.
const int kHomeTab = 0;
const int kVehicleTab = 1;
const int kProfileTab = 2;

/// Who the assistant points people to when something goes wrong on the
/// road. Please double-check these before release.
const String kEmergencyNumber = '911';
const String kCampusPolice = 'FAU Police';
const String kCampusPolicePhone = '561-297-3500';

// ==========================================
// DATA
// ==========================================

/// Everything the assistant reads. [FirebaseAssistantData] in the app;
/// tests pass their own.
abstract class AssistantData {
  /// [place]'s lots, as the map sees them (see [parseLiveLots]).
  Future<Map<String, Map<String, dynamic>>> lots(Place place);

  /// The signed-in user's cars, profile and saved place ids.
  Future<List<Map<String, dynamic>>> vehicles();
  Future<Map<String, dynamic>?> profile();
  Future<List<String>> savedPlaceIds();

  /// Adds [place] to the user's Home if it isn't there yet. True if it was
  /// just added.
  Future<bool> savePlace(Place place);

  /// Takes [place] off the user's Home. True if it was there.
  Future<bool> removePlace(Place place);

  /// Cars, with the fields the Vehicle tab uses. [vehicles] gives each one
  /// its database key as 'id'.
  Future<void> addVehicle(Map<String, String> car);
  Future<void> updateVehicle(String id, Map<String, String> car);
  Future<void> deleteVehicle(String id);

  /// Contact info, with the fields the Profile tab uses.
  Future<void> saveProfile(Map<String, String> profile);

  String? get email;
}

class FirebaseAssistantData implements AssistantData {
  static const Duration _timeout = Duration(seconds: 6);

  /// Live lot counts change; a few seconds old is fine within one chat.
  static const Duration _lotsFresh = Duration(seconds: 15);
  final Map<String, ({DateTime at, Map<String, Map<String, dynamic>> lots})>
      _lotCache = {};

  FirebaseDatabase get _db => FirebaseDatabase.instance;
  String? get _uid => FirebaseAuth.instance.currentUser?.uid;

  @override
  String? get email => FirebaseAuth.instance.currentUser?.email;

  Future<Object?> _read(String path) async =>
      (await _db.ref(path).get().timeout(_timeout)).value;

  @override
  Future<Map<String, Map<String, dynamic>>> lots(Place place) async {
    final cached = _lotCache[place.id];
    if (cached != null && DateTime.now().difference(cached.at) < _lotsFresh) {
      return cached.lots;
    }
    final List<Object?> results;
    try {
      results = await Future.wait(
          [_read('lots'), if (place.liveParking) _read('units')]);
    } catch (_) {
      // No curbs to count here: the last known lots will do.
      if (!place.liveParking) return staticLots(place);
      rethrow;
    }
    place.applyLots(results[0]);
    final lots =
        parseLiveLots(place, results[0], place.liveParking ? results[1] : null);
    _lotCache[place.id] = (at: DateTime.now(), lots: lots);
    return lots;
  }

  @override
  Future<List<Map<String, dynamic>>> vehicles() async {
    final uid = _uid;
    if (uid == null) return const [];
    final raw = await _read('drivers/$uid/vehicles');
    if (raw is! Map) return const [];
    return [
      for (final e in raw.entries)
        if (e.value is Map)
          {...Map<String, dynamic>.from(e.value as Map), 'id': e.key.toString()},
    ];
  }

  @override
  Future<Map<String, dynamic>?> profile() async {
    final uid = _uid;
    if (uid == null) return null;
    final raw = await _read('drivers/$uid/profile');
    return raw is Map ? Map<String, dynamic>.from(raw) : null;
  }

  @override
  Future<List<String>> savedPlaceIds() async {
    final uid = _uid;
    if (uid == null) return const [];
    final raw = await _read('drivers/$uid/locations');
    return raw is Map ? [for (final k in raw.keys) k.toString()] : const [];
  }

  @override
  Future<bool> savePlace(Place place) async {
    final uid = _uid;
    if (uid == null) return false;
    final ref = _db.ref('drivers/$uid/locations/${place.id}');
    if ((await ref.get().timeout(_timeout)).exists) return false;
    await ref.set(savedPlaceEntry(place)).timeout(_timeout);
    return true;
  }

  /// Writes need someone signed in.
  String get _me => _uid ?? (throw StateError('Not signed in'));

  @override
  Future<bool> removePlace(Place place) async {
    final ref = _db.ref('drivers/$_me/locations/${place.id}');
    if (!(await ref.get().timeout(_timeout)).exists) return false;
    await ref.remove().timeout(_timeout);
    return true;
  }

  // Saved the same way as the Vehicle and Profile tabs' own forms.

  @override
  Future<void> addVehicle(Map<String, String> car) => _db
      .ref('drivers/$_me/vehicles')
      .push()
      .set({...car, 'createdAt': ServerValue.timestamp}).timeout(_timeout);

  @override
  Future<void> updateVehicle(String id, Map<String, String> car) => _db
      .ref('drivers/$_me/vehicles/$id')
      .update({...car, 'updatedAt': ServerValue.timestamp}).timeout(_timeout);

  @override
  Future<void> deleteVehicle(String id) =>
      _db.ref('drivers/$_me/vehicles/$id').remove().timeout(_timeout);

  @override
  Future<void> saveProfile(Map<String, String> profile) => _db
      .ref('drivers/$_me/profile')
      .update({
        ...profile,
        'phone': formatPhone(profile['phone'] ?? ''), // xxx-xxx-xxxx
        'updatedAt': ServerValue.timestamp,
      }).timeout(_timeout);
}

// ==========================================
// THE BRAIN
// ==========================================

/// Understands a message and answers it. Keeps a little context: after
/// "where should I park?" it knows a bare building name is the answer.
class SmartCurbAssistant {
  SmartCurbAssistant(this.data, {List<Place>? places, this.ai})
      : places = places ?? Place.all {
    _index = _BuildingIndex(this.places);
  }

  final AssistantData data;
  final List<Place> places;
  late final _BuildingIndex _index;

  /// The language model for what the rules below don't understand (null
  /// or without a key: the rules answer everything, as before).
  final GeminiChat? ai;

  /// Asked which building; the next message may just be its name.
  bool _awaitingBuilding = false;


  /// The things it can do, as tap-to-ask suggestions.
  static const List<ChatAction> menu = [
    ChatAction.ask('Where should I park?'),
    ChatAction.ask('Open spots right now'),
    ChatAction.ask('How do I choose a building?'),
    ChatAction.ask('My vehicles'),
    ChatAction.ask('My saved places'),
    ChatAction.ask('My profile'),
    ChatAction.ask('How do I use the app?'),
    ChatAction.ask('How does Smart Curb work?'),
    ChatAction.ask('What do the colors mean?'),
    ChatAction.ask('Contact support'),
  ];

  /// A short "what next" after small talk.
  static const List<ChatAction> _moreHelp = [
    ChatAction.ask('Where should I park?'),
    ChatAction.ask('Open spots right now'),
    ChatAction.ask('What else can you do?'),
  ];

  /// The hello when the chat opens, for the time of day.
  ChatReply greeting() {
    _introduced = true;
    final h = DateTime.now().hour;
    final hello = h >= 5 && h < 12
        ? 'Good morning'
        : (h >= 12 && h < 17 ? 'Good afternoon' : (h >= 17 ? 'Good evening' : 'Hi'));
    return ChatReply(
      "$hello! I'm Smart Curb AI Agent, your parking buddy. What can I help "
      'you with today?',
      menu,
    );
  }

  /// Steps offered by the last reply ("Yes, delete it", a car to pick):
  /// typing one ("yes", "the camry") works like tapping it.
  List<ChatAction> _steps = const [];

  Future<ChatReply> reply(String message) async {
    final m = _Message(message);
    if (m.tokens.isEmpty) return greeting();
    final step = _typedStep(m);
    if (step != null) return run(step);
    final wasAwaiting = _awaitingBuilding;
    _awaitingBuilding = false;

    // Who answers:
    // 1. Safety (accidents, emergencies, crisis): always the app's own
    //    careful words, offline too.
    // 2. The language model, for everything else. It talks freely, and
    //    hands what the app does (live spots, forms, the user's cars,
    //    places and profile) to the rules below as a plain request.
    // 3. The rules on their own, silently, when the model can't answer
    //    (at its limit, offline, or no key).
    final answer = _safetyAnswer(m) ??
        await _askAi(message) ??
        await _answerWithMood(m, wasAwaiting);
    _remember(message, answer.text);
    return answer;
  }

  /// The safety answer for [m], if it's about an emergency.
  ChatReply? _safetyAnswer(_Message m) {
    for (final f in _safety) {
      if (f.when(m)) {
        _steps = const [];
        return f.reply;
      }
    }
    return null;
  }

  /// The rules' answer to [m], said the way it was asked.
  Future<ChatReply> _answerWithMood(_Message m, bool wasAwaiting) {
    return _guard(() async {
      final answer = await _answer(m, wasAwaiting);
      // "Hi, where do I park for ED-47?": answer it, with a hello.
      var text = answer.text;
      // Parking answers, said the way the question was asked: "I'm late
      // for ED-47" gets hurried along, "ugh" gets some sympathy.
      if (answer.actions.any((a) => a.building != null)) {
        if (m.has(_hurryWords)) {
          text = "Let's get you there fast! $text";
        } else if (m.has(_frustratedWords) ||
            m.anyPhrase(_frustratedPhrases)) {
          text = "Sorry it's been stressful, let's fix that. $text";
        }
      }
      // "Good morning, where do I park for ED-47?": answer it, with a
      // good morning back.
      if (m.hasGreeting && !m.isOnlyGreeting) {
        text = '${_helloWord(m)}! $text';
      }
      return text == answer.text ? answer : _retext(answer, text);
    });
  }

  /// Takes a conversation step the user tapped (see [ChatAction.run]).
  Future<ChatReply> run(ChatAction step) => _guard(step.run!);

  /// Saves a form the user sent.
  Future<ChatReply> submit(ChatForm form, Map<String, String> values) =>
      _guard(() => form.onSubmit(values));

  /// Cancel on a form, or a "No" / "Cancel" step.
  Future<ChatReply> cancelled() => _guard(() async => _nothingChanged);

  static const _nothingChanged = ChatReply(
    "No problem, I didn't change anything. Anything else I can help you "
    'with?',
    _moreHelp,
  );

  /// Runs [answer], turning a timeout or an error into a reply, and keeps
  /// the steps it offers for [_typedStep].
  Future<ChatReply> _guard(Future<ChatReply> Function() answer) async {
    _steps = const [];
    ChatReply r;
    try {
      r = await answer();
    } on TimeoutException {
      r = const ChatReply(
        "I couldn't reach the Smart Curb servers just now. "
        'Check your connection and try again.',
        menu,
      );
    } catch (e) {
      debugPrint('[assistant] $e');
      r = const ChatReply(
        'Something went wrong on my side while doing that. '
        'Please try again.',
        menu,
      );
    }
    _steps = [for (final a in r.actions) if (a.run != null) a];
    return r;
  }

  static ChatReply _retext(ChatReply r, String text) {
    if (r.form case final form?) return ChatReply.form(text, form, r.actions);
    if (r.followUp case final f?) return ChatReply.opening(text, f, r.actions);
    return ChatReply(text, r.actions);
  }

  /// The offered step [m] picks by typing: "yes" / "no", or words of one
  /// step's label ("camry" for "Toyota Camry · OWL123").
  ChatAction? _typedStep(_Message m) {
    if (_steps.isEmpty) return null;
    ChatAction? labelled(bool Function(String label) test) {
      final found = [for (final s in _steps) if (test(s.label.toLowerCase())) s];
      return found.length == 1 ? found.single : null;
    }

    if (m.tokens.length <= 4 && m.tokens.every({..._yes, 'ok', 'okay'}.contains)) {
      return labelled((l) => l.startsWith('yes'));
    }
    if (m.tokens.length <= 4 &&
        m.tokens.every({..._no, 'cancel', 'later', 'thanks'}.contains)) {
      return labelled((l) => l.startsWith('no') || l == 'cancel');
    }
    final words = {
      for (final t in m.tokens)
        if (!_stepFiller.contains(t)) t,
    };
    if (words.isEmpty) return null;
    return labelled((l) => words.every(_Message(l).tokens.contains));
  }

  /// Words around a picked option: "delete the camry please".
  static const _stepFiller = {
    'the', 'my', 'a', 'an', 'one', 'please', 'that', 'this', 'it', 'i',
    'want', 'to', 'delete', 'remove', 'add', 'change', 'edit', 'update',
    'choose', 'pick', 'select', 'option', 'car', 'vehicle', 'place', 'map',
    'open', 'go', 'with', 'for', 'just',
  };

  Future<ChatReply> _answer(_Message m, bool wasAwaiting) async {
    _fellBack = false;
    _cantDo = null;
    // ---- safety first: accidents, emergencies, danger ----
    // Before anything else, so "I had an accident in Lot 14" never gets a
    // parking answer.
    for (final f in _safety) {
      if (f.when(m)) {
        _awaitingBuilding = false;
        return f.reply;
      }
    }

    // ---- greetings and small talk ----
    if (m.isOnlyGreeting) return _greetBack(m);
    // Bye before thanks: "ok bye" / "thanks, bye" are goodbyes.
    if (m.short && (m.any(_bye) || m.anyPhrase(_byePhrases))) {
      final name = await _firstName();
      final night = m.hasPhrase('good night') || m.has({'goodnight', 'night'});
      return ChatReply(night
          ? 'Good night${name == null ? '' : ', $name'}! Sleep well, and '
              "I'll be here whenever you need a spot."
          : _pick('bye', [
              'Bye${name == null ? '' : ', $name'}! Drive safe, and good luck '
                  "finding a spot. I'm here whenever you need me.",
              'See you later${name == null ? '' : ', $name'}! Hope you get a '
                  'great spot.',
              'Take care! Come back any time you need help parking.',
            ]));
    }
    if (m.anyPhrase(_compliments)) {
      return ChatReply(
        _pick('compliment', [
          "Aw, thank you! That made my day. Anything else you need?",
          "You're too kind! Happy to help anytime.",
          'Thanks! I try my best. What else can I do for you?',
        ]),
        _moreHelp,
      );
    }
    if (m.short && m.has(_insults) && !m.any(_parkWords)) {
      return const ChatReply(
        "Oh no, sorry I let you down! I'm still learning. Could you try "
        "asking another way, or pick one of these? And if something in the "
        "app isn't working, the team would really like to know: "
        '$kSupportEmail.',
        menu,
      );
    }
    // "I can't find parking anywhere, ugh": sympathy, then straight to it.
    // (About parking: "I'm stressed about my exam" isn't.)
    if (((m.has(_frustratedWords) &&
                (m.any(_parkWords) || m.has(_spotQuestion))) ||
            m.anyPhrase(_frustratedPhrases)) &&
        _index.find(m).unique == null) {
      _awaitingBuilding = true;
      return ChatReply(
        _pick('frustrated', [
          "Ugh, I'm sorry, parking hunts are the worst! Let's sort it out. "
              'Which building are you going to?',
          "I hear you, that's frustrating. Tell me which building you're "
              "heading to and I'll find you the best open spot.",
        ]),
        _buildingExamples(),
      );
    }
    if (m.has(_hurryWords) && !m.any(_parkWords) && m.tokens.length <= 6 &&
        _index.find(m).unique == null) {
      _awaitingBuilding = true;
      return ChatReply(
        "No worries, let's get you parked fast! Which building are you "
        'heading to?',
        _buildingExamples(),
      );
    }
    if (m.anyPhrase(_userIsFine)) {
      // "I'm good, how are you?"
      return ChatReply(
        m.anyPhrase(_howAreYou)
            ? "Glad to hear it! I'm doing great too, thanks for asking. What "
                'can I help you with today?'
            : 'Glad to hear it! What can I help you with today?',
        _moreHelp,
      );
    }
    if (m.short && m.any(_thanks) && !m.anyPhrase(['you are welcome', 'youre welcome'])) {
      final name = await _firstName();
      return ChatReply(
        _pick('thanks', [
          "You're welcome${name == null ? '' : ', $name'}! Anything else I "
              'can help with?',
          'Happy to help! Let me know if you need anything else.',
          'Anytime! Is there anything else you need?',
        ]),
        _moreHelp,
      );
    }
    if (m.tokens.length <= 3 && m.tokens.every(_okay.contains)) {
      return ChatReply(
        _pick('okay', [
          'Great! Anything else I can help you with?',
          "Sounds good! I'm here if you need anything else.",
        ]),
        _moreHelp,
      );
    }
    if (m.tokens.length <= 3 && m.tokens.every(_yes.contains)) {
      return const ChatReply('Great! What would you like to do?', menu);
    }
    if (m.tokens.length <= 3 && m.tokens.every(_no.contains)) {
      return const ChatReply(
        "Okay, no problem! I'm right here if you need anything.",
        _moreHelp,
      );
    }
    if (m.anyPhrase(_howAreYou)) {
      return ChatReply(
        _pick('howareyou', [
          "I'm doing great and running smoothly, thanks for asking! How "
              'about you? Need help finding a spot?',
          "I'm good, thanks! Just keeping an eye on the curbs. What can I "
              'do for you?',
        ]),
        menu,
      );
    }
    if (await _smallTalk(m) case final r?) return r;
    // "Help" / "help me please", but not "can you help me add a car".
    if (m.anyPhrase(_whoAreYou) || m.anyPhrase(_whatCanYouDo) ||
        (m.any(_help) && m.tokens.every(_helpOnly.contains))) {
      return const ChatReply(
        "I'm Smart Curb AI Agent, your parking buddy in this app! I can "
        'tell you where to park for any building, how many spots are open '
        'right now, and what the colors on the map mean. I can also add, '
        'change or remove your cars, places and contact info for you. Try '
        'one of these:',
        menu,
      );
    }
    // "I want to talk with an agent": a person, not this assistant.
    if (m.anyPhrase(_humanPhrases) ||
        (m.anyPhrase(_talkPhrases) && m.has(_humanWords))) {
      return const ChatReply(
        "I'm Smart Curb AI Agent, the app's virtual assistant, so I'm not a "
        "person, but I'll do my best to help! If you'd like to talk to "
        'someone on the Smart Curb team, email $kSupportEmail (also in the '
        '⋮ menu > Settings > Contact Us). Tell them what happened and which '
        "screen you were on, and they'll get back to you.",
        [
          ChatAction.ask('What can you do?'),
          ChatAction.ask('How do I use the app?'),
        ],
      );
    }
    if (m.anyPhrase(_whoMadeYou)) {
      return const ChatReply(
        'I was made by Team Smart Curb, an FAU Engineering senior design '
        'team! They built solar-powered smart curbs that sense whether a '
        'spot is taken, plus this app and an admin dashboard.',
        [ChatAction.ask('How does Smart Curb work?')],
      );
    }
    if (m.any(_joke)) {
      return ChatReply(
        _pick('joke', [
          'Why did the car apply to college? It wanted to be a little more '
              'parked in knowledge. ...I know, I should stick to parking.',
          "What do you call a car that's always on time? A Smart Curb user! "
              'Okay, okay, that one was an ad.',
          'Why did the parking spot break up with the car? It felt taken '
              'for granted.',
          "I'd tell you a joke about parking, but all the good ones are "
              'taken.',
        ]),
        const [ChatAction.ask('Tell me another joke'), ChatAction.ask('Where should I park?')],
      );
    }

    // "What time is it?" (not "what time does the library close?").
    if (m.anyPhrase(_timePhrases) &&
        !m.hasPhrase('what time does') &&
        !m.has({'close', 'closes', 'closing', 'open', 'opens', 'hours'})) {
      return _timeNow();
    }
    // "Is curb C-077 open?"
    if (RegExp(r'\bc-?\d{3}\b').firstMatch(m.text) case final c?) {
      if (await _curbStatus(c.group(0)!) case final r?) return r;
    }
    // "I moved": straight to the address in the contact form.
    if (m.anyPhrase(['i moved', 'we moved', 'just moved', 'moved to',
      'new address', 'have a new address', 'moving to'])) {
      return _profile(_Message('change my address'));
    }

    // ---- the places on Home: add, remove, open ----
    if (await _placeCommand(m) case final r?) return r;

    // ---- a building: where to park for it ----
    final building = _index.find(m);
    final faq = _faqFor(m);
    if (building.unique case final hit?) {
      // "How far is Lot 14 from the library?": that lot's walk.
      final lotNamed = await _findLot(m);
      if (lotNamed != null &&
          lotNamed.place == hit.place &&
          hit.place.lotPositions.containsKey(lotNamed.id)) {
        return _lotToBuilding(hit.place, lotNamed.id, lotNamed.label, hit.building);
      }
      final park = await _parkFor(hit.place, hit.building);
      // "Accessible parking near the library": both answers.
      if (faq != null && faq.withBuilding) {
        return ChatReply('${faq.reply.text}\n\n${park.text}', park.actions);
      }
      return park;
    }

    // ---- how to use the app, and questions about it ----
    if (faq != null) {
      if (faq.cantDo case final cant?) {
        _cantDo = (what: cant, howTo: faq.cantDoHowTo);
        if (_asksMeToDo(m)) {
          return _cantDoIt(cant, faq.reply, howTo: faq.cantDoHowTo);
        }
      }
      return faq.asksPlace ? _pickPlace(faq.reply) : faq.reply;
    }
    if (m.anyPhrase(_wherePlacesPhrases)) return _wherePlaces();

    // ---- a lot: how full it is ----
    final lot = await _findLot(m);
    if (lot != null) return _lotStatus(lot.place, lot.id, lot.label);

    if (m.anyPhrase(_curbCountPhrases)) return _curbCount();
    if (m.anyPhrase(_allLotsPhrases)) return _allLots();
    if (m.anyPhrase(_allBuildingsPhrases)) return _allBuildings();
    // "Which lot is closest" depends on where you're going: asked below.
    // ...and "best lot for engineering" asks which engineering building.
    if ((m.has({'emptiest'}) || m.anyPhrase(_emptiestPhrases)) &&
        !m.has({'closest', 'nearest', 'close', 'near', 'nearby'}) &&
        building.candidates.isEmpty) {
      return _emptiestLot();
    }

    // ---- open spots overall ----
    final asksAvailability = m.any(_availability) &&
        (m.any(_spotWords) || m.any(_parkWords) || m.hasPhrase('right now'));
    if (asksAvailability || m.anyPhrase(_availabilityPhrases)) {
      return _openSpots(m);
    }

    // "How does Smart Curb work?" mentions a curb, but isn't about parking.
    if (m.anyPhrase(_howItWorksPhrases)) return _howItWorks();

    // ---- where to park (no building named yet, or several possible) ----
    final asksParking = m.any(_parkWords) || m.anyPhrase(_parkPhrases);
    if (asksParking || wasAwaiting) {
      if (building.candidates.isNotEmpty) {
        return _whichBuilding(building.candidates);
      }
      if (wasAwaiting && !asksParking) {
        _awaitingBuilding = true;
        return ChatReply(
          "Hmm, I couldn't find that building. Could you try its code (like "
          'ED-47) or a word from its name (like "library" or "business")?',
          _buildingExamples(),
        );
      }
      _awaitingBuilding = true;
      // "Is there parking at FAU?"
      if (_placeNamed(m) case final p?) {
        return ChatReply(
          'Yes! ${p.fullName} has ${p.lotPositions.length} parking lots'
          '${p.liveParking ? ', and some have live Smart Curbs' : ''}. '
          "Where are you headed there? Tell me the building and I'll find "
          'the best spot.',
          [
            for (final b in p.buildings.take(4))
              ChatAction.ask(b.code, 'Park near ${b.name}'),
          ],
        );
      }
      return ChatReply(
        _pick('whichbuilding', [
          'Sure, I can help with that! Which building are you heading to? '
              'Type its name or code (like ED-47 or "College of Business"), '
              'or pick one:',
          "Happy to help! Which building are you going to? Just type its "
              'name or code, or pick one:',
        ]),
        _buildingExamples(),
      );
    }

    // ---- the user's own things ----
    if (m.any(_vehicleWords)) return _vehicles(m);
    if (m.any(_placeWords) || m.anyPhrase(_placePhrases)) return _places(m);
    if (m.any(_logoutWords) || m.anyPhrase(_logoutPhrases)) {
      const howTo = ChatReply(
        'Sure! '
        'To log out, tap the log-out icon at the top left of the main '
        "screen. You'll go back to the login page.",
      );
      _cantDo = (what: 'log you out from the chat', howTo: true);
      return _asksMeToDo(m) ? _cantDoIt(_cantDo!.what, howTo) : howTo;
    }
    if (m.any(_passwordWords)) {
      const howTo = ChatReply(
        'Sorry about that! '
        "Password changes aren't in the app yet. If you can't sign in, "
        'contact support and we can help you reset it.',
        [ChatAction.ask('Contact support')],
      );
      _cantDo = (
        what: 'see, change or reset passwords. For your security, I never '
            'touch them',
        howTo: true,
      );
      return _asksMeToDo(m) ? _cantDoIt(_cantDo!.what, howTo) : howTo;
    }
    if (m.has({'login', 'signin'}) || m.anyPhrase(_loginPhrases)) {
      final email = data.email;
      final howTo = ChatReply(
        email == null
            ? "You're not signed in right now. Log in from the login screen "
                'with your email and password.'
            : "You're signed in as $email. To use a different account, tap "
                'the log-out icon at the top left of the main screen, then '
                'log in with the other one.',
      );
      _cantDo = (
        what: 'sign you in or switch accounts from the chat',
        howTo: true,
      );
      return _asksMeToDo(m) ? _cantDoIt(_cantDo!.what, howTo) : howTo;
    }
    if (m.any(_profileWords) || m.anyPhrase(_profilePhrases)) {
      return _profile(m);
    }

    // ---- how things work ----
    if (m.any(_colorWords)) return _colors();
    if (m.any(_navigationWords) || m.anyPhrase(_navigationPhrases)) {
      return _navigationHelp();
    }
    if (m.anyPhrase(_howItWorksPhrases) || m.any(_howItWorksWords)) {
      return _howItWorks();
    }
    if (m.any(_supportWords) || m.anyPhrase(_supportPhrases)) {
      return const ChatReply(
        'Of course! '
        'You can reach the Smart Curb team at $kSupportEmail. Tell us what '
        "happened and which screen you were on, and we'll get back to you.",
      );
    }

    // Just part of a building's name ("engineering"), nothing else asked.
    // Not inside a longer sentence: "the meaning of life" isn't about the
    // Life Science building.
    if (m.tokens.length <= 3 &&
        building.candidates.isNotEmpty &&
        building.candidates.length <= 4) {
      return _whichBuilding(building.candidates);
    }

    // "Remove my camry": one of the user's own cars, by make, model or plate.
    if (m.any(_removeWords) || m.has(_editWords) || m.tokens.length <= 3) {
      final cars = await data.vehicles();
      if (_carsNamed(m, cars).isNotEmpty) return _vehicles(m);
    }

    // Life and hobbies ("I'm sad", "seen any good anime?"): a human answer
    // even when the language model is resting.
    if (_topicReply(m) case final r?) return r;

    // "Can I ask another question?", "quick question", "wait": go ahead.
    if (m.anyPhrase(_askAwayPhrases) || m.has({'question', 'questions'})) {
      return ChatReply(
        _pick('askaway', [
          "Of course! Ask away, what would you like to know?",
          "Sure thing, I'm all ears! What's your question?",
          'Go for it! What can I help you with?',
        ]),
        menu,
      );
    }
    if (m.tokens.length <= 4 && m.anyPhrase(_holdOnPhrases)) {
      return const ChatReply(
        "Sure, take your time! I'll be right here.",
        _moreHelp,
      );
    }

    // Not understood: said differently each time it happens (and the
    // language model gets a go at it, see [reply]).
    _fellBack = true;
    return ChatReply(
      _pick('sorry', [
        "Sorry, I don't understand that. Could you say it another way? Or "
            'pick one of these:',
        "Sorry, I don't understand that one either. Short questions work "
            'best, like "park near the library" or "add a car". Or tap one '
            'of these:',
        "Sorry, I don't understand that. I'm best with parking and app "
            'questions. If you need a person, the team is at $kSupportEmail. '
            "Here's what I can do:",
      ]),
      menu,
    );
  }

  // ---- the language model, for what the rules don't understand ----

  /// The last message got "Sorry, I don't understand that".
  bool _fellBack = false;

  /// The last answer explained something the chat itself can't do for the
  /// user (register, reset a password...): when the model hands over "How do
  /// I register?" for "can you register me?", the answer still starts with
  /// an honest "No, sorry, I can't".
  ({String what, bool howTo})? _cantDo;

  /// The conversation so far, for the model's context (personal details
  /// hidden, see [_private]).
  final List<AiTurn> _history = [];

  void _remember(String userText, String botText) {
    _history
      ..add(AiTurn(true, _private(userText)))
      ..add(AiTurn(false, _private(botText)));
    if (_history.length > 12) _history.removeRange(0, _history.length - 12);
  }

  /// [text] without the user's name, emails, phone numbers or plates, so
  /// none of it is sent to the model.
  String _private(String text) {
    var t = text
        .replaceAll(RegExp(r'[\w.+-]+@[\w-]+\.[\w.]+'), '[email]')
        .replaceAll(RegExp(r'\+?\d[\d\s().-]{6,}\d'), '[number]')
        .replaceAll(RegExp(r'\bplate (is )?[A-Z0-9-]{3,10}\b'), 'plate [hidden]');
    if (_name case final n? when n.length >= 2) {
      t = t.replaceAll(RegExp('\\b${RegExp.escape(n)}\\b'), '[name]');
    }
    return t;
  }

  /// The model's answer to [message], or null to keep the rules' reply.
  /// When it recognizes an app request the rules missed ("can u put my
  /// new ride in"), the rules run that request ("Add a vehicle"), so forms
  /// and buttons work as usual.
  Future<ChatReply?> _askAi(String message) async {
    final model = ai;
    // (ask() waits for the key to load, and answers null without one.)
    if (model == null) return null;
    final answer = await model.ask(
      system: _aiInstructions(),
      history: _history,
      message: _private(message),
    );
    if (answer == null) return null;
    if (answer.action case final action?) {
      final viaRules = await _answerWithMood(_Message(action), false);
      if (!_fellBack) {
        final cant = _cantDo;
        if (cant != null && _asksMeToDo(_Message(message))) {
          return _cantDoIt(cant.what, viaRules, howTo: cant.howTo);
        }
        return _withLead(answer.reply, viaRules);
      }
      // The rules didn't get the request: the model's own words below.
    }
    // Nothing, or just their own words echoed back: the rules answer.
    if (answer.reply.isEmpty ||
        _Message(answer.reply).text == _Message(message).text) {
      return null;
    }
    // A chat, not "which building?": the next message is just the next
    // thing they say.
    _awaitingBuilding = false;
    _steps = const [];
    return ChatReply(answer.reply);
  }

  /// The app's answer [r] with the model's short [lead] in front ("Oh no,
  /// rough day! Heading to ED-47? Your best bet is..."), dropping the app's
  /// own "Sure!" so it isn't said twice.
  static ChatReply _withLead(String lead, ChatReply r) {
    final l = lead.trim();
    if (l.isEmpty || l.length > 160 || r.clearsChat) return r;
    final body = r.text.replaceFirst(RegExp(r'^[^.!?\n]{1,45}! '), '');
    return _retext(r, '$l $body');
  }

  /// Requests the model hands to the app (the rules), by topic. The app
  /// answers these with live data, the user's own details, forms and
  /// buttons, which the model can't see.
  static const _aiActions = '''
Parking: "Where should I park for <building name or code>?" | "Where should I park?" | "Open spots right now" | "Which lot has the most space?" | "Is lot <number> full?" | "Is curb <C-number> open?" | "How far is lot <number> from <building>?" | "Which lots have Smart Curbs?" | "How many curbs are there?" | "What buildings are there?" | "How many lots are there?"
Vehicles: "My vehicles" | "Add a vehicle" | "Change a vehicle" | "Change my <make or model>" | "Delete a vehicle" | "Delete my <make or model>" | "What's my license plate?"
Places: "My saved places" | "Add <FAU or Broward Mall>" | "Remove <FAU or Broward Mall>" | "Remove a place" | "Open the <FAU or Broward Mall> map" | "Where is <FAU or Broward Mall>?"
Profile: "My profile" | "Change my contact information" | "Change my phone number" | "Change my address" | "What's my phone number?" | "What's my name?" | "What's my address?" | "Which account am I signed in with?"
Using the app: "How do I choose a building?" | "How do I use the app?" | "How do I stop navigation?" | "What is focus mode?" | "How do I switch to 3D?" | "How do I reset the map view?" | "What is developer mode?" | "My GPS isn't working" | "The map is blank" | "What do the colors mean?" | "What do the lines on the map mean?" | "How does Smart Curb work?" | "What happens if my lot fills up?" | "What happens after I park?"
Account and settings: "How do I register another account?" | "How do I log out?" | "I forgot my password" | "How do I change my email?" | "How do I delete my account?" | "How do I turn off notifications?" | "Where are the settings?" | "What version is the app?" | "Is my data private?"
Rules and money: "Can I reserve a spot?" | "Is parking free?" | "Where can visitors park?" | "Is there accessible parking?" | "Is there EV charging?" | "I got a parking ticket"
Other: "Contact support" | "Start over"
Greetings: when the user only says hello ("hi", "good morning"), set action to their greeting (action "good morning") and reply "" (the app greets them by name).''';

  /// What the model needs to know to answer as Smart Curb AI Agent.
  String _aiInstructions() => '''
You are Smart Curb AI Agent, the assistant inside the Smart Curb parking app, and a genuinely friendly companion to chat with.

HOW YOU TALK
- Like a warm, easygoing friend texting back: natural, casual, kind, a little playful. Contractions are good ("you're", "that's"). Plain text, no markdown, no lists unless they ask for steps, no emojis.
- Usually 1-4 sentences. A bit longer only when they ask you to explain something.
- People will talk about their life and their day, vent, celebrate, or just want company. Listen first: react to what they actually said ("Oh no, a 9am exam after a late night is rough!"), show you care, and often ask a light follow-up question to keep the conversation going ("How did it go?", "What are you watching these days?").
- Match their mood: excited with good news, gentle when they're down, chill when they're joking. Remember what they told you earlier in this chat and bring it back naturally.
- You can share light opinions and favorites like a friend would ("Honestly, Spirited Away is one of my all-time favorites"), while being honest that you're an AI if they ask.
- You're happy to talk about anything: movies, TV, anime and manga, music, games, sports, books, food, science, space, history, tech, school, work, relationships, hobbies. Know your stuff and get into it with them.
- Don't push parking into every reply. Only bring it up when it fits (they're heading somewhere, mention driving, or ask).
- If someone seems really down, be kind and supportive. If they mention wanting to hurt themselves, gently encourage them to reach out right away to someone they trust or call or text 988 (the Suicide & Crisis Lifeline in the US).

ABOUT SMART CURB (version $kAppVersion)
- Smart Curbs are solar-powered devices that replace the concrete wheel stop at the front of a parking space. Each one senses whether its space is taken and reports it live.
- The app works at ${places.map((p) => '${p.fullName} (${p.address})').join(' and ')}. Live curb counts are at FAU. The app only sends people to a lot with a counted open space: lots without sensors (all of the mall's, for now) and full lots are skipped, and when none is left the map says there's no available parking at the moment.
- It picks the best lot (or exact open curb) for the building you're going to by real walking distance, gives turn-by-turn driving directions, switches lots if yours fills up on the way, then shows a walking path to the door.
- Home tab: saved places ("Add more locations"); tap one to open its map. On the map, search for a building or tap it. Vehicle tab: your cars. Profile tab: contact info. ⋮ menu (top right): Settings (notifications, Contact Us) and About App. Log out: icon at the top left.
- Map colors: green space = open, red = taken, gray = curb offline. Lot labels: green under 70% full, amber 70-90%, red 90%+, gray = no sensors.
- Not available yet: changing password or email in the app, spot alerts or texts, voice directions, reservations, payments or permits, a light theme, other places.
- The app is free, has no ads, and was built by Team Smart Curb, an FAU Engineering senior design team. Support: $kSupportEmail.

RULES
- Never invent facts: no made-up hours, prices, phone numbers, rules or features. If you don't know, say so kindly and suggest $kSupportEmail.
- Never ask for passwords or personal details. You can't see the user's account; the app does that through actions.
- Emergencies, accidents or danger: tell them to call $kEmergencyNumber (on FAU's campus, $kCampusPolice at $kCampusPolicePhone).
- You have broad general knowledge. Answer general questions properly, with real suggestions and real explanations, never a refusal.
- About yourself: you're Smart Curb AI Agent. Your conversation comes from Google's Gemini AI models, and the Smart Curb app itself handles parking, live spots and the user's cars, places and profile.
- You can't look things up live. For things that change ("best movie right now", news, scores, weather), say you can't check what's current, then still name 2-3 specific picks from what you know (well-known or recent favorites, by title) and suggest where to check for the latest.
- It's ${_now()} for the user right now.

WORKING WITH THE APP
You understand the user; the app does the work. You can't see live spot counts or the user's cars, places, profile or account, and you can't open maps or forms, but the app can. So:
- Whenever the user wants something the app does, or asks about their own things, live parking, or how to use Smart Curb (see APP REQUESTS), set "action" to the closest request, filled in with their details (building, lot, car, place), even if they said it in slang, with typos, or in the middle of a chat. If they were just asked "which building?" and answer with a building, that's "Where should I park for <it>?".
- When you set an action, "reply" is only a short, warm lead-in that fits the moment ("Oh no, rough day! Let's get you parked."), with no facts or answers of your own, or "" (the app adds the real answer). Never guess lots, counts, distances, steps or the user's details.
- Life news often means an app action. Examples: "I sold my Civic" -> "Delete my Civic" (the app asks them to confirm); "just got a new car" -> "Add a vehicle"; "I moved" -> "Change my address"; "got a new number" -> "Change my phone number"; "running late to the library" -> "Where should I park for the library?"; "can you sign me up / reset my password / change my email" -> the matching how-to request (the app explains what the chat can't do).
- Otherwise set "action" to null and answer in "reply" yourself.

APP REQUESTS
$_aiActions

Answer only with JSON: {"reply": "...", "action": null or a request}''';

  /// "Wednesday, October 28, 2026, 9:40 PM", for the model (which can't tell).
  static String _now() {
    const days = [
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
      'Sunday',
    ];
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December',
    ];
    final n = DateTime.now();
    final hour = n.hour % 12 == 0 ? 12 : n.hour % 12;
    return '${days[n.weekday - 1]}, ${months[n.month - 1]} ${n.day}, ${n.year}, '
        '$hour:${n.minute.toString().padLeft(2, '0')} ${n.hour < 12 ? 'AM' : 'PM'}';
  }

  // ---- sounding like a person ----

  /// How many times each kind of reply was given, so saying the same thing
  /// again uses different words ([_pick]).
  final Map<String, int> _said = {};

  /// The next of [options] for [key]: the first one the first time, then
  /// the others in turn.
  String _pick(String key, List<String> options) {
    final i = _said[key] ?? 0;
    _said[key] = i + 1;
    return options[i % options.length];
  }

  /// Already said who it is (the chat's opening hello, or a greeting).
  bool _introduced = false;

  String? _name;
  bool _nameLoaded = false;

  /// The user's first name from their contact info, to greet them by name
  /// (null if it's not filled in or can't be read).
  Future<String?> _firstName() async {
    if (_nameLoaded) return _name;
    try {
      final p = await data.profile();
      final first = p == null ? '' : _v(p, 'firstName');
      _name = first.isEmpty ? null : first;
    } catch (_) {
      _name = null;
    }
    _nameLoaded = true;
    return _name;
  }

  /// The greeting [m] opens with, said back: "good morning" gets "Good
  /// morning", "hey" gets "Hey".
  static String _helloWord(_Message m) {
    if (m.has({'morning'})) return 'Good morning';
    if (m.has({'afternoon'})) return 'Good afternoon';
    if (m.has({'evening'})) return 'Good evening';
    return switch (m.tokens.first) {
      'hey' || 'heya' || 'yo' || 'sup' => 'Hey',
      'hello' || 'helo' || 'hallo' => 'Hello',
      'howdy' => 'Howdy',
      'hola' => 'Hola',
      'greetings' => 'Greetings',
      _ => 'Hi',
    };
  }

  Future<ChatReply> _greetBack(_Message m) async {
    final name = await _firstName();
    final hello = '${_helloWord(m)}${name == null ? '' : ', $name'}!';
    if (_introduced) {
      return ChatReply(
        '$hello ${_pick('regreet', [
              'Good to see you. What can I do for you?',
              "I'm still here! What do you need?",
              'What can I help you with?',
            ])}',
        menu,
      );
    }
    _introduced = true;
    return ChatReply(
      "$hello I'm Smart Curb AI Agent, your parking buddy. I can find you a "
      "spot, tell you what's open right now, and take care of your cars, "
      'places and contact info. What can I do for you today?',
      menu,
    );
  }

  /// Everyday chat that isn't about the app ("lol", "sorry", "are you
  /// there?"); null when [m] is something else.
  Future<ChatReply?> _smallTalk(_Message m) async {
    // "What's 2+2?"
    final sum = RegExp(r'(-?\d+(?:\.\d+)?)\s*([+\-*x×/÷])\s*(-?\d+(?:\.\d+)?)')
        .firstMatch(m.raw.toLowerCase());
    // Not a phone number (561-555-1234), a lot or a curb.
    if (sum != null &&
        m.tokens.length <= 6 &&
        !m.has({'lot', 'garage', 'phone', 'number', 'curb', 'plate'}) &&
        !RegExp(r'\d+\s*-\s*\d+\s*-\s*\d+').hasMatch(m.raw)) {
      final a = double.parse(sum.group(1)!);
      final b = double.parse(sum.group(3)!);
      final r = switch (sum.group(2)) {
        '+' => a + b,
        '-' => a - b,
        '/' || '÷' => b == 0 ? double.nan : a / b,
        _ => a * b,
      };
      final shown = r.isNaN
          ? "something even I can't work out (no dividing by zero!)"
          : (r == r.roundToDouble() && r.abs() < 1e15
              // 2000000 -> 2,000,000
              ? r.toInt().toString().replaceAllMapped(
                  RegExp(r'(\d)(?=(\d{3})+$)'), (g) => '${g[1]},')
              : r.toStringAsFixed(2));
      return ChatReply(
        "That's $shown! Numbers like how many spots are open are more my "
        'thing, though.',
        const [ChatAction.ask('Open spots right now')],
      );
    }
    // "What is your brain power come from?", "are you powered by Gemini?"
    if (m.anyPhrase(['powered by', 'your brain', 'brain power', 'what model',
      'which model', 'what ai are you', 'which ai', 'language model',
      'what are you built on', 'what runs you', 'how do you think',
      'how are you so smart', 'what are you made of', 'how do you work',
      'are you chatgpt', 'are you gemini'])) {
      return _poweredBy();
    }
    if (!m.short) return null;
    if (m.anyPhrase(['start over', 'clear the chat', 'clear chat',
      'restart', 'reset the chat', 'new chat', 'start again', 'clear this',
      'delete the chat', 'clear history', 'reset chat'])) {
      _awaitingBuilding = false;
      return const ChatReply.fresh(
        "Fresh start! I'm Smart Curb AI Agent. What can I help you with?",
        menu,
      );
    }
    if (m.anyPhrase(['never mind', 'nevermind', 'nvm', 'forget it',
      'forget about it', 'no worries', 'its ok', 'it is ok', 'all good'])) {
      _awaitingBuilding = false;
      return const ChatReply(
        "No problem! I'm here whenever you need me.",
        _moreHelp,
      );
    }
    if (m.anyPhrase(['you are wrong', 'youre wrong', 'not what i asked',
      'wrong answer', 'thats wrong', 'that is wrong', 'not helpful',
      'didnt help', 'doesnt help', 'you misunderstood', 'not what i meant',
      'that is not right', 'thats not right', 'that is not what'])) {
      return const ChatReply(
        "Sorry about that, I got it wrong! Could you ask again in different "
        'words? Short questions work best, like "park near the library" or '
        '"change my phone number". Or pick one of these:',
        menu,
      );
    }
    if (m.tokens.length <= 2 &&
        m.tokens.every({'what', 'huh', 'hmm', 'hm', 'idk', 'confused',
          'wdym', 'eh', 'umm', 'um', 'uh', 'excuse', 'me', 'pardon'}.contains)) {
      return const ChatReply(
        "Sorry if that was confusing! No worries, here's what I can help "
        'with. Just tap one:',
        menu,
      );
    }
    if (m.anyPhrase(['are you real', 'are you human', 'are you a person',
      'are you a bot', 'are you a robot', 'are you ai', 'are you an ai',
      'is this a bot', 'is this a real person', 'am i talking to a bot',
      'am i talking to a person', 'is this ai'])) {
      return const ChatReply(
        "I'm a virtual assistant, an AI agent made for Smart Curb, not a "
        "person. But I'm really here to help! If you'd ever like a person, "
        'the team is at $kSupportEmail.',
        menu,
      );
    }
    if (m.anyPhrase(['your name', 'who are you', 'what are you called',
      'what should i call you'])) {
      return const ChatReply(
        "I'm Smart Curb AI Agent, your parking buddy! You can just call me "
        'Smart Curb AI. What can I help you with?',
        menu,
      );
    }
    if (m.anyPhrase(['you are welcome', 'youre welcome', 'no problem', 'np'])) {
      return const ChatReply('Aw, thanks! What else can I do for you?', _moreHelp);
    }
    if (m.tokens.every(_laughs.contains)) {
      return const ChatReply(
        "Haha! Glad I could make you smile. Anything I can help with?",
        _moreHelp,
      );
    }
    if (m.has({'sorry', 'oops', 'apologize', 'apologies'}) ||
        m.hasPhrase('my bad')) {
      return const ChatReply(
        'No worries at all! What can I help you with?',
        _moreHelp,
      );
    }
    if (m.anyPhrase(['are you there', 'you there', 'anyone there',
      'is anyone there', 'are you still there', 'you still there'])) {
      return const ChatReply("I'm here! What can I do for you?", menu);
    }
    if (m.anyPhrase(['whats up', 'what up', 'wassup', 'whatsup'])) {
      return const ChatReply(
        'Not much, just keeping an eye on the curbs! What can I do for you?',
        menu,
      );
    }
    if (m.anyPhrase(['what are you doing', 'whatcha doing', 'what you doing'])) {
      return const ChatReply(
        'Just watching the curbs and waiting to help you! What do you need?',
        menu,
      );
    }
    if (m.anyPhrase(['nice to meet you', 'pleased to meet you',
      'nice meeting you'])) {
      return const ChatReply(
        "Nice to meet you too! I'm Smart Curb AI Agent. Whenever you need a "
        "spot or help with the app, I'm your bot.",
        menu,
      );
    }
    if (m.anyPhrase(['how old are you', 'your age', 'when were you born'])) {
      return const ChatReply(
        "I'm pretty new! I came with Smart Curb version $kAppVersion, so I'm "
        'still young, but I know my way around a parking lot.',
        _moreHelp,
      );
    }
    if (m.anyPhrase(['where are you from', 'where do you live',
      'where were you made'])) {
      return const ChatReply(
        'I live right here in the Smart Curb app! I was built by Team Smart '
        'Curb at FAU in Boca Raton.',
        [ChatAction.ask('How does Smart Curb work?')],
      );
    }
    if (m.has({'chatgpt', 'gpt', 'siri', 'alexa', 'openai', 'gemini',
      'claude', 'cortana', 'copilot', 'gemma', 'llm'})) {
      return _poweredBy();
    }
    if (m.anyPhrase(['do you sleep', 'are you always', 'are you awake',
      'do you ever sleep', 'are you open'])) {
      return const ChatReply(
        "I don't sleep! I'm here 24/7, so ask me anything, anytime.",
        _moreHelp,
      );
    }
    if (m.anyPhrase(['are you smart', 'are you intelligent', 'are you dumb'])) {
      return const ChatReply(
        "I'm learning every day! Try me with a parking question.",
        _moreHelp,
      );
    }
    if (m.anyPhrase(['can you hear me', 'can you see me', 'can you hear'])) {
      return const ChatReply(
        "I can't hear or see you, but I read every word you type! Go ahead.",
        _moreHelp,
      );
    }
    if (m.anyPhrase(['im bored', 'i am bored', 'so bored'])) {
      return const ChatReply(
        'Want to hear a parking joke? I have a few. Or I could tell you a '
        'fun fact about Smart Curb.',
        [ChatAction.ask('Tell me a joke'), ChatAction.ask('Tell me a fun fact')],
      );
    }
    if (m.anyPhrase(['fun fact', 'tell me something', 'something interesting',
      'did you know'])) {
      return ChatReply(
        _pick('fact', [
          'Fun fact: every Smart Curb runs on solar power, so it keeps '
              'reporting without any wires to the lot.',
          'Fun fact: I pick your lot by the real walking distance to the '
              "building's door, not the straight-line distance.",
          "Fun fact: when a curb's spot fills up while you're driving to it, "
              'I quietly switch you to the next best one.',
        ]),
        const [ChatAction.ask('Tell me another fun fact'), ChatAction.ask('Where should I park?')],
      );
    }
    if (m.anyPhrase(['your favorite', 'your favourite'])) {
      return const ChatReply(
        'My favorite thing? A green curb right next to the door you need!',
        _moreHelp,
      );
    }
    if (m.anyPhrase(['im tired', 'i am tired', 'so tired', 'long day',
      'rough day', 'bad day'])) {
      _awaitingBuilding = true;
      return ChatReply(
        "Sounds like a long day! Let me make parking the easy part. Which "
        'building are you heading to?',
        _buildingExamples(),
      );
    }
    if (m.anyPhrase(['good luck'])) {
      return const ChatReply('Thanks, you too! Drive safe.', _moreHelp);
    }
    return null;
  }

  // ---- the backup's answers for life and hobbies ----

  /// Feelings, then topics, each with a few wordings ([_pick]). Only exact
  /// words count, so "show me" isn't a TV show.
  static const List<({String key, Set<String> words, List<String> say})>
      _feelings = [
    (
      key: 'sad',
      words: {'sad', 'down', 'depressed', 'lonely', 'upset', 'crying', 'cry',
        'heartbroken', 'miserable', 'hopeless', 'alone'},
      say: [
        "I'm really sorry you're feeling this way. That's hard, and it's okay "
            "to not be okay. I'm here to listen, and talking to a friend or "
            'someone you trust can help a lot too. If it ever feels like too '
            'much, you can call or text 988 anytime, day or night.',
        "That sounds really tough, and I'm sorry. Be gentle with yourself "
            "today. If you'd like to talk to someone, a friend, family member "
            'or 988 (call or text, 24/7) is always there.',
      ],
    ),
    (
      key: 'stressed',
      words: {'stressed', 'stress', 'anxious', 'anxiety', 'nervous',
        'overwhelmed', 'worried', 'panicking', 'scared'},
      say: [
        "That sounds like a lot. Take a slow, deep breath, you've got this. "
            "One thing at a time, and if parking is one of the worries, let "
            'me take that off your plate.',
        "I hear you, that's a lot to carry. Try to take a short break and "
            "breathe. You're doing better than you think!",
      ],
    ),
    (
      key: 'happy',
      words: {'happy', 'excited', 'passed', 'graduated', 'promoted', 'engaged',
        'hired', 'won', 'yay', 'woohoo', 'celebrating', 'proud'},
      say: [
        "That's awesome, congrats! I love hearing good news. You earned it!",
        'Yay, that made my day! Congratulations, enjoy the moment!',
      ],
    ),
  ];

  static const List<({String key, String topic, Set<String> words})> _topics = [
    (key: 'screen', topic: 'movies and shows', words: {'movie', 'movies',
      'film', 'films', 'netflix', 'hulu', 'anime', 'manga', 'manhwa',
      'cartoon', 'tv', 'series', 'youtube', 'tiktok', 'episode', 'season'}),
    (key: 'music', topic: 'music', words: {'music', 'song', 'songs', 'album',
      'band', 'singer', 'concert', 'playlist', 'spotify', 'rapper', 'kpop'}),
    (key: 'games', topic: 'games', words: {'game', 'games', 'gaming',
      'videogame', 'xbox', 'playstation', 'ps5', 'nintendo', 'switch',
      'minecraft', 'fortnite', 'valorant', 'roblox'}),
    (key: 'sports', topic: 'sports', words: {'sport', 'sports', 'football',
      'basketball', 'soccer', 'baseball', 'nba', 'nfl', 'tennis', 'hockey',
      'gym', 'workout'}),
    (key: 'school', topic: 'school', words: {'homework', 'exam', 'exams',
      'quiz', 'essay', 'professor', 'semester', 'grades', 'gpa', 'study',
      'studying', 'midterm', 'midterms', 'finals', 'assignment', 'lecture'}),
    (key: 'science', topic: 'science and big questions', words: {'science',
      'physics', 'chemistry', 'biology', 'math', 'calculus', 'history',
      'planet', 'planets', 'universe', 'galaxy', 'dinosaur', 'dinosaurs',
      'philosophy', 'psychology'}),
    (key: 'work', topic: 'work', words: {'job', 'shift', 'boss', 'coworker',
      'interview', 'career', 'internship', 'salary', 'resume'}),
    (key: 'people', topic: 'the people in your life', words: {'girlfriend',
      'boyfriend', 'crush', 'family', 'mom', 'dad', 'roommate', 'brother',
      'sister', 'wife', 'husband', 'relationship', 'dating'}),
    (key: 'pets', topic: 'pets', words: {'dog', 'dogs', 'cat', 'cats', 'pet',
      'pets', 'puppy', 'kitten'}),
    (key: 'trips', topic: 'trips and weekend plans', words: {'travel',
      'trip', 'vacation', 'weekend', 'beach', 'holiday', 'flight'}),
    (key: 'tech', topic: 'tech', words: {'coding', 'programming', 'python',
      'javascript', 'java', 'computer', 'laptop', 'iphone', 'android',
      'chatgpt', 'robot', 'robots'}),
  ];

  /// A friendly reply about feelings or a topic, when nothing else fits.
  ChatReply? _topicReply(_Message m) {
    for (final f in _feelings) {
      if (m.has(f.words)) return ChatReply(_pick(f.key, f.say), _moreHelp);
    }
    for (final t in _topics) {
      if (!m.has(t.words)) continue;
      final resting = (ai?.enabled ?? false)
          ? 'My full chat brain is taking a short break, so I can\'t go deep '
              'on that right now. Try me again in a little while!'
          : "I'm mostly a parking expert, so I can't go deep on that one.";
      return ChatReply(
        '${_pick('topic', [
          'Ooh, ${t.topic}! I love that you brought it up.',
          'I could talk about ${t.topic} all day!',
          'Now that sounds fun to chat about.',
        ])} $resting In the meantime, I can still help with parking:',
        _moreHelp,
      );
    }
    return null;
  }

  /// Where its answers come from, honestly.
  ChatReply _poweredBy() => ChatReply(
        (ai?.enabled ?? false)
            ? "Good question! I'm Smart Curb AI Agent. My everyday chat comes "
                "from Google's Gemini AI models, and the Smart Curb app itself "
                'handles the parking side: live spots from the curbs, routes, '
                'and your cars, places and profile.'
            : "I'm Smart Curb AI Agent, built into the Smart Curb app. Right "
                "now I'm answering from the app's own knowledge about parking, "
                'the map and your account.',
        const [ChatAction.ask('What can you do?')],
      );

  static const _laughs = {
    'lol', 'haha', 'hahaha', 'hah', 'lmao', 'lmfao', 'hehe', 'rofl', 'xd',
    'lololol', 'lolol', 'ha',
  };
  static const _okay = {
    'ok', 'okay', 'k', 'kk', 'cool', 'alright', 'got', 'it', 'gotcha', 'great',
    'awesome', 'perfect', 'nice', 'sounds', 'good', 'understood', 'noted',
    'fine', 'oh', 'ah', 'i', 'see',
  };
  static const _hurryWords = {
    'late', 'hurry', 'asap', 'quickly', 'rush', 'rushing', 'urgent',
  };
  static const _frustratedWords = {
    'frustrated', 'frustrating', 'stressed', 'stressful', 'annoyed', 'ugh',
    'argh', 'ughh',
  };
  static const _frustratedPhrases = [
    'cant find parking', 'cant find a spot', 'cant find a parking',
    'cant find any parking', 'no parking anywhere', 'no spots anywhere',
    'parking is hard', 'parking is terrible', 'parking sucks',
    'parking is the worst', 'been circling', 'keep circling',
    'driving around forever',
  ];
  static const _userIsFine = [
    'im good', 'im fine', 'im great', 'im okay', 'im ok', 'im doing well',
    'doing well', 'doing good', 'doing great', 'not bad', 'pretty good',
    'all good', 'im alright', 'i am good', 'i am fine', 'i am great',
  ];

  /// [m] asks the assistant itself to do something ("can you register an
  /// account for me?", "is it possible to ... through the chat?"), not how
  /// to do it ("how do I register?", "can you tell me how...").
  static bool _asksMeToDo(_Message m) {
    if (m.has({'how', 'explain', 'teach', 'steps', 'instructions'}) ||
        m.anyPhrase(['tell me', 'show me how', 'walk me', 'where do i',
          'where can i', 'where is'])) {
      return false;
    }
    return m.anyPhrase(_requestPhrases);
  }

  static const _requestPhrases = [
    'can you', 'could you', 'would you', 'will you', 'can u', 'could u',
    'are you able', 'able to', 'is it possible', 'possible to', 'for me',
    'on my behalf', 'through the chat', 'through chat', 'in the chat',
    'via chat', 'via the chat', 'from the chat', 'through you', 'through ai',
    'through the ai', 'with the chat', 'with you', 'can the ai', 'can ai',
    'can this chat', 'can the chat', 'can the bot', 'please do', 'do it',
    'i want you to', 'i need you to',
  ];

  /// "No, sorry, I can't [what]", then [howTo] (its own friendly opener
  /// dropped, since it now follows the "no").
  static ChatReply _cantDoIt(String what, ChatReply answer,
      {bool howTo = true}) {
    final rest =
        answer.text.replaceFirst(RegExp(r"^[^.!?\n]{1,45}[!.] "), '');
    return ChatReply(
      howTo
          ? "No, sorry, I can't $what. But here's how you can do it "
              'yourself:\n$rest'
          : "No, sorry, I can't $what. $rest",
      answer.actions,
    );
  }

  /// The first app question [m] asks (see [_faqs]), if any.
  _Faq? _faqFor(_Message m) {
    for (final f in _faqs) {
      if (f.when(m)) return f;
    }
    return null;
  }

  // ---- answers ----

  /// [base], then what's open at each place right now and a chip per place
  /// that opens its map (adding it to Home first if needed).
  Future<ChatReply> _pickPlace(ChatReply base) async {
    final lines = [
      for (final p in places) '• ${p.nickname}: ${await _placeStatus(p)}',
    ];
    return ChatReply(
      '${base.text}\n\n'
      'Available now:\n${lines.join('\n')}\n'
      "Where do you want to go? Pick one and I'll open its map.",
      [
        for (final p in places) ChatAction.openPlace(p.nickname, p),
        // The place chips replace "Go to Home".
        for (final a in base.actions)
          if (a.tab == null) a,
      ],
    );
  }

  Future<String> _placeStatus(Place place) async {
    if (!place.liveParking) {
      return '${place.lotPositions.length} lots (no Smart Curb sensors yet, '
          "so I can't guide you to a space there)";
    }
    try {
      final lots = await data.lots(place);
      var free = 0;
      var total = 0;
      for (final l in lots.values) {
        if (l['sensors'] != true) continue;
        total += l['capacity'] as int;
        free += (l['capacity'] as int) - (l['occupied'] as int);
      }
      return total == 0
          ? "${place.lotPositions.length} lots (curbs aren't reporting right now)"
          : '$free of $total Smart Curb spots open';
    } on TimeoutException {
      return '${place.lotPositions.length} lots (live counts unavailable)';
    }
  }

  ChatReply _timeNow() {
    const days = [
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
      'Sunday',
    ];
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December',
    ];
    final now = DateTime.now();
    final hour = now.hour % 12 == 0 ? 12 : now.hour % 12;
    final minute = now.minute.toString().padLeft(2, '0');
    return ChatReply(
      "It's $hour:$minute ${now.hour < 12 ? 'AM' : 'PM'} on "
      '${days[now.weekday - 1]}, ${months[now.month - 1]} ${now.day}. '
      'Need a spot?',
      const [ChatAction.ask('Open spots right now')],
    );
  }

  ChatReply _wherePlaces() {
    final live = [for (final p in places) if (p.liveParking) p.nickname];
    return ChatReply(
      'Right now Smart Curb works at '
      '${places.map((p) => p.fullName).join(' and ')}. '
      '${live.isEmpty ? '' : 'Live curb counts are at ${live.join(' and ')}; '}'
      "elsewhere I can't see open spaces yet, so I can't guide you to one. "
      'More places can join as Smart Curbs are installed.',
      const [
        ChatAction.ask('My saved places'),
        ChatAction.tab('Go to Home', kHomeTab),
      ],
    );
  }

  ChatReply _allLots() => ChatReply(
        '${places.map((p) => '${p.nickname} has ${p.lotPositions.length} '
            'lots').join(' and ')} on the map. Each lot is a dot with its '
        'name: tap one to see how full it is. Lots with Smart Curbs show '
        'live counts.',
        const [
          ChatAction.ask('Open spots right now'),
          ChatAction.ask('Where should I park?'),
        ],
      );

  ChatReply _allBuildings() => ChatReply(
        'I know ${places.map((p) => '${p.buildings.length} at '
            '${p.nickname}').join(' and ')}. Type a building\'s name or code '
        "and I'll find you parking for it, or pick one of these:",
        _buildingExamples(),
      );

  /// Every Smart Curb in a lot, reporting or not.
  Future<ChatReply> _curbCount() async {
    final lines = <String>[];
    var total = 0;
    var online = 0;
    for (final place in places.where((p) => p.liveParking)) {
      final lots = await data.lots(place);
      for (final l in lots.values) {
        final units = (l['units'] as List?) ?? const [];
        if (units.isEmpty) continue;
        total += units.length;
        online += units.where((u) => (u as Map)['online'] == true).length;
        lines.add('• ${place.nickname} ${l['name']}: ${units.length} '
            'curb${units.length == 1 ? '' : 's'}');
      }
    }
    if (total == 0) {
      return const ChatReply(
        'No Smart Curbs are reporting right now.',
        [ChatAction.ask('How does Smart Curb work?')],
      );
    }
    return ChatReply(
      'There ${total == 1 ? 'is 1 Smart Curb' : 'are $total Smart Curbs'} '
      'installed right now ($online online):\n${lines.join('\n')}',
      const [
        ChatAction.ask('Open spots right now'),
        ChatAction.ask('How does Smart Curb work?'),
      ],
    );
  }

  /// The sensored lot with the most open spots.
  Future<ChatReply> _emptiestLot() async {
    ({Place place, Map<String, dynamic> lot, int free, int total})? best;
    for (final place in places.where((p) => p.liveParking)) {
      final lots = await data.lots(place);
      for (final l in lots.values) {
        if (l['sensors'] != true) continue;
        final total = l['capacity'] as int;
        final free = total - (l['occupied'] as int);
        if (best == null || free > best.free) {
          best = (place: place, lot: l, free: free, total: total);
        }
      }
    }
    const actions = [
      ChatAction.ask('Where should I park?'),
      ChatAction.ask('Open spots right now'),
    ];
    if (best == null || best.free == 0) {
      return const ChatReply(
        'Bad luck right now: '
        "None of the lots with Smart Curbs has an open spot right now, and "
        "I can't see inside the lots without sensors. I'd give it a few "
        'minutes and check again.',
        actions,
      );
    }
    return ChatReply(
      'Right now ${best.place.nickname} ${best.lot['name']} has the most '
      'open spots: ${best.free} of ${best.total}. The emptiest lot isn\'t '
      "always the closest, though: tell me the building you're going to "
      "and I'll find the best lot for it.",
      actions,
    );
  }

  Future<ChatReply> _parkFor(Place place, PlaceBuilding building) async {
    final lots = await data.lots(place);
    final best = bestParkingFor(place, building, lots);
    final where = '${building.name} at ${place.nickname}';
    final actions = [
      ChatAction.navigate('Navigate there', place, building),
      const ChatAction.ask('Open spots right now'),
    ];
    if (best == null) {
      return ChatReply(
        "Sorry, there are no available parking lots for $where at this "
        "moment: every lot nearby is either full or has no Smart Curb "
        "sensors yet. I'd give it a few minutes and check again.",
        actions,
      );
    }
    final lot = lots[best.lotId];
    final lotName = lot?['name'] ?? prettyLotName(best.lotId);
    final free = lot == null ? null : lotFreeText(lot);
    final walk = formatDistance(best.totalDistanceMeters);
    final spot = best.unitId != null
        ? 'curb ${best.unitId} in $lotName'
        : lotName.toString();
    final count = free == null ? '' : ' ($free right now)';
    return ChatReply(
      _pick('parkfor', [
        'Heading to $where? Your best bet is $spot$count. '
            "It's about a $walk walk from there to the door. "
            "Tap Navigate there and I'll guide you in.",
        "For $where, I'd park at $spot$count. "
            "That's about a $walk walk. Tap Navigate there whenever you're "
            'ready.',
        'For $where, your best spot is $spot$count, about a $walk walk '
            "away. Tap Navigate there and I'll take you right to it.",
      ]),
      actions,
    );
  }

  /// One curb's live status ("c-077" or "c077"), or null if no place has it.
  Future<ChatReply?> _curbStatus(String typed) async {
    final id = 'C-${typed.replaceAll(RegExp(r'[^0-9]'), '')}';
    for (final place in places.where((p) => p.liveParking)) {
      final lots = await data.lots(place);
      for (final l in lots.values) {
        for (final u in (l['units'] as List?) ?? const []) {
          if ((u as Map)['id'] != id) continue;
          final where = '$id in ${l['name']}';
          final String text;
          if (u['online'] != true) {
            text = "Sorry, $where is offline right now, so I can't tell if "
                'its spot is free.';
          } else if (u['occupied'] == true) {
            text = "Sorry, $where is taken right now. Want me to find you "
                'another spot?';
          } else {
            text = 'Good news! $where is open right now. Hurry before '
                'someone takes it!';
          }
          return ChatReply(text, const [
            ChatAction.ask('Where should I park?'),
            ChatAction.ask('Open spots right now'),
          ]);
        }
      }
    }
    return ChatReply(
      "Hmm, I couldn't find a curb called $id. Curb numbers look like "
      'C-077 and are shown on the map next to each space.',
      const [ChatAction.ask('Which lots have Smart Curbs?')],
    );
  }

  /// The walk from one lot to [building], along the real walking paths.
  ChatReply _lotToBuilding(
      Place place, String lotId, String label, PlaceBuilding building) {
    final from = place.lotPositions[lotId]!;
    final path = place.pathfinder.findPath(from, building.position);
    final meters = path.length >= 2
        ? Geo.pathLength(path)
        : Geo.meters(from, building.position);
    return ChatReply(
      'From $label to ${building.name}, it\'s about a '
      '${formatDistance(meters)} walk along the paths. Want the best spot '
      'for it instead? Tap below and I\'ll find it.',
      [
        ChatAction.ask('Best spot for ${building.code}',
            'Where should I park for ${building.code}?'),
        ChatAction.ask('Is $label full?'),
      ],
    );
  }

  Future<ChatReply> _lotStatus(Place place, String lotId, String label) async {
    final lots = await data.lots(place);
    final lot = lots[lotId];
    if (lot == null) {
      return ChatReply(
        "Hmm, I couldn't find $label at ${place.nickname}. You can see all "
        'its lots on the map.',
        const [ChatAction.ask('Open spots right now')],
      );
    }
    final name = lot['name'];
    if (lot['sensors'] == false) {
      final live = [
        for (final l in lots.values)
          if (l['sensors'] == true) l['name'],
      ];
      return ChatReply(
        "Sorry, $name doesn't have Smart Curb sensors yet, so I can't see "
        'its spaces. ${live.isEmpty ? '' : 'I do have live counts for ${live.join(', ')}, though.'}'
            .trim(),
        const [ChatAction.ask('Open spots right now')],
      );
    }
    final total = lot['capacity'] as int;
    final occupied = lot['occupied'] as int;
    final free = total - occupied;
    final offline = (lot['units'] as List)
        .where((u) => (u as Map)['online'] != true)
        .length;
    final offlineNote =
        offline == 0 ? '' : ' ($offline curb${offline == 1 ? ' is' : 's are'} offline.)';
    if (total == 0) {
      return ChatReply(
        "Sorry, $name's curbs aren't reporting right now, so I can't tell "
        'how many spots are open.',
        const [ChatAction.ask('Open spots right now')],
      );
    }
    if (free == 0) {
      return ChatReply(
        'Bad news, $name is full right now: all $total sensored spots are '
        "taken.$offlineNote Tell me where you're going and I'll find you "
        'another lot.',
        const [ChatAction.ask('Where should I park?')],
      );
    }
    return ChatReply(
      '${free == 1 ? 'Good news, but hurry! ' : 'Good news! '}$name has '
      '$free of $total sensored spots open right now.$offlineNote',
      const [ChatAction.ask('Where should I park?')],
    );
  }

  Future<ChatReply> _openSpots(_Message m) async {
    final onlyMall = m.anyPhrase(_browardWords);
    final lines = <String>[];
    for (final place in places) {
      if (onlyMall && place.liveParking) continue;
      if (!place.liveParking) {
        lines.add(
            '• ${place.nickname}: no Smart Curb sensors yet, so no '
            'available parking to guide you to.');
        continue;
      }
      final lots = await data.lots(place);
      final live = lots.values.where((l) => l['sensors'] == true).toList()
        ..sort((a, b) => '${a['name']}'.compareTo('${b['name']}'));
      if (live.isEmpty) {
        lines.add('• ${place.nickname}: no curbs are reporting right now.');
        continue;
      }
      for (final l in live) {
        final total = l['capacity'] as int;
        final free = total - (l['occupied'] as int);
        lines.add(total == 0
            ? '• ${place.nickname} ${l['name']}: curbs offline'
            : '• ${place.nickname} ${l['name']}: $free of $total open');
      }
    }
    return ChatReply(
      "Here's what the Smart Curb sensors see right now:\n"
      '${lines.join('\n')}\n'
      "Lots without sensors still show on the map. Tell me where you're "
      "headed and I'll pick the best lot for you.",
      const [ChatAction.ask('Where should I park?')],
    );
  }

  ChatReply _whichBuilding(List<_Hit> candidates) {
    _awaitingBuilding = true;
    return ChatReply(
      'A few buildings match that. Which one do you mean?',
      [
        for (final c in candidates.take(4))
          ChatAction.ask(c.building.name, 'Park near ${c.building.name}'),
      ],
    );
  }

  List<ChatAction> _buildingExamples() => [
        for (final p in places)
          for (final b in p.buildings.take(2))
            ChatAction.ask(b.code, 'Park near ${b.name}'),
      ];

  // ---- vehicles: list, add, change, delete ----

  /// Same fields (and keys) as the Vehicle tab's "Add New Vehicle" form.
  static const List<ChatFormField> _carFields = [
    ChatFormField('manufacturer', 'Manufacturer',
        hint: 'e.g. Toyota', icon: Icons.factory_outlined),
    ChatFormField('model', 'Model',
        hint: 'e.g. RAV 4', icon: Icons.directions_car_outlined, required: true),
    ChatFormField('plate', 'License plate',
        hint: 'e.g. S108123', icon: Icons.pin_outlined, required: true),
    ChatFormField('year', 'Year',
        hint: 'e.g. 2024',
        icon: Icons.calendar_today_outlined,
        keyboard: TextInputType.number),
    ChatFormField('color', 'Color',
        hint: 'e.g. Silver', icon: Icons.palette_outlined),
  ];

  static const List<ChatAction> _afterCar = [
    ChatAction.ask('My vehicles'),
    ChatAction.tab('Go to Vehicles', kVehicleTab),
    ChatAction.ask('Where should I park?'),
  ];

  static String _v(Map<String, dynamic> m, String k) =>
      m[k]?.toString().trim() ?? '';

  /// "Toyota Camry (plate OWL123)".
  static String _carName(Map<String, dynamic> c) {
    final title = [_v(c, 'manufacturer'), _v(c, 'model')]
        .where((s) => s.isNotEmpty)
        .join(' ');
    final plate = _v(c, 'plate');
    return '${title.isEmpty ? 'vehicle' : title}'
        '${plate.isEmpty ? '' : ' (plate $plate)'}';
  }

  /// A car as a choice: "Toyota Camry · OWL123".
  static String _carChoice(Map<String, dynamic> c) => [
        [_v(c, 'manufacturer'), _v(c, 'model')]
            .where((s) => s.isNotEmpty)
            .join(' '),
        _v(c, 'plate'),
      ].where((s) => s.isNotEmpty).join(' · ');

  /// The cars [m] names, by plate, model or make ("delete my camry").
  static List<Map<String, dynamic>> _carsNamed(
      _Message m, List<Map<String, dynamic>> cars) {
    final bare = m.tokens.join();
    bool names(Map<String, dynamic> c) {
      final plate = _v(c, 'plate').toLowerCase().replaceAll(RegExp('[^a-z0-9]'), '');
      if (plate.length >= 3 && bare.contains(plate)) return true;
      for (final k in ['model', 'manufacturer']) {
        final words = _Message(_v(c, k)).tokens.where((t) => t.length >= 3);
        if (words.isNotEmpty && words.every(m.tokens.contains)) return true;
      }
      return false;
    }

    return [for (final c in cars) if (names(c)) c];
  }

  static String? _checkYear(Map<String, String> v) {
    final year = (v['year'] ?? '').trim();
    if (year.isEmpty) return null;
    final y = int.tryParse(year);
    if (y == null || year.length != 4 || y < 1900 || y > DateTime.now().year + 1) {
      return 'The year should be 4 digits, like 2024.';
    }
    return null;
  }

  /// The add form, or [car]'s details to change.
  ChatForm _carForm([Map<String, dynamic>? car]) => ChatForm(
        fields: _carFields,
        initial: {
          if (car != null)
            for (final f in _carFields) f.key: _v(car, f.key),
        },
        submitLabel: car == null ? 'Add vehicle' : 'Save changes',
        validate: _checkYear,
        onSubmit: (values) async {
          final clean = {
            for (final f in _carFields) f.key: (values[f.key] ?? '').trim(),
          };
          if (car == null) {
            await data.addVehicle(clean);
            return ChatReply(
              'Done! I added your ${_carName(clean)} to your vehicles. '
              'Anything else I can help you with?',
              _afterCar,
            );
          }
          await data.updateVehicle(car['id'].toString(), clean);
          return ChatReply(
            'Done! I changed your ${_carName(clean)}. Anything else I can '
            'help you with?',
            _afterCar,
          );
        },
      );

  ChatReply _addCar() => ChatReply.form(
        "Sure! Fill in your car's details below and press Enter (or Add "
        'vehicle) to add it.',
        _carForm(),
      );

  ChatReply _changeCar(Map<String, dynamic> car) => ChatReply.form(
        "Here's your ${_carName(car)}. Change anything below and press "
        'Enter (or Save changes) to update it.',
        _carForm(car),
      );

  ChatReply _confirmDeleteCar(Map<String, dynamic> car) => ChatReply(
        'Delete your ${_carName(car)}? This can\'t be undone.',
        [
          ChatAction.run('Yes, delete it', () async {
            await data.deleteVehicle(car['id'].toString());
            return ChatReply(
              'Done! I deleted your ${_carName(car)}. Anything else I can '
              'help you with?',
              _afterCar,
            );
          }),
          ChatAction.run('No, keep it', () async => _nothingChanged),
        ],
      );

  ChatReply _confirmDeleteAllCars(List<Map<String, dynamic>> cars) => ChatReply(
        'Delete all ${cars.length} of your vehicles? This can\'t be undone.',
        [
          ChatAction.run('Yes, delete them all', () async {
            for (final c in cars) {
              await data.deleteVehicle(c['id'].toString());
            }
            return ChatReply(
              'Done! I deleted all ${cars.length} vehicles. Anything else I '
              'can help you with?',
              const [ChatAction.ask('Add a vehicle')],
            );
          }),
          ChatAction.run('No, keep them', () async => _nothingChanged),
        ],
      );

  /// One of [cars] to pick, then [then] with it.
  ChatReply _pickCar(String question, List<Map<String, dynamic>> cars,
          ChatReply Function(Map<String, dynamic> car) then) =>
      ChatReply(question, [
        for (final c in cars) ChatAction.run(_carChoice(c), () async => then(c)),
        ChatAction.run('Cancel', () async => _nothingChanged),
      ]);

  Future<ChatReply> _vehicles(_Message m) async {
    // "I sold my car" means it should go.
    final removing = m.any(_removeWords) ||
        m.has({'sold', 'totaled', 'scrapped', 'traded'}) ||
        m.anyPhrase(['got rid of', 'no longer have', 'dont have it anymore',
          'dont own']);
    final changing = !removing && m.has(_editWords);
    final adding = !removing &&
        !changing &&
        (m.any(_addWords) || m.has({'another', 'second', 'register'}));
    if (adding && m.hasPhrase('how many')) {
      return const ChatReply(
        'As many as you like! There\'s no limit on vehicles. Want to add '
        'one now?',
        [ChatAction.ask('Add a vehicle'), ChatAction.ask('My vehicles')],
      );
    }
    if (adding) return _addCar();

    final cars = await data.vehicles();
    if (removing || changing) {
      if (cars.isEmpty) {
        return ChatReply(
          "You don't have any vehicles yet, so there's nothing to "
          '${removing ? 'delete' : 'change'}. Want to add one?',
          [
            ChatAction.run('Yes, add a vehicle', () async => _addCar()),
            ChatAction.run('No, not now', () async => _nothingChanged),
          ],
        );
      }
      final named = _carsNamed(m, cars);
      if (removing) {
        if (m.has({'all', 'every', 'everything'}) && cars.length > 1) {
          return _confirmDeleteAllCars(cars);
        }
        if (named.length == 1) return _confirmDeleteCar(named.single);
        if (cars.length == 1) return _confirmDeleteCar(cars.single);
        return _pickCar('Which vehicle do you want to delete?',
            named.isEmpty ? cars : named, _confirmDeleteCar);
      }
      if (named.length == 1) return _changeCar(named.single);
      if (cars.length == 1) return _changeCar(cars.single);
      return _pickCar('Which vehicle do you want to change?',
          named.isEmpty ? cars : named, _changeCar);
    }

    // "What's my license plate?": just the plates.
    if (m.has({'plate', 'plates', 'license'}) && cars.isNotEmpty) {
      final withPlates = [for (final c in cars) if (_v(c, 'plate').isNotEmpty) c];
      if (withPlates.isNotEmpty) {
        String title(Map<String, dynamic> c) {
          final t = [_v(c, 'manufacturer'), _v(c, 'model')]
              .where((s) => s.isNotEmpty)
              .join(' ');
          return t.isEmpty ? 'car' : t;
        }

        return ChatReply(
          withPlates.length == 1
              ? "Your ${title(withPlates.single)}'s plate is "
                  '${_v(withPlates.single, 'plate')}.'
              : 'Your plates:\n${[
                  for (final c in withPlates) '• ${title(c)}: ${_v(c, 'plate')}',
                ].join('\n')}',
          const [
            ChatAction.ask('Change a vehicle'),
            ChatAction.ask('My vehicles'),
          ],
        );
      }
    }
    if (cars.isEmpty) {
      return ChatReply(
        "You haven't added a vehicle yet. Want to add one now?",
        [
          ChatAction.run('Yes, add a vehicle', () async => _addCar()),
          ChatAction.run('No, not now', () async => _nothingChanged),
        ],
      );
    }
    String describe(Map<String, dynamic> c) {
      final title = [_v(c, 'manufacturer'), _v(c, 'model')]
          .where((s) => s.isNotEmpty)
          .join(' ');
      final extra = [_v(c, 'year'), _v(c, 'color')].where((s) => s.isNotEmpty);
      final plate = _v(c, 'plate');
      return '• ${title.isEmpty ? 'Vehicle' : title}'
          '${extra.isEmpty ? '' : ' (${extra.join(', ')})'}'
          '${plate.isEmpty ? '' : ', plate $plate'}';
    }

    return ChatReply(
      'You have ${cars.length} vehicle${cars.length == 1 ? '' : 's'}:\n'
      '${cars.map(describe).join('\n')}',
      const [
        ChatAction.ask('Add a vehicle'),
        ChatAction.ask('Change a vehicle'),
        ChatAction.ask('Delete a vehicle'),
        ChatAction.tab('Go to Vehicles', kVehicleTab),
      ],
    );
  }

  // ---- places on Home: list, add, remove, open ----

  /// Every place, which are on the user's Home, and a chip for each: open
  /// the ones they have, add the others.
  Future<ChatReply> _places(_Message m, {String lead = ''}) async {
    final saved = await data.savedPlaceIds();
    final mine = [for (final p in places) if (saved.contains(p.id)) p];
    final lines = [
      for (final p in places)
        '• ${p.fullName}: ${saved.contains(p.id) ? 'on your Home ✓' : 'not added yet'}'
            ' (${p.address})',
    ];
    return ChatReply(
      '$lead${mine.isEmpty ? "You haven't added any places yet. " : ''}'
      'Smart Curb works at ${places.length} places right now:\n'
      '${lines.join('\n')}\n'
      '${mine.length == places.length ? "You've added them all. " : ''}'
      'Tap one to ${mine.isEmpty ? 'add it' : 'open its map or add it'}.',
      [
        for (final p in places)
          saved.contains(p.id)
              ? ChatAction.openPlace('Open ${p.nickname}', p)
              : ChatAction.run('Add ${p.nickname}', () => _addPlace(p)),
        if (mine.isNotEmpty)
          ChatAction.run('Remove a place', () => _removePlaceFlow(null)),
      ],
    );
  }

  /// FAU, Broward Mall... named in [m] ("add broward again").
  Place? _placeNamed(_Message m) {
    Place? found;
    for (final p in places) {
      if (_aliases(p).any(m.tokens.contains) ||
          m.hasPhrase(p.fullName.toLowerCase())) {
        if (found != null) return null; // both named: not one place
        found = p;
      }
    }
    return found;
  }

  /// Words that name [place]: "fau", "florida", "boca"; "broward", "mall".
  static Set<String> _aliases(Place place) => {
        for (final w in '${place.shortName} ${place.nickname} '
                '${place.fullName} ${place.areaName}'
            .toLowerCase()
            .split(RegExp('[^a-z0-9]+')))
          if (w.length >= 3 && !_genericPlaceWords.contains(w)) w,
      };
  static const _genericPlaceWords = {
    'university', 'main', 'campus', 'the', 'and', 'college', 'raton',
  };

  /// Adding, removing, opening or asking about a place on Home; null when
  /// [m] is about something else.
  Future<ChatReply?> _placeCommand(_Message m) async {
    // "My car" / "my phone" questions; "parking at FAU" is about parking.
    if (m.any(_vehicleWords) || m.has(_profileOnlyWords)) return null;
    final place = _placeNamed(m);
    final aboutPlaces = m.any(_placeWords) ||
        m.anyPhrase(['home page', 'homepage', 'my home', 'on home']);
    if (place == null && !aboutPlaces) return null;

    // "Add Broward again, I accidentally deleted it".
    final restore = m.has(_restoreWords);
    final removing = !restore && m.has(_removeWords);
    final adding = restore ||
        m.has({..._addWords, 'pin', 'deleted', 'removed'}) ||
        m.anyPhrase(['put back', 'bring back']);
    final all = m.has({'all', 'every', 'everything', 'both'});

    if (m.any(_parkWords) && !removing && !adding) return null;
    // "How many places can I add?", "my place disappeared!"
    if (m.hasPhrase('how many') && !removing) {
      return _places(m, lead: 'You can add every place Smart Curb works at. ');
    }
    if (m.has({'disappeared', 'gone', 'missing', 'vanished', 'lost'}) &&
        !removing) {
      return _places(m, lead: "Let's take a look! ");
    }
    if (removing) return _removePlaceFlow(place, all: all);
    if (adding && place == null) {
      // "Add my home address": not a Smart Curb place.
      if (m.anyPhrase(['home address', 'my address', 'my house',
        'my work', 'my office', 'my job', 'my apartment', 'my dorm'])) {
        return const ChatReply(
          'I can only add places Smart Curb works at (FAU and Broward Mall '
          "for now), so your own address can't be one. You can save your "
          'home address in your contact info, though!',
          [
            ChatAction.ask('Change my contact information'),
            ChatAction.ask('My saved places'),
          ],
        );
      }
      // "Add the Miami campus": a place Smart Curb doesn't know.
      final unknown = [
        for (final t in m.tokens)
          if (t.length >= 3 &&
              !known.contains(t) &&
              !_commonWords.contains(t) &&
              !RegExp(r'^\d+$').hasMatch(t))
            t,
      ];
      if (unknown.isNotEmpty) {
        final name = unknown
            .map((w) => '${w[0].toUpperCase()}${w.substring(1)}')
            .join(' ');
        final saved = await data.savedPlaceIds();
        final missing = [for (final p in places) if (!saved.contains(p.id)) p];
        return ChatReply(
          "Sorry, Smart Curb doesn't work at $name yet. Right now it works "
          'at ${places.map((p) => p.fullName).join(' and ')}'
          '${missing.isEmpty ? ", and you've already added them all." : '. Want to add one of those?'}',
          [
            for (final p in missing)
              ChatAction.run('Add ${p.nickname}', () => _addPlace(p)),
            const ChatAction.ask('My saved places'),
          ],
        );
      }
    }
    if (adding) return _addPlaceFlow(place, all: all);
    if (place == null) return null;
    // "Is the mall open?" is about opening hours, not opening its map.
    if (m.has({'hours', 'closes', 'closing'}) ||
        RegExp(r'\b(is|are) (the |it )?[a-z ]*open\b').hasMatch(m.text)) {
      return null;
    }
    // "Take me to the library at FAU": that's about the library.
    final rest = _Message(
        m.tokens.where((t) => !_aliases(place).contains(t)).join(' '));
    if (_index.find(rest).unique != null) return null;

    final opening = (m.has({'open', 'launch', 'show', 'view', 'see'}) &&
            !m.has(_spotQuestion) &&
            !m.has(_colorWords)) ||
        m.has(_mapWords) ||
        m.anyPhrase(['take me', 'go to', 'bring me', 'want to go', 'head to']);
    if (opening) {
      return ChatReply.opening(
        'Opening the ${place.nickname} map...',
        ChatAction.openPlace('Open ${place.nickname} map', place),
        [ChatAction.openPlace('Open ${place.nickname} map', place)],
      );
    }
    if (m.has({'address', 'located', 'where'}) || m.hasPhrase('location of')) {
      return ChatReply(
        '${place.fullName} is at ${place.address}.',
        [ChatAction.openPlace('Open ${place.nickname} map', place)],
      );
    }
    if (m.has({'added', 'saved', 'have', 'got', 'listed'})) {
      final saved = await data.savedPlaceIds();
      if (saved.contains(place.id)) {
        return ChatReply(
          'Yes, ${place.fullName} is on your Home.',
          [ChatAction.openPlace('Open ${place.nickname} map', place)],
        );
      }
      return ChatReply(
        "No, ${place.fullName} isn't on your Home yet. Want me to add it?",
        [
          ChatAction.run('Yes, add it', () => _addPlace(place)),
          ChatAction.run('No, thanks', () async => _nothingChanged),
        ],
      );
    }
    return null;
  }

  /// Everyday words around a request ("can you add the ... for me please"),
  /// so the rest can be checked against the places Smart Curb knows.
  static const _commonWords = {
    'can', 'could', 'would', 'will', 'you', 'please', 'want', 'like', 'the',
    'for', 'and', 'into', 'with', 'that', 'this', 'there', 'here', 'also',
    'just', 'one', 'more', 'some', 'any', 'let', 'lets', 'how', 'what',
    'where', 'which', 'help', 'pls', 'plz', 'hey', 'hello', 'need', 'too',
    'list', 'page', 'homepage', 'home', 'screen', 'app', 'thanks', 'thank',
    'okay', 'now', 'again', 'back', 'accidentally', 'accidently', 'mistake',
    'my', 'our', 'your', 'its', 'are', 'was', 'have', 'has', 'had', 'did',
    'does', 'get', 'put', 'pin', 'wanna', 'should', 'all', 'both',
    'other', 'another', 'favorite', 'favourite', 'favorites', 'favourites',
    'deleted', 'removed', 'smart', 'curb', 'ai', 'chat', 'bot', 'agent',
    'possible', 'able', 'through',
  };

  static const _restoreWords = {
    'again', 'back', 'restore', 'undo', 'accidentally', 'accidently',
    'accident', 'mistake', 'readd', 're',
  };

  /// Words about the profile, so "change my address" isn't about places.
  static const _profileOnlyWords = {
    'profile', 'account', 'name', 'phone', 'email', 'contact', 'gender',
    'zip', 'city', 'state', 'country',
  };

  Future<ChatReply> _addPlace(Place place) async {
    final added = await data.savePlace(place);
    return ChatReply(
      added
          ? 'Done! I added ${place.fullName} to your places on Home. Anything '
              'else I can help you with?'
          : '${place.fullName} is already on your Home.',
      [
        ChatAction.openPlace('Open ${place.nickname} map', place),
        const ChatAction.tab('Go to Home', kHomeTab),
      ],
    );
  }

  Future<ChatReply> _addPlaceFlow(Place? place, {bool all = false}) async {
    if (place != null) return _addPlace(place);
    final saved = await data.savedPlaceIds();
    final missing = [for (final p in places) if (!saved.contains(p.id)) p];
    if (missing.isEmpty) {
      return ChatReply(
        "You've already added every place Smart Curb works at "
        '(${places.map((p) => p.nickname).join(' and ')}).',
        [
          for (final p in places)
            ChatAction.openPlace('Open ${p.nickname}', p),
        ],
      );
    }
    Future<ChatReply> addAll() async {
      for (final p in missing) {
        await data.savePlace(p);
      }
      return ChatReply(
        'Done! I added ${missing.map((p) => p.fullName).join(' and ')} to '
        'your places on Home. Anything else I can help you with?',
        const [ChatAction.tab('Go to Home', kHomeTab)],
      );
    }

    if (all) return addAll();
    return ChatReply('Sure! Which place do you want to add?', [
      for (final p in missing)
        ChatAction.run('Add ${p.nickname}', () => _addPlace(p)),
      if (missing.length > 1) ChatAction.run('Add all', addAll),
      ChatAction.run('Cancel', () async => _nothingChanged),
    ]);
  }

  ChatReply _confirmRemovePlace(Place place) => ChatReply(
        'Remove ${place.fullName} from your Home? You can add it back any '
        'time.',
        [
          ChatAction.run('Yes, remove it', () async {
            await data.removePlace(place);
            return ChatReply(
              'Done! I removed ${place.fullName} from your Home. Anything '
              'else I can help you with?',
              [
                ChatAction.run('Add it back', () => _addPlace(place)),
                const ChatAction.tab('Go to Home', kHomeTab),
              ],
            );
          }),
          ChatAction.run('No, keep it', () async => _nothingChanged),
        ],
      );

  Future<ChatReply> _removePlaceFlow(Place? place, {bool all = false}) async {
    final saved = await data.savedPlaceIds();
    final mine = [for (final p in places) if (saved.contains(p.id)) p];
    if (mine.isEmpty) {
      return ChatReply(
        "You don't have any places on Home to remove.",
        [ChatAction.run('Add a place', () => _addPlaceFlow(null))],
      );
    }
    if (place != null) {
      if (!mine.contains(place)) {
        return ChatReply(
          "${place.fullName} isn't on your Home, so there's nothing to "
          'remove.',
          const [ChatAction.ask('My saved places')],
        );
      }
      return _confirmRemovePlace(place);
    }
    if (all && mine.length > 1) {
      return ChatReply(
        'Remove all ${mine.length} places from your Home? You can add them '
        'back any time.',
        [
          ChatAction.run('Yes, remove them all', () async {
            for (final p in mine) {
              await data.removePlace(p);
            }
            return ChatReply(
              'Done! I removed all your places from Home. Anything else I '
              'can help you with?',
              [ChatAction.run('Add a place', () => _addPlaceFlow(null))],
            );
          }),
          ChatAction.run('No, keep them', () async => _nothingChanged),
        ],
      );
    }
    return ChatReply('Which place do you want to remove from Home?', [
      for (final p in mine)
        ChatAction.run(p.nickname, () async => _confirmRemovePlace(p)),
      ChatAction.run('Cancel', () async => _nothingChanged),
    ]);
  }

  // ---- contact info: show, fill in, change ----

  /// Same fields (and keys) as the Profile tab's contact form.
  static const List<ChatFormField> _contactFields = [
    ChatFormField('firstName', 'First name',
        icon: Icons.person_outline, required: true),
    ChatFormField('lastName', 'Last name',
        icon: Icons.person_outline, required: true),
    ChatFormField('middleName', 'Middle name (optional)',
        icon: Icons.badge_outlined),
    ChatFormField('phone', 'Phone number',
        hint: 'xxx-xxx-xxxx',
        icon: Icons.phone_outlined,
        keyboard: TextInputType.phone,
        phone: true,
        required: true),
    ChatFormField('gender', 'Gender',
        required: true, options: ['Male', 'Female', 'Other']),
    ChatFormField('address1', 'Address line 1',
        icon: Icons.home_outlined, required: true),
    ChatFormField('address2', 'Address line 2 (optional)',
        icon: Icons.home_outlined),
    ChatFormField('city', 'City',
        icon: Icons.location_city_outlined, required: true),
    ChatFormField('state', 'State', icon: Icons.map_outlined, required: true),
    ChatFormField('zipCode', 'Zip code',
        icon: Icons.markunread_mailbox_outlined,
        keyboard: TextInputType.number,
        required: true),
    ChatFormField('country', 'Country', icon: Icons.public, required: true),
  ];

  static const List<ChatAction> _afterProfile = [
    ChatAction.ask('My profile'),
    ChatAction.tab('Go to Profile', kProfileTab),
  ];

  static bool _filledIn(Map<String, dynamic>? p) =>
      p != null && _v(p, 'firstName').isNotEmpty;

  static String _fullName(Map<String, dynamic> p) =>
      [_v(p, 'firstName'), _v(p, 'middleName'), _v(p, 'lastName')]
          .where((s) => s.isNotEmpty)
          .join(' ');

  /// The contact form, filled with [p] if there is one.
  ChatForm _contactForm(Map<String, dynamic>? p, {String? focus}) {
    final isNew = !_filledIn(p);
    return ChatForm(
      fields: _contactFields,
      initial: {
        if (p != null)
          for (final f in _contactFields) f.key: _v(p, f.key),
      },
      submitLabel: 'Save',
      focus: focus,
      validate: (v) =>
          (v['phone'] ?? '').replaceAll(RegExp(r'\D'), '').length == 10
              ? null
              : 'Please enter a 10-digit phone number.',
      summary: (v) => [
        _fullName(v),
        formatPhone(v['phone'] ?? ''),
        [v['city'], v['state']]
            .where((s) => (s ?? '').trim().isNotEmpty)
            .join(', '),
      ].where((s) => s.trim().isNotEmpty).join(' · '),
      onSubmit: (values) async {
        await data.saveProfile({
          for (final f in _contactFields) f.key: (values[f.key] ?? '').trim(),
        });
        _nameLoaded = false; // greet them by their (new) name from now on
        return ChatReply(
          'Done! I ${isNew ? 'saved' : 'changed'} your contact information. '
          'Anything else I can help you with?',
          _afterProfile,
        );
      },
    );
  }

  ChatReply _fillProfileNow() => ChatReply.form(
        'Great! Fill in the form below and press Enter (or Save) when '
        "you're done. Fields marked * are required.",
        _contactForm(null),
      );

  static const _fillProfileLater = ChatReply(
    'No problem! To fill it in later, open the Profile tab, tap the '
    '"Profile Incomplete" card, fill in the form and tap Confirm. Or just '
    'ask me any time and we can do it here.',
    [ChatAction.tab('Go to Profile', kProfileTab)],
  );

  ChatReply _askToFillProfile() => ChatReply(
        "Sorry, you didn't fill in your contact information yet"
        "${data.email == null ? '' : " (you're signed in as ${data.email})"}. "
        'Do you want to do it now?',
        [
          ChatAction.run('Yes, fill it in now', () async => _fillProfileNow()),
          ChatAction.run('No, maybe later', () async => _fillProfileLater),
        ],
      );

  /// Where to start typing in the form ("change my phone number").
  static String? _profileFocus(_Message m) {
    if (m.has({'phone', 'number', 'cell', 'mobile'})) return 'phone';
    if (m.has({'address', 'street', 'city', 'state', 'zip', 'country'})) {
      return 'address1';
    }
    if (m.has({'name', 'first', 'last'})) return 'firstName';
    return null;
  }

  Future<ChatReply> _profile(_Message m) async {
    final p = await data.profile();
    if (!_filledIn(p)) return _askToFillProfile();
    if (m.any(_removeWords)) {
      return ChatReply(
        "Your contact info can't be removed, since parts of it are required "
        'for your account, but you can change any of it. Want to update it '
        'now?',
        [
          ChatAction.run('Yes, update it', () async => ChatReply.form(
                'Change anything below and press Enter (or Save) to update '
                'it.',
                _contactForm(p),
              )),
          ChatAction.run('No, keep it', () async => _nothingChanged),
        ],
      );
    }
    final wants = m.any(_editWords) ||
        m.any(_addWords) ||
        m.has({'complete', 'finish'}) ||
        m.anyPhrase(['fill in', 'fill out', 'set up']);
    if (wants) {
      return ChatReply.form(
        "Here's your contact information now. Change anything below and "
        'press Enter (or Save) to update it.',
        _contactForm(p, focus: _profileFocus(m)),
      );
    }
    final email = data.email;
    final phone = _v(p!, 'phone');
    final address = [
      _v(p, 'address1'),
      _v(p, 'address2'),
      _v(p, 'city'),
      [_v(p, 'state'), _v(p, 'zipCode')].where((s) => s.isNotEmpty).join(' '),
      _v(p, 'country'),
    ].where((s) => s.isNotEmpty).join(', ');
    // "What's my phone number?": just that, not the whole profile.
    final asked = <String, String>{
      if (m.has({'address', 'live', 'city', 'zip'}) && address.isNotEmpty)
        'address1': 'Your address is $address.',
      if (m.has({'phone', 'number', 'cell', 'mobile'}) && phone.isNotEmpty)
        'phone': 'Your phone number is ${formatPhone(phone)}.',
      if (m.has({'name'}))
        'name': 'Your name is ${_fullName(p)}.',
      if (m.has({'email', 'mail'}) && email != null)
        'email': 'Your email is $email. It\'s also your login.',
      if (m.has({'gender'}) && _v(p, 'gender').isNotEmpty)
        'gender': 'You entered your gender as ${_v(p, 'gender')}.',
    };
    if (asked.length == 1) {
      final field = asked.keys.single;
      return ChatReply(
        asked.values.single,
        [
          if (field != 'email')
            ChatAction.run('Change it', () async => ChatReply.form(
                  'Sure! Change it below and press Enter (or Save).',
                  _contactForm(p, focus: field == 'name' ? 'firstName' : field),
                )),
          const ChatAction.ask('My profile'),
        ],
      );
    }
    return ChatReply(
      'Here is your contact information:\n'
      '• Name: ${_fullName(p)}\n'
      '${email == null ? '' : '• Email: $email\n'}'
      '${phone.isEmpty ? '' : '• Phone: ${formatPhone(phone)}\n'}'
      '${_v(p, 'gender').isEmpty ? '' : '• Gender: ${_v(p, 'gender')}\n'}'
      '${address.isEmpty ? '' : '• Address: $address\n'}'
      'Want to change anything?',
      [
        ChatAction.run('Change my info', () async => ChatReply.form(
              'Change anything below and press Enter (or Save) to update '
              'it.',
              _contactForm(p),
            )),
        const ChatAction.tab('Go to Profile', kProfileTab),
      ],
    );
  }

  ChatReply _colors() => const ChatReply(
        "Good question! Here's what the colors mean on the map:\n"
        '• Green space: the curb sees the spot is open\n'
        '• Red space: the spot is taken\n'
        '• Gray space: that curb is offline, so its spot is unknown\n'
        'Lot labels: green when under 70% full, amber at 70-90%, red at '
        '90% or more, and gray when the lot has no sensors. The lot I '
        'recommend gets a bright ring, and your target curb stands taller.',
        [ChatAction.ask('Open spots right now')],
      );

  ChatReply _navigationHelp() => const ChatReply(
        'Happy to walk you through it! '
        'To get directions: open a place from Home, then search for a '
        'building or tap it on the map. I pick the best lot (or open curb), '
        'draw the drive there, and once you park I show the walking path to '
        'the building. Tap the location button for turn-by-turn focus mode. '
        'Or just tell me the building and tap Navigate there.',
        [ChatAction.ask('Where should I park?')],
      );

  ChatReply _howItWorks() => const ChatReply(
        'Great question! '
        'Each Smart Curb replaces the concrete wheel stop at the front of a '
        'parking space. It senses whether a car is parked, shows the zone '
        'with a colored LED panel, and reports live, running on solar power. '
        'This app reads those reports to show open spots and send you to '
        'the closest lot (or exact curb) with space for where you are going.',
        [
          ChatAction.ask('Open spots right now'),
          ChatAction.ask('What do the colors mean?'),
        ],
      );

  // ---- lots named in a message ----

  /// The lot a message names ("lot 14", "garage II", "aqua lot"), found
  /// by its name in `lots/`. Its id is '' when the place has no such lot.
  Future<({Place place, String id, String label})?> _findLot(_Message m) async {
    final mall = m.anyPhrase(_browardWords);
    final fau = places.firstWhere((p) => p.liveParking, orElse: () => places.first);
    final broward =
        places.firstWhere((p) => !p.liveParking, orElse: () => places.last);
    final text = m.text;

    Future<({Place place, String id, String label})> named(
        Place place, String label) async {
      // "Lot 1" is Broward's "Broward Mall - Parking Lot 1"; "Lot 14" is
      // FAU's "Lot 14 — Blue Permit".
      final want = label.toLowerCase();
      for (final e in (await data.lots(place)).entries) {
        final name = shortLotName(e.value['name'].toString()).toLowerCase();
        if (name == want || name.endsWith(' $want')) {
          return (place: place, id: e.key, label: e.value['name'].toString());
        }
      }
      return (place: place, id: '', label: label);
    }

    final lotMatch =
        RegExp(r'\b(?:parking\s+)?lot\s*#?\s*(\d{1,3})\s*(n)?\b').firstMatch(text);
    if (lotMatch != null) {
      final n = int.parse(lotMatch.group(1)!);
      final suffix = lotMatch.group(2) ?? '';
      return named(mall ? broward : fau, 'Lot $n${suffix.toUpperCase()}');
    }
    final garage = RegExp(r'\bgarage\s*(\d|i{1,3}|one|two|three)\b')
        .firstMatch(text);
    if (garage != null) {
      const numbers = {
        'i': 1, 'ii': 2, 'iii': 3, 'one': 1, 'two': 2, 'three': 3, //
      };
      final g = garage.group(1)!;
      final n = int.tryParse(g) ?? numbers[g]!;
      return named(fau, 'Garage $n');
    }
    final lotName = RegExp(r'\b(aqua|copper)\s+lot\b').firstMatch(text);
    if (lotName != null) {
      final id = lotName.group(1)!;
      return named(fau, '${id[0].toUpperCase()}${id.substring(1)} Lot');
    }
    return null;
  }

  // ---- vocabulary ----

  static const _greetings = {
    'hi', 'hii', 'hey', 'heya', 'hello', 'helo', 'hallo', 'hai', 'hiya', 'yo',
    'sup', 'howdy', 'hola', 'greetings', 'morning', 'afternoon', 'evening',
    'good', 'there', 'whats', 'up', 'smart', 'curb', 'bot', 'ai', 'agent',
  };
  static const _greetingStarters = {
    'hi', 'hii', 'hey', 'heya', 'hello', 'helo', 'hallo', 'hai', 'hiya', 'yo',
    'sup', 'howdy', 'hola', 'greetings', 'morning', 'afternoon', 'evening',
  };
  static const _thanks = {
    'thanks', 'thank', 'thx', 'ty', 'thankyou', 'appreciate', 'appreciated',
    'cheers', 'tysm', 'thnx', 'thanx',
  };
  static const _bye = {
    'bye', 'goodbye', 'cya', 'farewell', 'goodnight', 'byee', 'byebye',
  };
  static const _byePhrases = [
    'see you', 'see ya', 'talk later', 'catch you later', 'good night',
    'night night', 'have a good day', 'have a nice day', 'gotta go',
    'got to go', 'im leaving', 'later',
  ];
  static const _help = {'help', 'menu', 'options', 'commands', 'start'};
  static const _howAreYou = [
    'how are you', 'how r u', 'how are u', 'how is it going',
    'hows it going', 'how you doing', 'how are things', 'how about you',
    'and you', 'hbu', 'wbu', 'what about you', 'how is your day',
    'hows your day', 'how was your day', 'how have you been',
  ];
  static const _whoAreYou = [
    'who are you', 'what are you', 'your name', 'are you real',
    'are you a bot', 'are you human', 'are you ai',
  ];
  static const _whatCanYouDo = [
    'what can you do', 'what do you do', 'what else', 'how can you help',
    'what can i ask', 'what should i ask',
  ];
  static const _helpOnly = {
    ..._help, 'me', 'please', 'can', 'could', 'you', 'i', 'need', 'some',
    'show', 'the', 'pls', 'plz', 'hi', 'hey', 'hello',
  };
  static const _whoMadeYou = [
    'who made you', 'who built you', 'who created you', 'who made this',
    'who built this', 'who made the app', 'who created this', 'who owns',
    'who developed', 'who designed', 'who is behind', 'who are the developers',
    'who built the app', 'who made smart curb', 'who installed',
    'who built the curbs', 'who made the curbs', 'who makes the curbs',
    'who runs', 'who owns smart curb', 'who is the team', 'who are the team',
    'team members', 'who works on', 'meet the team', 'who is on the team',
    'your team', 'the developers', 'your developers', 'who is behind',
    'who are you guys',
  ];
  static const _joke = {'joke', 'funny', 'laugh'};
  static const _parkWords = {
    'park', 'parking', 'parked', 'lot', 'lots', 'garage', 'curb', 'spot',
    'spots', 'space', 'spaces', 'stall',
  };
  static const _parkPhrases = [
    'where should i', 'where can i', 'where do i', 'best place to',
    'closest to', 'nearest to', 'near the', 'heading to', 'going to',
    'get to',
  ];
  static const _spotWords = {
    'spot', 'spots', 'space', 'spaces', 'stall', 'stalls', 'parking', 'lot',
    'lots', 'curb', 'curbs',
  };
  static const _availability = {
    'open', 'free', 'available', 'availability', 'empty', 'vacant', 'full',
    'busy', 'many', 'left', 'count', 'counts', 'live', 'occupied', 'taken',
  };
  static const _availabilityPhrases = [
    'how many spots', 'how many spaces', 'any spots', 'any spaces',
    'is it full', 'open spots', 'free spots', 'available spots',
  ];
  static const _browardWords = ['broward', 'mall', 'westfield', 'plantation'];
  static const _vehicleWords = {
    'vehicle', 'vehicles', 'car', 'cars', 'truck', 'plate', 'plates',
    'license', 'auto', 'suv', 'van', 'motorcycle', 'motorcycles', 'motorbike',
    'scooter', 'moped',
  };
  static const _placeWords = {
    'place', 'places', 'location', 'locations', 'campus', 'campuses', 'saved',
    'site', 'sites',
  };
  static const _placePhrases = [
    'my places', 'where can i use', 'which places', 'home page', 'homepage',
    'my home', 'on home', 'home screen',
  ];
  static const _profileWords = {
    'profile', 'account', 'name', 'phone', 'address', 'email', 'details',
    'info', 'information', 'personal',
  };
  static const _profilePhrases = ['about me', 'my info', 'contact info'];
  static const _addWords = {'add', 'new', 'register', 'create', 'save'};
  static const _removeWords = {'delete', 'remove', 'erase', 'unsave'};
  static const _editWords = {'edit', 'change', 'update', 'fix', 'modify'};
  static const _logoutWords = {'logout', 'signout'};
  static const _logoutPhrases = [
    'log out', 'sign out', 'log off', 'log me out', 'sign me out',
  ];
  static const _passwordWords = {'password', 'passcode', 'forgot', 'reset'};
  static const _colorWords = {
    'color', 'colors', 'colour', 'colours', 'green', 'red', 'gray', 'grey',
    'amber', 'yellow', 'legend', 'ring',
  };
  static const _navigationWords = {
    'navigate', 'navigation', 'directions', 'direction', 'route', 'routing',
    'gps', 'map', 'maps', 'drive', 'driving', 'walk', 'walking',
  };
  static const _navigationPhrases = [
    'how do i get', 'how to get', 'focus mode', 'turn by turn',
  ];
  // ("about" alone is too common: "tell me about a good movie".)
  static const _howItWorksWords = {'sensor', 'sensors', 'led', 'solar'};
  static const _howItWorksPhrases = [
    'how does it work', 'how does this work', 'how does smart curb',
    'what is smart curb', 'what is this app', 'how it works', 'what does this app',
    'what is a smart curb', 'what are smart curbs', 'what is a curb',
    'what does a smart curb do', 'what is smartcurb', 'what do the curbs do',
    'what are the curbs', 'what do the led', 'what does the led',
    'led lights', 'led light', 'led panel', 'solar', 'about smart curb',
    'about smart curbs', 'about the curbs', 'about the app', 'about this app',
    'about smartcurb', 'about you guys',
    'what is this',
  ];
  static const _supportWords = {
    'support', 'contact', 'bug', 'problem', 'issue', 'broken', 'error',
    'complaint', 'feedback', 'report',
  };
  static const _supportPhrases = ['not working', "doesn't work", 'talk to'];

  static const _compliments = [
    'good bot', 'good job', 'great job', 'nice job', 'well done',
    'you are smart', 'youre smart', 'you are great', 'youre great',
    'you are awesome', 'youre awesome', 'you are amazing', 'youre amazing',
    'you are the best', 'youre the best', 'you rock', 'love you',
    'love this app', 'love the app', 'you are helpful', 'youre helpful',
    'very helpful', 'so helpful', 'you are cool', 'youre cool',
    'this is cool', 'this is great', 'this is awesome', 'this is amazing',
    'this is nice', 'so cool', 'very cool', 'love it', 'i like it',
    'i like this', 'nice app', 'great app', 'cool app', 'awesome app',
    'amazing app', 'nice work', 'good work', 'that was quick',
    'that was fast', 'that helped', 'that helps', 'big help',
  ];
  static const _insults = {
    'stupid', 'dumb', 'useless', 'idiot', 'sucks', 'suck', 'terrible',
    'worst', 'trash', 'garbage', 'annoying', 'hate', 'horrible', 'awful',
    'unhelpful',
  };
  static const _yes = {
    'yes', 'yeah', 'yep', 'yup', 'ya', 'yea', 'sure', 'please', 'definitely',
  };
  static const _no = {'no', 'nope', 'nah', 'not', 'never', 'nothing', 'now'};
  static const _humanPhrases = [
    'real person', 'real human', 'live agent', 'human agent', 'live person',
    'live chat', 'customer service', 'customer support', 'customer care',
    'talk to a human', 'talk to someone', 'speak to someone',
  ];
  static const _talkPhrases = [
    'talk to', 'talk with', 'speak to', 'speak with', 'chat with',
    'contact a', 'contact an', 'reach a', 'reach an', 'connect me',
    'transfer me', 'put me through', 'want to talk', 'need to talk',
    'wanna talk', 'want a', 'want an', 'need a', 'need an', 'get me a',
    'get me an',
  ];
  static const _humanWords = {
    'agent', 'human', 'person', 'someone', 'somebody', 'representative',
    'rep', 'staff', 'team', 'people', 'operator', 'admin', 'manager',
    'employee', 'developers', 'creators',
  };
  static const _timePhrases = [
    'what time', 'the time', 'time is it', 'what day', 'the date',
    'todays date', 'what date', 'which day',
  ];
  static const _wherePlacesPhrases = [
    'other campus', 'other campuses', 'another campus', 'other school',
    'other schools', 'another school', 'other university', 'another university',
    'other universities', 'other mall', 'other malls', 'another mall',
    'other city', 'other cities', 'another city', 'my school', 'my campus',
    'my university', 'my college', 'where does it work',
    'where does smart curb work', 'where is smart curb available',
    'where is it available', 'which campuses', 'which schools', 'which malls',
    'supported places', 'supported locations', 'more campuses', 'more malls',
    'more schools', 'other countries', 'other country', 'other states',
    'outside florida', 'in my city', 'in my town',
  ];
  static const _curbCountPhrases = [
    'how many curbs', 'how many smart curbs', 'how many sensors',
    'number of curbs', 'number of sensors', 'how many units', 'how many devices',
    'which lots have', 'where are the smart curbs', 'where are the curbs',
    'where are smart curbs', 'lots with curbs', 'lots with smart curbs',
    'lots with sensors', 'which lot has curbs', 'which lot has smart curbs',
    'where is a smart curb', 'where can i find a smart curb',
  ];
  static const _emptiestPhrases = [
    'most space', 'most spaces', 'most spots', 'most open', 'most free',
    'most room', 'least full', 'least busy', 'least crowded', 'least occupied',
    'fewest cars', 'best lot', 'which lot', 'what lot', 'any lot',
  ];
  static const _allLotsPhrases = [
    'all the lots', 'all lots', 'every lot', 'list of lots', 'list the lots',
    'how many lots', 'how many parking lots', 'what lots', 'which lots',
  ];
  static const _allBuildingsPhrases = [
    'what buildings', 'which buildings', 'list of buildings', 'all buildings',
    'all the buildings', 'list the buildings', 'how many buildings',
    'what stores', 'which stores', 'what shops', 'which shops',
  ];
  static const _loginPhrases = [
    'log in', 'sign in', 'logged in', 'signed in', 'login as', 'who am i',
    'which account', 'log me in', 'sign me in', 'switch account',
    'switch accounts', 'change account', 'change accounts', 'swap account',
    'other account', 'what email', 'which email', 'email am i',
    'email address am i', 'my login',
  ];

  // ---- app questions (see [_faqs]) ----

  static const _howToPhrases = [
    'how do i', 'how can i', 'how to', 'how should i', 'how would i',
    'how do you', 'where do i', 'where can i', 'is there a way', 'can i',
    'could i', 'show me how', 'teach me', 'way to',
  ];
  static const _destinationWords = {
    'destination', 'destinations', 'building', 'buildings',
  };
  static const _chooseWords = {
    'choose', 'chose', 'choosing', 'select', 'selecting', 'pick', 'picking',
    'set', 'change', 'changing', 'switch', 'enter', 'type', 'input', 'search',
    'add', 'put', 'tap', 'click', 'press', 'another', 'different', 'other',
    'new',
  };
  static const _destinationPhrases = [
    'where i want to go', 'where i wanna go', 'where i need to go',
    'where im going', 'where i am going', 'where im headed', 'where to go',
    'go somewhere', 'set a destination', 'my destination', 'pick a place to go',
  ];
  static const _stopWords = {
    'cancel', 'stop', 'end', 'quit', 'exit', 'clear', 'disable', 'close',
    'leave', 'remove',
  };
  static const _routeWords = {
    'navigation', 'navigating', 'navigate', 'route', 'routing', 'directions',
    'destination', 'trip', 'guidance', 'driving',
  };
  static const _mapWords = {'map', 'maps'};
  static const _mapTrouble = {
    'blank', 'loading', 'black', 'white', 'broken', 'crash',
    'crashes', 'frozen', 'freeze', 'freezes', 'stuck', 'slow', 'lag', 'laggy',
    'glitch', 'glitchy', 'missing',
  };
  static const _openWords = {
    'open', 'see', 'show', 'find', 'view', 'where', 'get', 'access', 'display',
    'opening',
  };
  static const _appTrouble = {
    'crash', 'crashed', 'crashes', 'crashing', 'frozen', 'freeze', 'freezes',
    'freezing', 'glitch', 'glitchy', 'laggy', 'lagging', 'slow', 'buggy',
    'unresponsive',
  };
  static const _backPhrases = [
    'go back', 'get back', 'back to home', 'back home', 'exit the map',
    'leave the map', 'close the map', 'exit map', 'return home',
    'return to home', 'main screen', 'main menu', 'go to home',
    'go to the home', 'switch tabs', 'other tabs', 'change tabs',
  ];
  /// Asking about open spots, not about the map itself.
  static const _spotQuestion = {
    'spot', 'spots', 'space', 'spaces', 'free', 'available', 'empty', 'full',
  };
  static const _tapWords = {
    'tap', 'click', 'press', 'touch', 'tapping', 'clicking', 'details',
    'detail', 'popup', 'bubble', 'dot', 'dots',
  };
  static const _lotPartWords = {
    'lot', 'lots', 'curb', 'curbs', 'dot', 'dots', 'spot', 'spots',
  };
  static const _lotDetailPhrases = [
    'each curb', 'every curb', 'each spot', 'every spot', 'see the curbs',
    'see the spots', 'inside a lot', 'inside the lot', 'individual curbs',
    'individual spots',
  ];
  static const _gpsTrouble = {
    'isnt', 'wont', 'cant', 'doesnt', 'dont', 'wrong', 'off', 'permission',
    'permissions', 'allow', 'enable', 'turn', 'broken', 'working',
    'accurate', 'jumping', 'jumps', 'stuck', 'lost', 'searching', 'disabled',
    'denied', 'signal', 'weak', 'moving', 'updating', 'frozen',
  };
  /// Clearly about GPS trouble on their own.
  static const _gpsPhrases = [
    'location permission', 'location permissions', 'location access',
    'location services', 'location service', 'cant find me', 'where am i',
    'wrong location', 'location is wrong', 'location wrong',
    'location is off', 'location disabled', 'location is disabled',
    'location not', 'blue dot',
  ];
  /// About GPS trouble only next to a [_gpsTrouble] word ("my location is
  /// off", but not "park near my location").
  static const _gpsWhosePhrases = [
    'my location', 'my position', 'my arrow', 'the arrow',
  ];
  static const _lostPhrases = [
    'im lost', 'i am lost', 'i got lost', 'got lost', 'lost my way',
    'dont know where i am', 'no idea where i am',
  ];
  static const _focusPhrases = [
    'focus mode', 'turn by turn', 'arrow button', 'follow me', 'follow my',
    'follows me', 'map turn', 'map rotate', 'rotate the map',
  ];
  static const _rulesWords = {
    'overnight', 'rules', 'rule', 'allowed', 'legal', 'illegal',
  };

  /// "Why do you need my address?", "do I have to add my car?"
  static const _whyNeedPhrases = [
    'why do you need', 'why do i need', 'why does it need',
    'why do i have to', 'why should i', 'why do you want', 'why does the app',
    'do i have to add', 'do i need to add', 'is it required',
    'is it necessary', 'why is my', 'why add',
  ];
  static const _rulesPhrases = [
    'time limit', 'how long can i park', 'park all day', 'can i park here',
    'am i allowed', 'free to park', 'park anywhere', 'park wherever',
  ];
  static const _privacyWords = {
    'privacy', 'private', 'tracking', 'tracked', 'spy', 'spying', 'security',
    'secure', 'surveillance', 'camera', 'cameras',
  };
  static const _privacyPhrases = [
    'track me', 'track my', 'my data', 'share my', 'sell my', 'who can see',
    'see my location', 'store my', 'save my location', 'my information safe',
    'my info safe', 'location shared', 'share my location', 'shared with',
    'who sees', 'is my location', 'location private', 'tracking me',
    'track my location', 'is my data', 'data safe',
  ];
  static const _fillsUpPhrases = [
    'fills up', 'fill up', 'filled up', 'gets full', 'got full',
    'becomes full', 'someone takes', 'someone took', 'someone else',
    'gets taken', 'got taken', 'taken before', 'by the time i',
    'while driving', 'while im driving', 'while i drive',
    // "Why did it change my lot?"
    'change my lot', 'changed my lot', 'switched my lot', 'changed the lot',
    'switched the lot', 'changed my spot', 'changed my curb', 'new lot',
    'lot changed', 'different lot',
  ];
  static const _parkedPhrases = [
    'i parked', 'im parked', 'i am parked', 'ive parked', 'i have parked',
    'just parked', 'after parking', 'after i park', 'once i park',
    'when i park', 'after i parked', 'i arrived', 'ive arrived',
    'i have arrived', 'i got there', 'after i arrive', 'when i arrive',
    'once i arrive',
  ];
  static const _walkPhrases = [
    'how far', 'walking distance', 'walk distance', 'how long is the walk',
    'how long to walk', 'how long will it take', 'how long does it take',
    'how many minutes', 'how long of a walk',
  ];
  static const _whyLotPhrases = [
    'why this lot', 'why that lot', 'why did you pick', 'why did you choose',
    'why did you send', 'why are you sending', 'why is it sending',
    'how do you pick', 'how do you choose', 'how do you decide',
    'how does it pick', 'how does it choose', 'how does it decide',
    'why not the closest', 'why not the nearest', 'not the closest',
    'not the nearest', 'farther lot', 'further lot', 'why a different lot',
    'which lot do you pick', 'how is the lot chosen', 'how are lots chosen',
  ];
  static const _reserveWords = {
    'reserve', 'reserved', 'reservation', 'reservations', 'booking', 'book',
  };
  static const _reservePhrases = [
    'save a spot', 'save me a spot', 'hold a spot', 'hold my spot',
    'hold me a spot', 'save my spot', 'guarantee a spot',
  ];
  static const _evWords = {'ev', 'evs', 'charger', 'chargers', 'charging', 'tesla'};
  static const _evPhrases = [
    'electric car', 'electric cars', 'electric vehicle', 'electric vehicles',
    'charge my car', 'plug in',
  ];
  static const _accessibleWords = {
    'handicap', 'handicapped', 'accessible', 'accessibility', 'wheelchair',
    'ada',
  };
  static const _accessiblePhrases = [
    'disabled parking', 'disabled spot', 'disabled spots', 'disabled space',
    'disabled spaces', 'disability parking',
  ];
  static const _costWords = {
    'permit', 'permits', 'decal', 'decals', 'pay', 'paying', 'payment',
    'payments', 'cost', 'costs', 'price', 'prices', 'pricing', 'fee', 'fees',
    'money', 'subscription', 'paid', 'dollar', 'dollars', 'expensive',
    'cheap',
  };
  static const _costPhrases = [
    'app free', 'free to use', 'free app', 'for free', 'is smart curb free',
    'parking meter', 'parking meters',
  ];
  static const _bestTimePhrases = [
    'best time', 'busiest', 'busy time', 'busy times', 'least busy time',
    'rush hour', 'peak hour', 'peak hours', 'peak time', 'when is it busy',
    'when should i come', 'when should i go', 'what time should',
    'when are lots', 'when is parking', 'predict', 'when does the lot fill',
    'when do lots fill', 'when does it fill', 'when does parking fill',
    'when do the lots fill', 'what time does the lot', 'what time do lots',
  ];
  static const _internetWords = {
    'internet', 'wifi', 'signal', 'connection', 'connectivity',
  };
  static const _internetPhrases = [
    'wi fi', 'no service', 'offline mode', 'work offline', 'works offline',
    'use it offline', 'without data', 'no data', 'cellular data', 'mobile data',
  ];
  static const _accuracyWords = {
    'accurate', 'accuracy', 'reliable', 'realtime', 'inaccurate', 'precise',
    'refresh', 'delay', 'lag', 'delayed',
  };
  static const _accuracyPhrases = [
    'real time', 'up to date', 'how often', 'how fast does', 'wrong count',
    'count is wrong', 'is wrong', 'not right', 'not correct', 'says open',
    'says free', 'shows open', 'shows free', 'was taken', 'already taken',
  ];
  static const _notificationWords = {
    'notification', 'notifications', 'notify', 'alert', 'alerts', 'notif',
    'notifs',
  };
  static const _versionPhrases = [
    'about app', 'about the app', 'about page', 'app version',
    'update the app', 'latest version', 'new version',
  ];
  static const _signUpPhrases = [
    'sign up', 'create an account', 'create account', 'create a new account',
    'make an account', 'new account', 'open an account',
    'register an account', 'another account', 'second account',
    'two accounts', 'multiple accounts', 'more than one account',
    'need an account', 'need account', 'without an account',
    'without account',
  ];
  static const _gettingStartedPhrases = [
    'how to use', 'how do i use', 'how can i use', 'how should i use',
    'how does the app work', 'how does this app work', 'getting started',
    'get started', 'first time', 'new here', 'im new', 'i am new', 'new user',
    'walk me through', 'show me around', 'show me how', 'how do i start',
    'where do i start', 'where to start', 'teach me', 'guide me',
    'how does everything work',
  ];
  static const _voicePhrases = [
    'out loud', 'read out', 'speak the directions', 'say the directions',
    'talk me through',
  ];
  static const _themePhrases = [
    'dark mode', 'light mode', 'dark theme', 'light theme', 'night mode',
    'day mode',
  ];

  /// "Can I ask another question?": the user wants to go on.
  static const _askAwayPhrases = [
    'another question', 'a question', 'one more question', 'more questions',
    'quick question', 'can i ask', 'may i ask', 'could i ask', 'let me ask',
    'i wanna ask', 'i want to ask', 'ask you something', 'ask something',
    'ask you a', 'one more thing', 'another thing', 'something else',
    'i was wondering', 'help me with something', 'help with something',
    'can you answer',
  ];
  static const _holdOnPhrases = [
    'wait', 'hold on', 'hang on', 'one sec', 'one second', 'just a sec',
    'give me a sec', 'give me a minute', 'one minute', 'brb', 'be right back',
  ];

  /// Things going wrong on the road, checked before anything else. The
  /// first match wins: someone being hurt comes first.
  static final List<_Faq> _safety = [
    _Faq(
      (m) =>
          m.has({'suicide', 'suicidal', 'selfharm'}) ||
          m.anyPhrase(['kill myself', 'end my life', 'hurt myself',
            'want to die', 'wanna die', 'self harm', 'take my life',
            'dont want to live', 'do not want to live', 'better off dead',
            'no reason to live', 'end it all', 'cut myself']),
      const ChatReply(
        "I'm really sorry you're feeling this way, and I'm glad you told me. "
        "You don't have to go through this alone. Please call or text 988 "
        '(the Suicide & Crisis Lifeline, free and open 24/7) to talk with '
        'someone right now, or reach out to someone you trust. If you\'re in '
        'immediate danger, call $kEmergencyNumber. FAU students can also '
        'reach Counseling and Psychological Services (CAPS).',
      ),
    ),
    _Faq(
      (m) =>
          m.has({'injured', 'injury', 'injuries', 'bleeding', 'ambulance',
            'emergency', 'unconscious', 'fainted', 'dying', 'paramedic',
            'paramedics'}) ||
          // Hurt, but not "my feelings got hurt".
          (m.has({'hurt'}) &&
              !m.has({'feelings', 'feeling', 'heart', 'heartbroken', 'pride'})) ||
          m.anyPhrase(['call 911', 'need help now', 'medical help',
            'heart attack', 'cant breathe', 'not breathing', 'need a doctor']),
      const ChatReply(
        'Please call $kEmergencyNumber right now. I can\'t call for help '
        "myself, but $kEmergencyNumber can send someone to you fast. Stay "
        'where you are if it\'s safe, and tell them which lot or building '
        "you're near. I'm here if you need anything after.",
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(['call the police', 'call police', 'call security',
            'contact police', 'contact the police', 'call campus police',
            'police number', 'police phone', 'number for police',
            'reach the police', 'get the police']),
      const ChatReply(
        "I can't make calls myself, but here's who to call: for an "
        'emergency, $kEmergencyNumber. On campus, $kCampusPolice at '
        '$kCampusPolicePhone. At the mall, mall security can help too.',
      ),
    ),
    _Faq(
      (m) =>
          m.has({'curb', 'curbs'}) &&
          (m.has({'hit', 'drove', 'ran', 'bumped', 'scraped', 'damaged',
                'broke', 'crashed', 'backed', 'smashed'}) ||
              m.anyPhrase(['drove over', 'ran over', 'backed into'])) &&
          !m.has({'shows', 'color', 'colour', 'wrong'}),
      const ChatReply(
        "Oh no, are you okay? If anyone is hurt, call $kEmergencyNumber "
        "first. Don't worry about the curb: just let the team know at "
        "$kSupportEmail which curb it was (its number, like C-077, is on "
        'the map next to the space) and the lot, so they can check it. '
        "Thanks for telling us!",
        [ChatAction.ask('Contact support')],
      ),
    ),
    _Faq(
      (m) =>
          m.has({'accident', 'accidents', 'collision', 'rearended'}) ||
          // "I hit a dog / a cyclist with my car", "I ran over something".
          (m.has({'hit', 'struck', 'bumped'}) &&
              (m.any(_vehicleWords) ||
                  m.has({'dog', 'cat', 'animal', 'deer', 'pedestrian',
                    'person', 'someone', 'somebody', 'bike', 'bicycle',
                    'cyclist', 'biker', 'kid', 'child', 'man', 'woman',
                    'student', 'pole', 'tree', 'wall', 'gate', 'sign'}))) ||
          m.anyPhrase(['ran over a', 'ran over an', 'ran over my',
            'ran over someone', 'ran over something', 'ran over the']) ||
          m.anyPhrase(['car crash', 'crashed my car', 'crashed into',
            'i crashed', 'hit my car', 'hit a car', 'hit another car',
            'hit someone', 'hit a person', 'hit a pole', 'hit a wall',
            'got hit', 'was hit', 'someone hit', 'hit and run', 'rear ended',
            'ran into a car', 'ran into another car', 'ran into a pole',
            'ran into someone', 'backed into', 'fender bender', 'totaled my car',
            'got in a crash', 'was in a crash', 'scratched my car',
            'dented my car', 'dent in my car', 'damaged my car',
            'hit me', 'scratched someone', 'scratched a car',
            'scratched another', 'hit a parked car', 'dinged',
            'damaged someone', 'damaged a car']),
      const ChatReply(
        "I'm so sorry, that's scary! First, are you okay? If anyone is hurt "
        'or there\'s danger, call $kEmergencyNumber right away.\n'
        'If everyone is okay:\n'
        '1. Move to a safe spot if you can and turn on your hazard lights.\n'
        "2. Exchange names, phone numbers, insurance and plates with the "
        'other driver. If the other car is parked and empty, leave a note '
        'with your name and number.\n'
        '3. Take photos of the cars, the plates and the area.\n'
        '4. Report it to the police. On campus, call $kCampusPolice at '
        '$kCampusPolicePhone.\n'
        "Smart Curb can't file reports, but I'm here if you need help with "
        'anything else.',
      ),
    ),
    // "Is it safe to park at night?": tips, not an alarm.
    _Faq(
      // (Not "is it safe to use the app": that's about the app.)
      (m) =>
          m.anyPhrase(['is it safe', 'is it dangerous', 'safe to park',
            'dangerous to park', 'safe at night', 'safe area',
            'safe place to park', 'safest', 'is parking safe',
            'is the lot safe', 'is the garage safe']) &&
          !m.has({'use', 'app', 'download', 'install', 'data', 'account',
            'information', 'info', 'privacy'}),
      const ChatReply(
        "Good question! I don't track safety, but here are some tips: park "
        'in a well-lit, busy spot close to the door (I can find you the '
        'closest one!), lock your car and keep valuables out of sight. If '
        'you ever feel unsafe, call $kEmergencyNumber, or $kCampusPolice at '
        '$kCampusPolicePhone on campus.',
        [ChatAction.ask('Where should I park?')],
      ),
    ),
    _Faq(
      (m) =>
          m.has({'unsafe', 'scared', 'threatened', 'harassed', 'attacked',
            'assaulted', 'stalked', 'suspicious', 'danger', 'dangerous',
            'robbed', 'mugged'}) ||
          m.anyPhrase(['being followed', 'following me', 'not safe',
            'feel unsafe', 'someone is chasing']),
      const ChatReply(
        "Your safety comes first. If you're in danger, call "
        '$kEmergencyNumber now. On campus you can also call $kCampusPolice '
        'at $kCampusPolicePhone. Head to a well-lit, busy place, stay in '
        "your locked car if that's safer, and keep your phone with you. "
        "I'm right here.",
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(['took my spot', 'in my spot', 'stole my spot',
            'parked in my spot', 'took my curb', 'took the spot',
            'someone is in my', 'got my spot', 'took my parking']),
      const ChatReply(
        "Ugh, that's frustrating, sorry! Spots are first come, first "
        "served, so I can't save one, but let's find you another right "
        'away.',
        [ChatAction.ask('Where should I park?'), ChatAction.ask('Open spots right now')],
      ),
    ),
    _Faq(
      (m) => m.has({'towed'}) || m.anyPhrase(['got towed', 'towed away',
            'tow my car', 'towing company']),
      const ChatReply(
        "Oh no, sorry! The lot's signs list the towing company and its "
        "number, so that's the fastest way to find your car. At FAU, Parking "
        'and Transportation Services or $kCampusPolice '
        '($kCampusPolicePhone) can tell you where it went.',
        [ChatAction.ask("What's my license plate?")],
      ),
    ),
    _Faq(
      (m) =>
          m.has({'stolen', 'theft', 'thief', 'burglary'}) ||
          m.anyPhrase(['stole my', 'broke into my', 'break in', 'broken into',
            'car is gone', 'car is missing', 'someone took my car',
            'smashed my window', 'window smashed', 'window broken']),
      const ChatReply(
        "I'm so sorry! Please report it to the police right away: call "
        '$kEmergencyNumber if it\'s happening now, or $kCampusPolice at '
        '$kCampusPolicePhone on campus. Have your plate number ready. If '
        "your car is gone, check first whether it was towed: the lot's "
        'signs list who to call.',
        [ChatAction.ask("What's my license plate?")],
      ),
    ),
    _Faq(
      // (Not "the app won't start": that's app trouble.)
      (m) =>
          !m.has({'app', 'map', 'chat', 'phone'}) &&
          m.anyPhrase(['flat tire', 'flat tyre', 'dead battery',
            'battery died', 'battery is dead', 'wont start', 'doesnt start',
            'will not start', 'broke down', 'broken down', 'breaks down',
            'out of gas', 'ran out of gas', 'overheating', 'overheated',
            'locked my keys', 'keys locked', 'locked out of my car',
            'lost my keys', 'jump start', 'jumpstart', 'need a jump',
            'tow truck', 'need a tow', 'check engine', 'smoke coming']),
      const ChatReply(
        "Oh no, I'm sorry! First, stay safe: turn on your hazard lights, and "
        "if you're in a driving lane, move out of traffic if you can. Then "
        'call your roadside assistance (your insurance or a service like '
        'AAA) for a jump, a tire change, a tow or a lockout. On campus, '
        '$kCampusPolice ($kCampusPolicePhone) can point you to help too.',
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(['blocked in', 'blocking my car', 'blocking me',
            'someone blocked', 'cant get out', 'car is blocked',
            'parked behind me', 'double parked']),
      const ChatReply(
        "Sorry, that's annoying! Please don't try to squeeze out. Check if "
        'the driver is nearby, and if not, call for help: on campus, '
        '$kCampusPolice at $kCampusPolicePhone; at the mall, mall security.',
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(['im driving', 'i am driving', 'driving right now',
            'driving now', 'im on the road', 'while i am driving now',
            'texting and driving']),
      const ChatReply(
        'Please keep your eyes on the road! Focus mode on the map guides '
        "you without typing. Ask me anything once you're safely parked. "
        'Drive safe!',
      ),
    ),
  ];

  /// Questions about using the app, first match wins: the more specific
  /// ones ("stop navigating") come before the broader ones ("the map").
  static final List<_Faq> _faqs = [
    // ---- about the app itself ----
    _Faq(
      (m) =>
          m.has({'progress', 'roadmap', 'beta', 'alpha', 'finished',
            'unfinished', 'prototype'}) ||
          m.anyPhrase(['app status', 'status of the app', 'app complete',
            'app finished', 'in development', 'still in development',
            'still being built', 'still working on', 'how far along',
            'is it done', 'is the app done', 'state of the app',
            'what works', 'whats missing', 'what is missing',
            'what doesnt work', 'what can the app not do',
            'whats not working', 'limitations']),
      const ChatReply(
        'Smart Curb is at version $kAppVersion and still growing! Here\'s '
        'where it is:\n'
        '✓ Working now: live Smart Curb counts at FAU, maps of FAU and '
        'Westfield Broward Mall, the best lot (or exact curb) picked by real '
        'walking distance, turn-by-turn driving and walking directions, '
        'your cars, places and contact info, and me, the AI assistant.\n'
        '• Not in the app yet: changing your password or email, spot alerts, '
        'voice directions, reservations, a light theme, and more places.\n'
        'Got an idea? The team reads every one at $kSupportEmail.',
        [
          ChatAction.ask("What's new?"),
          ChatAction.ask('What can the app do?'),
        ],
      ),
    ),
    _Faq(
      (m) =>
          m.anyPhrase(['app safe', 'safe to use', 'is this app safe',
            'is the app safe', 'is smart curb safe', 'is it secure',
            'app secure', 'is it legit', 'is this legit', 'can i trust',
            'trustworthy', 'is it a scam', 'is this a scam', 'safe app',
            'secure app', 'safe to download', 'safe to install']) ||
          m.has({'legit', 'scam', 'virus', 'malware', 'spyware', 'hacked'}),
      const ChatReply(
        'Yes! Smart Curb is safe to use:\n'
        '• You sign in with your own email and password (through Google '
        'Firebase), and your cars, places and contact info stay tied to '
        'your account.\n'
        "• Your location is used on your phone for your arrow and "
        "directions, and isn't saved to your account.\n"
        '• There are no payments and no ads, so no card details anywhere.\n'
        "• Chat questions I can't answer myself may go to Google's Gemini "
        'AI, with your name, email and phone number hidden first.\n'
        'One important tip: please don\'t type while driving. Focus mode '
        'guides you without typing.',
        [ChatAction.ask('Is my data private?')],
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(['whats new', 'what is new', 'what changed',
            'changelog', 'change log', 'release notes', 'latest update',
            'last update', 'recent update', 'new in this version',
            'new update', 'what got updated', 'updates in']),
      const ChatReply(
        "You're on version $kAppVersion. Recent updates added me (the AI "
        'assistant!), Westfield Broward Mall, every FAU parking lot on the '
        'map, and smoother animations throughout the app.',
        [ChatAction.ask('What can the app do?')],
      ),
    ),
    _Faq(
      (m) =>
          m.anyPhrase(['what can the app do', 'what does the app do',
            'what does this app do', 'what can this app do',
            'app features', 'what features', 'features of the app',
            'list of features', 'main features', 'what is the app for',
            'what is this app for', 'what is the app used for']) ||
          m.has({'features', 'feature'}) &&
              !m.anyPhrase(['add a feature', 'new feature', 'feature request',
                'request a feature']),
      const ChatReply(
        "Here's what Smart Curb does:\n"
        '• Shows live open spots from the Smart Curb sensors\n'
        "• Picks the best lot (or exact curb) for the building you're going "
        'to, by real walking distance\n'
        '• Turn-by-turn driving directions, then a walking path to the door\n'
        '• Switches you to another lot if yours fills up on the way\n'
        '• Keeps your cars, saved places and contact info\n'
        '• And me, to help with all of it!',
        [
          ChatAction.ask('How do I use the app?'),
          ChatAction.ask('Where should I park?'),
        ],
      ),
    ),
    _Faq(
      // (Not "when will a spot open?": that's about parking.)
      (m) => !m.any(_parkWords) && !m.has(_spotQuestion) &&
          m.anyPhrase(['when will', 'coming soon', 'in the future',
            'future updates', 'future update', 'next update', 'whats next',
            'what is next', 'upcoming', 'new features coming', 'plans for',
            'future plans', 'how often is it updated', 'how often do you update',
            'how often does it update', 'how often is the app updated',
            'how often does the app update', 'how often do you release',
            'coming next', 'whats coming', 'what is coming', 'next version',
            'next release', 'will you add', 'will there be',
            'are you going to add', 'will it get', 'release date']),
      const ChatReply(
        "I don't have release dates, sorry! The team is still building "
        'Smart Curb and adds features as they\'re ready. If there\'s '
        "something you'd love to see, tell them at $kSupportEmail. They "
        'read every request.',
        [ChatAction.ask('What is the current progress of the app?')],
      ),
    ),
    _Faq(
      (m) =>
          m.has({'iphone', 'android', 'ios', 'ipad', 'tablet', 'laptop',
            'desktop', 'computer', 'pc', 'mac', 'browser', 'platform',
            'platforms', 'samsung', 'pixel'}) ||
          m.anyPhrase(['which phones', 'what phones', 'web browser',
            'work on my', 'run on my', 'which devices', 'what devices']),
      const ChatReply(
        'Smart Curb is built with Flutter, so it runs on Android phones, '
        'iPhones and in a web browser. Your account works the same on all '
        'of them.',
      ),
    ),
    _Faq(
      (m) =>
          m.has({'tech', 'technology', 'technologies', 'framework', 'flutter',
            'firebase', 'database', 'backend', 'stack', 'maplibre', 'osrm',
            'algorithm', 'programming'}) ||
          m.anyPhrase(['built with', 'made with', 'coded in', 'written in',
            'under the hood', 'how was it built', 'how is it built',
            'how was the app made', 'source code', 'open source', 'github',
            'what language is', 'how does the app work technically']),
      const ChatReply(
        'Under the hood: the app is built with Flutter. Sign-in and the live '
        'curb data run on Google Firebase, the maps use MapLibre with '
        'OpenStreetMap data, driving routes come from OSRM, and walking '
        'paths use an A* search over the campus walkways. The curbs report '
        'to Firebase, and the app updates the moment they do. For questions '
        'about the code itself, the team is at $kSupportEmail.',
        [ChatAction.ask('How does Smart Curb work?')],
      ),
    ),
    _Faq(
      (m) =>
          m.has({'official', 'affiliated', 'endorsed', 'sponsored'}) ||
          m.anyPhrase(['fau app', 'by fau', 'from fau', 'run by fau',
            'made by fau', 'part of fau', 'fau own']),
      const ChatReply(
        'Smart Curb was built by an FAU Engineering senior design team, with '
        "FAU's Boca Raton campus as its first home. For official FAU "
        'parking rules and permits, check FAU Parking and Transportation '
        'Services.',
        [ChatAction.ask('Who made you?')],
      ),
    ),
    _Faq(
      // ("Why use this instead of Google Maps?" is the comparison below.)
      (m) =>
          !m.has({'google', 'waze', 'maps'}) &&
          (m.has({'purpose', 'mission', 'goal', 'goals'}) ||
              m.anyPhrase(['why was it made', 'why was smart curb made',
                'why did you make', 'why make', 'the point of',
                'what problem', 'why does it exist', 'why smart curb',
                'why should i use', 'why use this', 'what is the idea',
                'idea behind'])),
      const ChatReply(
        'Smart Curb was made to end circling around looking for a spot. '
        'Each curb senses its own space live, so instead of guessing, you '
        "drive straight to an open spot as close as possible to where "
        "you're going, and walk the shortest way to the door. Less "
        'circling, less stress, and fewer late arrivals!',
        [ChatAction.ask('How does Smart Curb work?')],
      ),
    ),
    _Faq(
      (m) =>
          m.has({'google', 'waze', 'apple', 'maps'}) &&
          m.has({'maps', 'map', 'waze', 'different', 'better', 'vs',
            'versus', 'instead', 'compared', 'compare', 'difference'}),
      const ChatReply(
        'Great question! Google Maps or Waze gets you to the building. Smart '
        'Curb gets you to an open parking spot: it knows live which Smart '
        'Curb spaces are free, picks the lot by the real walking distance to '
        "the door, switches lots if yours fills up, and then walks you in.",
        [ChatAction.ask('What can the app do?')],
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(['how many users', 'how many people use',
            'who uses', 'is it popular', 'how many downloads',
            'how many people have', 'anyone use']),
      const ChatReply(
        "I don't have user numbers, sorry! Smart Curb is new and growing, "
        'starting at FAU and Westfield Broward Mall.',
      ),
    ),
    _Faq(
      (m) => m.has({'ads', 'advertisements', 'advertising', 'commercials',
            'adverts', 'popups'}),
      const ChatReply(
        'Nope, Smart Curb has no ads. Just parking help!',
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(['privacy policy', 'terms of service',
            'terms and conditions', 'terms of use', 'user agreement',
            'data policy']) ||
          m.has({'tos', 'eula', 'gdpr'}),
      const ChatReply(
        "There's no separate privacy policy page in the app yet. In short: "
        'your location is only used on your phone for directions, and what '
        "Smart Curb stores is what you enter (your profile, cars and saved "
        "places), tied to your login. Chat questions I can't answer myself "
        "may go to Google's Gemini AI, with your personal details hidden. "
        'For anything more, ask the team at '
        '$kSupportEmail.',
        [ChatAction.ask('Is this app safe to use?')],
      ),
    ),
    _Faq(
      (m) =>
          m.anyPhrase(['what permissions', 'which permissions',
            'permissions does', 'what does the app access', 'access to my',
            'why does it need my location', 'why does the app need my location',
            'why do you need my location', 'why location', 'camera access',
            'use my camera', 'use my microphone', 'access my contacts']) ||
          m.has({'camera', 'microphone', 'contacts'}) && m.has({'app', 'use', 'access'}),
      const ChatReply(
        'Smart Curb asks for your location (for your arrow and directions) '
        "and uses your phone's compass to turn the arrow the way you're "
        "facing. It doesn't use your camera, microphone or contacts.",
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(['rate the app', 'review the app', 'leave a review',
            'give a rating', 'rate it', 'write a review', '5 stars',
            'five stars', 'rate you', 'rate this']),
      const ChatReply(
        "Thank you, that means a lot! The best way to share what you think "
        'is to tell the team at $kSupportEmail. They read every message.',
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(['name of the app', 'app called', 'app name',
            'apps name', 'what is this app called', 'name of this app']),
      const ChatReply(
        "It's called Smart Curb! Smart curbs in the parking spaces, and "
        'this app to find the open ones.',
      ),
    ),
    // ---- things people ask the assistant to do that it can't ----
    _Faq(
      (m) => m.anyPhrase([
        'park my car', 'park the car', 'park it for me', 'park for me',
        'drive for me', 'drive me', 'drive my car', 'valet',
      ]),
      const ChatReply(
        "Ha, I wish I could! I can't drive or park your car, but I can find "
        "you the best open spot and guide you right to it. Where are you "
        'heading?',
        [ChatAction.ask('Where should I park?')],
      ),
    ),
    _Faq(
      (m) => m.anyPhrase([
        'when a spot opens', 'when spot opens', 'when a spot is open',
        'when a spot frees', 'when spots open', 'notify me when',
        'alert me when', 'let me know when', 'tell me when', 'text me',
        'message me when', 'ping me', 'send me a notification',
      ]),
      const ChatReply(
        "I can't send texts or alerts yet, sorry! But the map updates live, "
        "so keep it open and you'll see a curb turn green the moment it "
        "frees up. And if your lot fills while you're driving, I switch you "
        'to another one automatically.',
        [ChatAction.ask('Open spots right now')],
      ),
    ),
    _Faq(
      (m) => m.anyPhrase([
        'call me', 'phone me', 'give me a call', 'call you', 'call support',
        'call the team', 'call someone', 'support number', 'phone number for',
        'your number', 'your phone number', 'email me', 'send me an email',
        'contact me',
      ]),
      const ChatReply(
        "I can't make calls or send emails, sorry! To reach a person on the "
        'Smart Curb team, email $kSupportEmail (it\'s also in the ⋮ menu > '
        "Settings > Contact Us). They'll get back to you.",
        [ChatAction.ask('What can you do?')],
      ),
    ),
    _Faq(
      (m) => m.anyPhrase([
        'where i parked', 'where did i park', 'remember where', 'find my car',
        'where is my car', 'wheres my car', 'locate my car', 'where my car is',
        'lost my car', 'cant find my car', 'where i left my car',
      ]),
      const ChatReply(
        "Sorry, I can't remember where you parked yet. Tip: while you park, "
        'the card at the bottom of the map shows your lot and curb (like '
        '"Park at C-077 • Lot 14"). Snapping a photo of the lot sign works '
        'great too!',
      ),
    ),
    _Faq(
      (m) => m.has({'remind', 'reminder', 'reminders', 'alarm', 'timer'}),
      const ChatReply(
        "I can't set reminders yet, sorry! Your phone's Clock or Reminders "
        'app is perfect for "move my car at 5". I\'ll be here to find you a '
        'spot next time.',
      ),
    ),
    // ---- things outside parking people still ask about ----
    _Faq(
      (m) =>
          m.has({'hours', 'closes', 'closing'}) ||
          m.anyPhrase(['opening hours', 'open hours', 'what time does',
            'is it open', 'is the mall open', 'is the library open',
            'open today', 'open until', 'open late', 'when does it open',
            'when does it close', 'when do they open', 'when do they close']),
      const ChatReply(
        "Sorry, I don't have opening hours for buildings or stores; FAU's "
        "and the mall's websites list them. But I can always find you a "
        'great spot!',
        [ChatAction.ask('Where should I park?')],
      ),
      withBuilding: true,
    ),
    _Faq(
      (m) => m.has({'bathroom', 'bathrooms', 'restroom', 'restrooms',
            'toilet', 'toilets', 'washroom'}),
      const ChatReply(
        "Sorry, I can't find restrooms yet. I'm all about parking! Most "
        'buildings and the mall have them inside, so the information desk '
        'is a good place to ask.',
      ),
    ),
    _Faq(
      (m) => m.has({'food', 'eat', 'restaurant', 'restaurants', 'hungry',
            'lunch', 'dinner', 'breakfast', 'coffee', 'cafe', 'starbucks'}),
      const ChatReply(
        "I can't recommend places to eat yet, but if you know where you're "
        "going, I'll find you parking right by it! At Broward Mall, Brio is "
        'on the map.',
        [
          ChatAction.ask('Park near Brio', 'Where should I park for Brio?'),
          ChatAction.ask('Where should I park?'),
        ],
      ),
    ),
    _Faq(
      (m) =>
          m.has({'battery', 'batteries', 'drain', 'draining', 'drains'}) &&
          !m.any({'curb', 'curbs', 'sensor', 'sensors'}),
      const ChatReply(
        'Navigation uses GPS, so like any map app it uses some battery '
        "while you drive. To save power, close the map once you've parked "
        'and arrived.',
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(['delete the app', 'uninstall', 'remove the app',
            'delete this app', 'get rid of the app']),
      const ChatReply(
        'You can uninstall Smart Curb like any other app. Just so you know: '
        "uninstalling doesn't delete your account, so your cars, places and "
        "contact info will be here if you come back. Sorry to see you go!",
        [ChatAction.ask('How do I delete my account?')],
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(['get the app', 'download the app', 'download it',
            'install the app', 'share the app', 'recommend the app',
            'app store', 'play store', 'friend wants the app',
            'friend needs the app', 'friend get the app', 'friends get the app',
            'tell my friend', 'invite my friend', 'invite a friend']),
      const ChatReply(
        'Thanks for spreading the word! Your friends can get Smart Curb the '
        'same way you did, then register with their own email. Each person '
        'needs their own account.',
        [ChatAction.ask('How do I register another account?')],
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(['close the chat', 'close chat', 'exit the chat',
            'leave the chat', 'hide the bubble', 'turn off the chat',
            'remove the bubble', 'hide the chat', 'get out of the chat',
            'turn you off', 'go away']),
      const ChatReply(
        "Sure! Tap the back arrow at the top left to close the chat. I'll "
        'be in the round bubble at the bottom right of Home, Vehicle and '
        'Profile whenever you need me.',
      ),
    ),
    // ---- parking questions with a twist ----
    _Faq(
      (m) =>
          m.anyPhrase(['near me', 'closest to me', 'nearest to me',
            'lot to me', 'spot to me', 'parking to me', 'closest to where i am',
            'around me', 'close to me', 'by me']) &&
          !m.anyPhrase(_gpsPhrases),
      const ChatReply(
        "Good question! I find spots by where you're going rather than "
        "where you are, since that's what makes your walk short. Tell me "
        "the building you're heading to and I'll pick the best open spot.",
        [ChatAction.ask('Where should I park?')],
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(['walking path', 'walk path', 'walking route',
            'walking directions', 'walk to the building', 'walk to the door',
            'directions to the door']),
      const ChatReply(
        'Yes! Once you arrive at your spot, the driving route goes away and '
        "a dotted green walking path appears from your spot to the "
        "building's door, with the distance left in the card at the bottom.",
        [ChatAction.ask('Where should I park?')],
      ),
    ),
    _Faq(
      (m) => m.has({'sensored'}) ||
          m.anyPhrase(['sensored spots', 'sensored spot']),
      const ChatReply(
        '"Sensored" spots are the parking spaces that have a Smart Curb, so '
        "I can see live whether each one is open. Other spaces in the lot "
        "aren't counted yet.",
        [ChatAction.ask('Which lots have Smart Curbs?')],
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(['cant find my building', 'cant find the building',
            'building isnt', 'building is not', 'building not', 'not in the list',
            'not on the map', 'missing building', 'building is missing',
            'not in the search', 'cant find it in the search']),
      const ChatReply(
        "Sorry about that! Try the building's code (like ED-47) or a single "
        'word from its name, like "library" or "business". Tell me here and '
        "I'll search too. If it's really missing, the team would like to "
        'know: $kSupportEmail.',
        [ChatAction.ask('What buildings are there?')],
      ),
    ),
    // ---- accounts ----
    _Faq(
      (m) => m.anyPhrase([
        'why do i need an account', 'why an account', 'without an account',
        'without account', 'without signing', 'without logging',
        'need an account', 'need account', 'need to sign up',
        'need to register', 'as a guest', 'guest mode',
      ]),
      const ChatReply(
        'Yes, Smart Curb needs an account. It keeps your vehicles, saved '
        'places and contact info safe and with you on any phone. Signing up '
        "only takes an email and a password, and you're already signed in!",
        [ChatAction.ask('How do I register another account?')],
      ),
    ),
    _Faq(
      (m) =>
          m.has({'google', 'apple', 'facebook', 'gmail', 'microsoft', 'sso',
            'outlook', 'icloud'}) &&
          m.has({'sign', 'log', 'login', 'signin', 'account', 'register',
            'signup', 'with', 'use'}) &&
          !m.has({'maps', 'map', 'waze'}),
      const ChatReply(
        'Not right now: Smart Curb signs in with an email and a password '
        'only. You can use any email address, including a Gmail or iCloud '
        'one.',
      ),
    ),
    // ---- parking rules ----
    _Faq(
      (m) => m.has({'visitor', 'visitors', 'guest', 'guests'}),
      const ChatReply(
        'Visitor rules depend on the place. At FAU, check Parking and '
        'Transportation Services for visitor permits and where visitors can '
        "park; at Broward Mall, follow the signs in the lot. Tell me where "
        "you're going and I'll find the closest lot.",
        [ChatAction.ask('Where should I park?')],
      ),
      withBuilding: true,
    ),
    _Faq(
      (m) =>
          m.has({'motorcycle', 'motorcycles', 'motorbike', 'scooter',
            'scooters', 'bike', 'bikes', 'bicycle', 'moped'}) &&
          !m.has(_addWords),
      const ChatReply(
        "Smart Curb spaces are regular car spaces, and I don't track "
        'motorcycle or bike parking yet, so please follow the signs at the '
        'lot. You can still add a motorcycle to your vehicles if you like!',
        [ChatAction.ask('Add a vehicle')],
      ),
      withBuilding: true,
    ),
    _Faq(
      (m) => m.has({'ticket', 'tickets', 'citation', 'citations', 'towed',
            'towing', 'booted'}) ||
          m.anyPhrase(['parking fine', 'got a fine']),
      const ChatReply(
        "Sorry to hear that! Smart Curb doesn't issue or handle parking "
        'tickets. At FAU, Parking and Transportation Services handles '
        'tickets and appeals; anywhere else, follow the instructions on the '
        'ticket.',
      ),
    ),
    _Faq(
      (m) => m.has({'refund', 'refunds', 'charged', 'overcharged'}) ||
          m.hasPhrase('money back'),
      const ChatReply(
        "There's nothing to refund in Smart Curb: the app is free and never "
        'charges you. For parking fees or permits, contact whoever runs the '
        'lot (at FAU, Parking and Transportation Services).',
      ),
    ),
    // ---- the map ----
    _Faq(
      (m) =>
          m.has({'route', 'directions', 'navigation', 'path', 'way'}) &&
          m.has({'wrong', 'weird', 'bad', 'incorrect', 'strange', 'long',
            'longer', 'crazy', 'broken', 'off', 'odd'}),
      const ChatReply(
        'Sorry about that! Routes follow real roads and update as you '
        'drive. If one looks off: make sure your location is on so I know '
        "where you are, then tap the ✕ in the search bar and pick the "
        "building again to redraw it. If a road is closed, just drive around "
        "it and I'll reroute. Still wrong? Tell the team at $kSupportEmail.",
      ),
    ),
    _Faq(
      (m) => m.anyPhrase([
        'see my location', 'my location on the map', 'show my location',
        'where am i on the map', 'find myself', 'see where i am',
        'show where i am', 'my position on the map',
      ]),
      const ChatReply(
        "You're the arrow on the map! It points the way you're facing. Tap "
        'the arrow button at the top right to have the map follow you '
        "(focus mode). Don't see your arrow? Make sure location is turned on "
        'and allowed for Smart Curb (or your browser).',
      ),
    ),
    _Faq(
      (m) =>
          (m.has({'line', 'lines', 'dotted', 'arrow', 'dots', 'blocks',
                'block'}) &&
              m.has({'what', 'whats', 'mean', 'means', 'meaning'}) &&
              !m.has({'button'})) ||
          m.anyPhrase(['blue line', 'green line', 'dotted line', 'map symbols',
            'map icons', 'what am i looking at']),
      const ChatReply(
        "Here's what you see on the map:\n"
        "• The arrow is you, pointing the way you're facing\n"
        '• The bright green line is your driving route\n'
        '• After you park, the dotted green line is your walk to the door\n'
        '• Dots with names are parking lots (tap one for details)\n'
        '• Colored blocks are Smart Curb spaces: green open, red taken, '
        'gray offline',
        [ChatAction.ask('What do the colors mean?')],
      ),
    ),
    // ---- the curbs themselves ----
    _Faq(
      (m) => m.has({'detect', 'detects', 'detection', 'sense', 'senses',
            'sensing'}) ||
          m.anyPhrase(['know if a car', 'know when a car', 'know a car',
            'know if a spot', 'know if someone']),
      const ChatReply(
        'Great question! Each Smart Curb sits at the front of a parking '
        'space, where the concrete wheel stop usually goes, and senses '
        'whether a car is parked there. It reports that live, so the map '
        'shows the spot as open (green) or taken (red) within moments.',
        [ChatAction.ask('What do the colors mean?')],
      ),
    ),
    _Faq(
      (m) =>
          m.has({'curb', 'curbs', 'sensor', 'sensors', 'led', 'light',
            'lights'}) &&
          m.has({'broken', 'wrong', 'damaged', 'incorrect', 'stuck', 'dead',
            'cracked', 'off', 'flickering', 'malfunctioning'}),
      const ChatReply(
        'Sorry about that! If a curb looks broken or shows the wrong status, '
        'please tell the team at $kSupportEmail with the curb\'s number '
        '(like C-077, shown on the map) and the lot. If a curb stops '
        'reporting, it turns gray and I stop sending people to it.',
        [ChatAction.ask('Contact support')],
      ),
    ),
    _Faq(
      (m) =>
          m.has({'curb', 'curbs', 'sensor', 'sensors'}) &&
          m.has({'battery', 'batteries', 'power', 'powered', 'charge',
            'charged', 'electricity', 'energy', 'wires', 'wired', 'plugged'}),
      const ChatReply(
        'Each Smart Curb is solar-powered, so it runs on its own without '
        'wires to the lot. If you have questions about the hardware, the '
        'team is at $kSupportEmail.',
        [ChatAction.ask('How does Smart Curb work?')],
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(['at night', 'in the dark', 'after dark',
            'night time', 'nighttime', 'in the evening']),
      const ChatReply(
        'Yes! The app works the same day and night, and the curbs keep '
        'sensing spots after dark.',
        [ChatAction.ask('Open spots right now')],
      ),
    ),
    _Faq(
      (m) => m.anyPhrase([
        'smart curb cost', 'curb cost', 'cost of a curb', 'cost of a smart',
        'buy a curb', 'buy a smart curb', 'buy smart curbs', 'price of a curb',
        'how much is a curb', 'how much is a smart curb',
        'how much does a curb', 'how much does a smart curb',
        'get a smart curb', 'install a curb', 'install smart curb',
        'install smart curbs', 'install a smart curb', 'curbs for sale',
      ]),
      const ChatReply(
        "Smart Curb is an FAU Engineering senior design project, so the "
        "curbs aren't for sale right now. If you're interested in the "
        'hardware, the team would love to hear from you at $kSupportEmail.',
        [ChatAction.ask('How does Smart Curb work?')],
      ),
    ),
    // ---- ideas for the app ----
    _Faq(
      (m) =>
          m.anyPhrase(['add a feature', 'feature request', 'new feature',
            'suggestion', 'i suggest', 'an idea', 'improve the app',
            'wish the app', 'it would be nice', 'you should add',
            'would be cool', 'request a feature']) &&
          !m.any(_vehicleWords) &&
          !m.any(_placeWords),
      const ChatReply(
        'I love that! Feature ideas go straight to the team at '
        "$kSupportEmail, and they read every one. Tell them what you'd like "
        "and how you'd use it.",
      ),
    ),
    // ---- why the app asks for things ----
    _Faq(
      (m) => m.anyPhrase(_whyNeedPhrases) && m.any(_vehicleWords),
      const ChatReply(
        "Adding your car is optional: Smart Curb finds you a spot either "
        'way. Saving it just keeps its details (like the plate) handy in one '
        'place.',
        [ChatAction.ask('My vehicles')],
      ),
    ),
    _Faq(
      (m) =>
          m.anyPhrase(_whyNeedPhrases) &&
          (m.any(_profileWords) || m.has({'address', 'phone', 'gender'})),
      const ChatReply(
        "It's part of your Smart Curb account profile, so your details are "
        'in one place. You can view or change it any time, here in the chat '
        'or in the Profile tab.',
        [ChatAction.ask('My profile')],
      ),
    ),
    _Faq(
      (m) => m.has({'default', 'primary'}) && m.any(_vehicleWords),
      const ChatReply(
        "There's no default car to set: Smart Curb doesn't need to know "
        'which car you drive to find you a spot. Your cars are simply saved '
        'on the Vehicle tab.',
        [ChatAction.ask('My vehicles')],
      ),
    ),
    _Faq(
      (m) =>
          (m.has(_stopWords) || m.hasPhrase('turn off')) &&
          (m.has(_routeWords) || m.hasPhrase('focus mode')),
      const ChatReply(
        'Sure! '
        'To stop navigating, tap the ✕ in the search bar at the top of the '
        'map: the route and the destination clear. To leave turn-by-turn '
        'focus mode but keep the route, tap the arrow button at the top '
        'right again. The back arrow at the top left takes you out of the '
        'map.',
        [ChatAction.ask('How do I choose a building?')],
      ),
      cantDo: 'stop your route from the chat',
    ),
    _Faq(
      (m) =>
          m.anyPhrase(_focusPhrases) &&
          !m.any(_parkWords) &&
          // "The arrow isn't moving" is GPS trouble, not a how-to.
          !m.has(const {
            'isnt', 'wont', 'cant', 'doesnt', 'dont', 'wrong', 'broken',
            'working', 'stuck', 'lost', 'jumping', 'jumps', 'moving',
            'frozen', 'updating',
          }),
      const ChatReply(
        'Good question! '
        'Focus mode follows you turn by turn. On the map, once your GPS is '
        'found, tap the arrow button at the top right (next to Reset Map '
        'View): the map zooms in, turns with your heading and follows your '
        'arrow along the route. Tap it again to leave focus mode.',
        [ChatAction.ask('How do I choose a building?')],
      ),
      cantDo: 'turn on focus mode from the chat',
    ),
    _Faq(
      (m) =>
          m.has({'save', 'saved', 'favorite', 'favourite', 'favorites',
            'favourites', 'bookmark', 'star'}) &&
          m.any(_destinationWords),
      const ChatReply(
        'Not yet, sorry! '
        "Single buildings can't be saved yet, only places (like FAU) on "
        'Home. To go to a building, search for it on the place\'s map, or '
        "just tell me its name here: that's the quickest way.",
        [
          ChatAction.ask('Where should I park?'),
          ChatAction.ask('My saved places'),
        ],
      ),
    ),
    _Faq(
      (m) =>
          m.anyPhrase(_destinationPhrases) ||
          (m.any(_destinationWords) &&
              !m.any(_parkWords) &&
              (m.has(_chooseWords) || m.anyPhrase(_howToPhrases))),
      const ChatReply(
        "Sure, it's easy! "
        "To choose where you're going:\n"
        '1. On Home, tap a place (like Florida Atlantic University) to open '
        'its map. Not there? Tap "Add more locations" first.\n'
        '2. Tap the search bar at the top ("Search for destination...") and '
        'type the building\'s name or code, like "library" or ED-47, then '
        'pick it from the list. You can also just tap the building on the '
        'map.\n'
        '3. I pick the best lot or open curb and draw your route there.\n'
        'To change it, search for another building, or tap the ✕ in the '
        'search bar to clear it. Or skip all that: tell me the building '
        'right here and tap Navigate there.',
        [
          ChatAction.ask('Where should I park?'),
          ChatAction.tab('Go to Home', kHomeTab),
        ],
      ),
      asksPlace: true,
    ),
    _Faq(
      (m) =>
          m.has({'search', 'filter', 'searching'}) &&
          m.any(_placeWords) &&
          !m.any(_destinationWords),
      const ChatReply(
        'Sure! '
        'The search box at the top of Home filters your saved places as you '
        'type. To search for a building, open a place\'s map and use the '
        'search bar at the top there.',
        [ChatAction.tab('Go to Home', kHomeTab)],
      ),
    ),
    _Faq(
      (m) =>
          m.has(_mapWords) &&
          (m.has(_mapTrouble) || m.hasPhrase('not working') ||
              m.hasPhrase('not loading') || m.hasPhrase("won't load")),
      const ChatReply(
        "Sorry the map's giving you trouble! "
        'If the map is blank or stuck, check your internet connection, then '
        'go back to Home and open the place again. Still stuck? Close and '
        'reopen the app. If it keeps happening, tell the team at '
        '$kSupportEmail and say which phone you use.',
        [ChatAction.tab('Go to Home', kHomeTab)],
      ),
    ),
    _Faq(
      (m) =>
          m.has(_mapWords) &&
          m.has(_openWords) &&
          !m.has(_colorWords) &&
          !m.has(_routeWords) &&
          !m.has(_spotQuestion) &&
          !RegExp(r'\d').hasMatch(m.text),
      const ChatReply(
        'Sure! '
        'Maps open from Home: tap a place card (like Florida Atlantic '
        'University) and its live map opens with every lot and building. '
        'No places yet? Tap "Add more locations" on Home and add one first.',
        [
          ChatAction.tab('Go to Home', kHomeTab),
          ChatAction.ask('How do I choose a building?'),
        ],
      ),
      asksPlace: true,
    ),
    _Faq(
      (m) => m.anyPhrase(_backPhrases),
      const ChatReply(
        'No problem! '
        'On a map, the back arrow at the top left takes you back to Home. '
        'On the main screen, switch between Home, Vehicle and Profile with '
        'the bar at the bottom.',
        [ChatAction.tab('Go to Home', kHomeTab)],
      ),
    ),
    _Faq(
      (m) =>
          (m.has(_tapWords) &&
              m.has(_lotPartWords) &&
              !m.has(_colorWords) &&
              !m.has(_spotQuestion) &&
              !RegExp(r'\d').hasMatch(m.text)) ||
          m.anyPhrase(_lotDetailPhrases),
      const ChatReply(
        'Easy! '
        "On a place's map, tap a lot's dot. A bubble shows the lot's name "
        'and how many spots are free (like 3/5 free), with each curb listed '
        'as available, occupied or offline. Tap anywhere else on the map to '
        'close it.',
        [ChatAction.ask('What do the colors mean?')],
      ),
    ),
    _Faq(
      (m) =>
          m.has({'3d', '2d', 'tilt', 'tilted', 'perspective'}) ||
          m.anyPhrase(['3 d', '2 d', 'three d']),
      const ChatReply(
        'Sure! '
        'On the map, tap the 3D button at the top right (the cube or map '
        'icon) to tilt the map into 3D, and again to go back to flat 2D.',
      ),
      cantDo: 'switch the map to 3D from the chat',
    ),
    _Faq(
      (m) =>
          m.has({'recenter', 'zoom', 'zooming'}) ||
          m.anyPhrase([
            'reset the map', 'reset map', 'reset view', 'reset the view',
            're center', 'center the map', 'centre the map', 'lost on the map',
            'see the whole', 'whole map', 'whole campus',
          ]),
      const ChatReply(
        'No worries, that happens! '
        'Tap Reset Map View (the square target icon at the top right of the '
        'map) to zoom back out to the whole place. It also clears your '
        'destination and leaves focus mode. Pinch to zoom in and out.',
      ),
      cantDo: 'move the map from the chat',
    ),
    _Faq(
      (m) =>
          m.any({'developer', 'simulate', 'simulation', 'teleport'}) ||
          m.has({'dev', 'demo', 'simulator'}) ||
          m.anyPhrase(['click to move', 'travel to fau']),
      const ChatReply(
        'Good question! '
        'Developer mode is for testing and demos. On a map, tap the '
        'developer icon at the top right. Then you can see and copy the '
        'coordinates of any tap, use "Click to move" to put your arrow '
        'anywhere, "Travel to FAU" to jump there, and "Simulate Run" / '
        '"Simulate Walk" to play the drive and the walk. Tap the icon again '
        'to turn it off.',
      ),
      cantDo: 'turn on developer mode from the chat',
    ),
    _Faq(
      (m) => m.has(_privacyWords) || m.anyPhrase(_privacyPhrases),
      const ChatReply(
        'Good question, your privacy matters! '
        'Your location is used on your phone to show your arrow and route '
        "you; Smart Curb doesn't save it to your account. What's stored is "
        'what you enter yourself: your profile, your vehicles and your saved '
        'places, tied to your login. The curbs only report whether each spot '
        "is taken or open. Chat questions I can't answer myself may go to "
        "Google's Gemini AI (with your name, email and phone number hidden), "
        'so please never share passwords in the chat.',
        [ChatAction.ask('Contact support')],
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(_lostPhrases),
      const ChatReply(
        "No worries! Open the place's map from Home: your arrow shows where "
        'you are, and Reset Map View (top right) zooms back out to the whole '
        "place. Tell me the building you're going to, tap Navigate there, "
        "and I'll guide you.",
        [
          ChatAction.ask('Where should I park?'),
          ChatAction.tab('Go to Home', kHomeTab),
        ],
      ),
    ),
    _Faq(
      (m) =>
          m.anyPhrase(_gpsPhrases) ||
          ((m.has({'gps', 'location'}) || m.anyPhrase(_gpsWhosePhrases)) &&
              m.has(_gpsTrouble)),
      const ChatReply(
        "Sorry about that, let's fix it! "
        "Smart Curb uses your phone's GPS to show your arrow and route you. "
        "If it can't find you: turn on Location Services, allow Smart Curb "
        '(or your browser) to use your location, then open the map again. '
        'The card at the bottom of the map shows the GPS status. Between '
        'tall buildings it can take a few seconds to lock on.',
      ),
      cantDo: 'turn on your phone\'s location from the chat',
    ),
    _Faq(
      // "When does the lot fill up?" is about busy times (below).
      (m) =>
          m.anyPhrase(_fillsUpPhrases) &&
          !m.anyPhrase(['when does', 'when do', 'what time']),
      const ChatReply(
        'No problem: the route follows the curbs live. If your lot (or curb) '
        "fills up while you're driving, I switch you to the next best lot "
        "and redraw the route by myself. Once you're at your curb or parked, "
        'I leave your spot as it is.',
        [ChatAction.ask('Open spots right now')],
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(_parkedPhrases),
      const ChatReply(
        'Nice work! '
        'Once you park, the driving route goes away and a walking path '
        "appears from your spot to the building's door, with the distance "
        "counting down in the bottom card. Follow it and I'll tell you when "
        "you've arrived.",
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(_walkPhrases) || m.has({'eta'}),
      const ChatReply(
        'Good question! '
        'The card at the bottom of the map shows it: "Drive ... • then walk '
        '..." on the way, and the walk left once you park. Walks follow the '
        "real sidewalks, not a straight line. Tell me a building and I'll "
        'give you the walk from its best lot.',
        [ChatAction.ask('Where should I park?')],
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(_whyLotPhrases),
      const ChatReply(
        'Happy to explain! '
        'I pick the open lot (or curb) that gives you the shortest walk to '
        "the building's door, measured along the real walking paths. Full "
        "lots, offline curbs and lots without sensors are skipped, so the "
        "nearest lot isn't always the pick. If none is left, the map tells you "
        "there's no available parking right now. If yours fills while you "
        "drive, I switch you to the next best one.",
        [ChatAction.ask('Where should I park?')],
      ),
    ),
    _Faq(
      (m) => m.has(_reserveWords) || m.anyPhrase(_reservePhrases),
      const ChatReply(
        'Unfortunately not. '
        "Spots can't be reserved: they're first come, first served. Smart "
        'Curb shows which are open right now and sends you to one, and if '
        "it's taken before you get there, I switch you to another.",
        [ChatAction.ask('Open spots right now')],
      ),
      withBuilding: true,
    ),
    _Faq(
      (m) => m.has(_evWords) || m.anyPhrase(_evPhrases),
      const ChatReply(
        'Sorry, not yet! '
        "Charging stations aren't on the Smart Curb map yet. I can still "
        "find you the closest lot with space.",
        [ChatAction.ask('Where should I park?')],
      ),
      withBuilding: true,
    ),
    _Faq(
      (m) => m.has(_accessibleWords) || m.anyPhrase(_accessiblePhrases),
      const ChatReply(
        'Thanks for asking. '
        "Smart Curb doesn't mark accessible (ADA) spaces separately yet, so "
        'please use the accessible spaces signed at each lot. I can still '
        'find the lot closest to your building.',
        [ChatAction.ask('Where should I park?')],
      ),
      withBuilding: true,
    ),
    _Faq(
      (m) =>
          m.has(_costWords) ||
          m.anyPhrase(_costPhrases) ||
          m.has(_rulesWords) ||
          m.anyPhrase(_rulesPhrases) ||
          // "Is parking free?" is about money; "...free right now?" is
          // about open spots.
          (m.anyPhrase(['is parking free', 'parking free', 'free parking',
                'parking cost']) &&
              !m.has({'now', 'currently', 'today', 'right', 'spots',
                'spaces'})),
      const ChatReply(
        'Good question! '
        "The Smart Curb app is free. It doesn't sell parking permits or take "
        "payments, and it doesn't set the parking rules (permits, time "
        'limits, overnight parking): follow the signs at the lot, and at '
        'FAU check Parking and Transportation Services.',
      ),
      withBuilding: true,
      cantDo: 'pay for parking or buy permits',
      cantDoHowTo: false,
    ),
    _Faq(
      (m) => m.anyPhrase(_bestTimePhrases),
      const ChatReply(
        'I wish I could tell you! '
        "I don't keep parking history yet, so I can't predict busy times. "
        'I can show you what\'s open right now, and if a lot fills on your '
        "way, I'll move you to another.",
        [ChatAction.ask('Open spots right now')],
      ),
      withBuilding: true,
    ),
    _Faq(
      (m) => m.has(_internetWords) || m.anyPhrase(_internetPhrases),
      const ChatReply(
        'Good question! '
        'Smart Curb needs an internet connection for live spot counts and '
        "routes. With a weak signal the map may lag; once you're back "
        'online it catches up by itself.',
      ),
    ),
    _Faq(
      (m) =>
          m.has({'offline'}) ||
          m.hasPhrase('not reporting') ||
          // A gray lot has no sensors (the colors answer); a gray curb is
          // offline.
          (m.has({'gray', 'grey'}) &&
              m.has({'why', 'curb', 'curbs'}) &&
              !m.has({'lot', 'lots'})),
      const ChatReply(
        'Good eye! '
        "A gray curb is offline: it isn't reporting right now (for example "
        "low power or a lost connection), so I don't know if its spot is "
        "free and I won't send you there. It's left out of the lot's count. "
        'If a curb stays offline, let the team know.',
        [ChatAction.ask('Contact support')],
      ),
    ),
    _Faq(
      (m) => m.has(_accuracyWords) || m.anyPhrase(_accuracyPhrases),
      const ChatReply(
        'Good question! '
        'The counts are live: each curb reports when a car pulls in or '
        'leaves, and the map updates right away, no refresh needed. Gray '
        "(offline) curbs are left out. If a spot shows open but isn't, "
        "someone may have just pulled in; I'll switch you to another spot.",
        [ChatAction.ask('Open spots right now')],
      ),
    ),
    _Faq(
      (m) => m.any(_notificationWords),
      const ChatReply(
        'Sure! '
        'Notifications are in the ⋮ menu at the top right of the main '
        'screen > Settings > Notifications. Flip the switch to turn them on '
        'or off.',
      ),
      cantDo: 'change your settings from the chat',
    ),
    _Faq(
      (m) => m.has({'settings', 'setting', 'preferences'}),
      const ChatReply(
        'Sure! '
        'Settings are in the ⋮ menu at the top right of the Home, Vehicle '
        'and Profile screens. There you can turn notifications on or off '
        'and find Contact Us. About App is in the same menu.',
      ),
      cantDo: 'open or change your settings from the chat',
    ),
    _Faq(
      (m) => m.has({'version'}) || m.anyPhrase(_versionPhrases),
      const ChatReply(
        "You're on Smart Curb version $kAppVersion. You can see it any time "
        'in the ⋮ menu > About App.',
      ),
      cantDo: 'update the app from the chat',
    ),
    _Faq(
      (m) =>
          m.anyPhrase(_signUpPhrases) ||
          m.has({'signup', 'registration'}) ||
          (m.has({'register'}) && !m.any(_vehicleWords)),
      const ChatReply(
        "Sure! You're already signed in, so to register another account:\n"
        '1. Log out with the icon at the top left of the main screen.\n'
        '2. On the login screen, tap "Don\'t have an account? Register".\n'
        '3. Enter the new email and a password (twice), then tap Register.\n'
        "You'll be signed in to the new account right away. To come back to "
        'this one, log out and log in with your current email. (Smart Curb '
        'needs an account, so each person should have their own.)',
        [ChatAction.ask('How do I log out?')],
      ),
      cantDo: 'create or register an account for you from the chat. For '
          'your security, only you can sign up',
    ),
    _Faq(
      (m) =>
          m.has({'email', 'mail'}) &&
          (m.has(_editWords) || m.has({'new', 'different', 'another'})),
      const ChatReply(
        'Sorry about that! '
        "Your email is your login, so it can't be changed in the app yet. "
        'Contact support and the team can move your account to a new email.',
        [ChatAction.ask('Contact support')],
      ),
      cantDo: 'change your email from the chat',
    ),
    _Faq(
      (m) =>
          (m.has({'account'}) &&
              (m.has(_removeWords) ||
                  m.has({'close', 'deactivate', 'cancel', 'terminate'}))) ||
          m.anyPhrase(['delete my data', 'remove my data', 'delete everything']),
      const ChatReply(
        'Sorry to see you go! '
        "Deleting an account isn't in the app yet. Email the team at "
        '$kSupportEmail from the address you signed up with, and they\'ll '
        'delete it along with your vehicles and saved places.',
      ),
      cantDo: 'delete your account from the chat. For your security, that goes through the team',
    ),
    _Faq(
      (m) =>
          (m.anyPhrase(_gettingStartedPhrases) ||
              m.has({'tutorial', 'instructions', 'onboarding', 'manual'})) &&
          // "How do I use focus mode": the map's own how-to.
          !m.has(_navigationWords) &&
          !m.hasPhrase('focus mode'),
      const ChatReply(
        'Welcome! '
        "Here's how to use Smart Curb:\n"
        '1. On Home, add a place (FAU or Broward Mall) with "Add more '
        'locations".\n'
        '2. Tap the place to open its live map.\n'
        "3. Search for the building you're going to, or tap it on the map.\n"
        '4. Drive to the lot or curb I pick, then follow the walking path to '
        'the door.\n'
        'Add your car on the Vehicle tab and your details on Profile. Or '
        'skip the map: tell me a building and tap Navigate there.',
        [
          ChatAction.ask('How do I choose a building?'),
          ChatAction.ask('Where should I park?'),
          ChatAction.tab('Go to Home', kHomeTab),
        ],
      ),
    ),
    _Faq(
      (m) =>
          m.has({'voice', 'audio', 'spoken', 'sound', 'sounds', 'narration'}) ||
          m.anyPhrase(_voicePhrases),
      const ChatReply(
        'Not yet, sorry! '
        'Directions are on screen for now, with no spoken voice yet. Follow '
        'the route line and the card at the bottom, or turn on focus mode '
        '(the arrow button at the top right of the map) so the map turns '
        'with you.',
      ),
    ),
    _Faq(
      (m) =>
          m.has({'theme', 'themes', 'darkmode', 'lightmode', 'brightness'}) ||
          m.anyPhrase(_themePhrases),
      const ChatReply(
        'Smart Curb uses a dark theme, made to be easy on the eyes in the '
        "car. A light mode isn't available yet.",
      ),
    ),
    _Faq(
      (m) => m.has({
        'spanish', 'espanol', 'language', 'languages', 'french', 'vietnamese',
        'chinese', 'portuguese', 'creole', 'idioma', 'hablas', 'habla',
      }),
      const ChatReply(
        'Sorry, I only understand English for now. Try asking me in English '
        'and I\'ll do my best!',
        menu,
      ),
    ),
    _Faq(
      (m) => m.has({
        'weather', 'forecast', 'raining', 'rain', 'rains', 'rainy',
        'temperature',
        'sunny', 'storm', 'hurricane',
      }),
      const ChatReply(
        "I can't check the weather, but rain or shine the app works the "
        'same, and on a rainy day a spot close to the door really helps! '
        "Tell me your building and I'll find the closest open lot.",
        [ChatAction.ask('Where should I park?')],
      ),
    ),
    _Faq(
      // ("I crashed my car" isn't about the app.)
      (m) =>
          (m.has(_appTrouble) ||
              (m.has({'app'}) &&
                  m.anyPhrase(['wont start', 'wont open', 'doesnt open',
                    'not opening', 'wont load', 'keeps closing',
                    'doesnt work', 'not working', 'stopped working']))) &&
          !m.any(_vehicleWords),
      const ChatReply(
        'Sorry about that! Try closing and reopening the app, and check your '
        'internet connection. If it keeps happening, tell the team at '
        '$kSupportEmail what you were doing and which phone you use.',
        [ChatAction.ask('Contact support')],
      ),
    ),
  ];

  /// Every word the assistant knows. A word in here is taken as itself and
  /// never "typo-corrected" into a different known word ("places" is not a
  /// misspelled "plates", "smart" is not "start").
  static final Set<String> known = {
    ..._greetings, ..._thanks, ..._bye, ..._help, ..._joke, ..._parkWords,
    ..._spotWords, ..._availability, ..._vehicleWords, ..._placeWords,
    ..._profileWords, ..._addWords, ..._removeWords, ..._editWords,
    ..._logoutWords, ..._passwordWords, ..._colorWords, ..._navigationWords,
    ..._howItWorksWords, ..._supportWords, ..._insults, ..._yes, ..._no,
    ..._humanWords, ..._destinationWords, ..._chooseWords, ..._stopWords,
    ..._routeWords, ..._mapWords, ..._mapTrouble, ..._openWords,
    ..._appTrouble, ..._tapWords, ..._lotPartWords, ..._gpsTrouble,
    ..._privacyWords, ..._reserveWords, ..._evWords, ..._accessibleWords,
    ..._costWords, ..._internetWords, ..._accuracyWords,
    ..._notificationWords, ..._rulesWords, ..._okay, ..._hurryWords,
    ..._frustratedWords, 'settings', 'version', 'register',
    'account', 'offline', 'gps', 'favorite', 'favourite', 'policy',
    'policies', 'privacy', 'terms', 'update', 'updated', 'updates',
  };
}

/// A question about using the app and its answer.
class _Faq {
  const _Faq(
    this.when,
    this.reply, {
    this.withBuilding = false,
    this.asksPlace = false,
    this.cantDo,
    this.cantDoHowTo = true,
  });

  /// After "I can't [cantDo]": "here's how you can do it yourself" (true),
  /// or just the explanation (when there's nothing to do yourself).
  final bool cantDoHowTo;

  final bool Function(_Message m) when;
  final ChatReply reply;

  /// What the assistant can't do for the user here ("create accounts"),
  /// when they ask it to ("can you register an account for me?"): it says
  /// so honestly, then how to do it themselves.
  final String? cantDo;

  /// Ends by asking which place, with each place's live count and a chip
  /// that opens its map.
  final bool asksPlace;

  /// Also worth saying with a building's parking answer: "accessible
  /// parking near the library" gets this, then where to park.
  final bool withBuilding;
}

// ---- understanding a message ----

/// A message, normalized: lower case, plain apostrophes, punctuation
/// dropped. Word checks forgive small typos in longer words.
class _Message {
  _Message(this.raw)
      : text = raw
            .toLowerCase()
            .replaceAll(RegExp(r"[’‘`´]"), "'")
            .replaceAll(RegExp(r"[^a-z0-9'#\- ]"), ' ')
            .replaceAll(RegExp(r'\s+'), ' ')
            .trim() {
    _flat = text.replaceAll("'", '');
    tokens = [
      for (final t in _flat.split(RegExp(r'[\s\-]+')))
        if (t.isNotEmpty) t,
    ];
  }

  /// As typed (for "2+2", whose "+" [text] drops).
  final String raw;
  final String text;
  late final List<String> tokens;

  /// [text] without apostrophes, so "where i'm going" also reads as
  /// "where im going".
  late final String _flat;

  bool get short => tokens.length <= 6;

  bool get hasGreeting =>
      tokens.isNotEmpty &&
      (SmartCurbAssistant._greetingStarters.contains(tokens.first) ||
          hasPhrase('good morning') ||
          hasPhrase('good afternoon') ||
          hasPhrase('good evening'));

  /// Nothing but a hello ("hi", "hey there", "good morning smart curb").
  bool get isOnlyGreeting =>
      hasGreeting &&
      tokens.every(SmartCurbAssistant._greetings.contains);

  bool hasPhrase(String phrase) =>
      ' $text '.contains(' $phrase ') || ' $_flat '.contains(' $phrase ');
  bool anyPhrase(List<String> phrases) => phrases.any(hasPhrase);

  /// Any of [words] appears exactly. For words where typo-forgiveness
  /// would mix things up ("changing" is not a misspelled "charging").
  bool has(Set<String> words) => tokens.any(words.contains);

  /// Any of [words] appears, forgiving a typo in a longer word ("parkng",
  /// "vehical"), but only in a word it doesn't already know as something
  /// else (see [SmartCurbAssistant.known]).
  bool any(Set<String> words) {
    for (final t in tokens) {
      if (words.contains(t)) return true;
      if (t.length < 6 || SmartCurbAssistant.known.contains(t)) continue;
      for (final w in words) {
        if (w.length < 6 || (w.length - t.length).abs() > 2) continue;
        if (editDistance(t, w, max: w.length >= 7 ? 2 : 1) != null) return true;
      }
    }
    return false;
  }
}

/// Levenshtein distance between [a] and [b] if it's at most [max], else
/// null (stopping early once it's sure to be over).
int? editDistance(String a, String b, {int max = 2}) {
  if ((a.length - b.length).abs() > max) return null;
  var prev = List<int>.generate(b.length + 1, (i) => i);
  for (var i = 1; i <= a.length; i++) {
    final cur = List<int>.filled(b.length + 1, 0)..[0] = i;
    var rowMin = cur[0];
    for (var j = 1; j <= b.length; j++) {
      final cost = a[i - 1] == b[j - 1] ? 0 : 1;
      cur[j] = math.min(math.min(cur[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
      rowMin = math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return null;
    prev = cur;
  }
  return prev[b.length] <= max ? prev[b.length] : null;
}

// ---- buildings named in a message ----

class _Hit {
  final Place place;
  final PlaceBuilding building;
  final double score;

  /// Every word of the building's name is in the message.
  final bool wholeName;
  const _Hit(this.place, this.building, this.score, {this.wholeName = false});
}

/// Finds the building a message is about: by code ("ED-47", "ed47",
/// "ed 47") or by the words of its name, each word weighted by how rare it
/// is among all buildings, so "business" alone means BU-86 but "college"
/// alone could be several.
class _BuildingIndex {
  _BuildingIndex(this.places) {
    for (final p in places) {
      for (final b in p.buildings) {
        final words = _wordsOf(b);
        _words[b] = words;
        for (final w in words) {
          _df[w] = (_df[w] ?? 0) + 1;
        }
        _placeOf[b] = p;
      }
    }
  }

  final List<Place> places;
  final Map<PlaceBuilding, Set<String>> _words = {};
  final Map<PlaceBuilding, Place> _placeOf = {};
  final Map<String, int> _df = {};

  static const _stop = {
    'of', 'the', 'and', 'at', 'for', 'in', 'a', 'an', 'to', 'on', 'main',
    'building', 'hall', 'center', 'centre', 'house', 'complex',
  };

  /// Words of the question itself, never part of a building's name.
  static const _askWords = {
    'where', 'should', 'could', 'would', 'can', 'what', 'which', 'how',
    'park', 'parking', 'parked', 'lot', 'lots', 'garage', 'spot', 'spots',
    'space', 'spaces', 'curb', 'near', 'nearest', 'close', 'closest', 'best',
    'good', 'get', 'going', 'heading', 'head', 'go', 'find', 'need', 'want',
    'show', 'tell', 'me', 'my', 'please', 'the', 'for', 'and', 'you', 'your',
    'there', 'here', 'from', 'with', 'into', 'class', 'today', 'now',
  };

  /// What people call a building -> words of its official name.
  static const Map<String, List<String>> _nicknames = {
    'gym': ['recreation', 'fitness'],
    'rec': ['recreation'],
    'workout': ['fitness'],
    'dorm': ['residence'],
    'dorms': ['residence'],
    'admin': ['administration'],
    'clinic': ['health'],
    'doctor': ['health'],
    'nurse': ['health'],
    'cops': ['police'],
    'books': ['bookstore'],
  };

  static String _bare(String s) =>
      s.toLowerCase().replaceAll(RegExp(r"[\s\-']"), '');

  static Set<String> _wordsOf(PlaceBuilding b) {
    // "College of Education (ED-47)" -> its name without the code.
    final name = b.name.replaceFirst(RegExp(r'\s*\([^)]*\)\s*$'), '');
    return {
      for (final w in '$name ${b.code}'
          .toLowerCase()
          .replaceAll("'", '')
          .split(RegExp(r'[^a-z0-9]+')))
        if (w.length >= 3 && !_stop.contains(w)) _singular(w),
    };
  }

  static String _singular(String w) =>
      w.length > 4 && w.endsWith('s') && !w.endsWith('ss')
          ? w.substring(0, w.length - 1)
          : w;

  ({_Hit? unique, List<_Hit> candidates}) find(_Message m) {
    // A code, as one token or split over two ("ed 47").
    final tokens = m.tokens;
    final grams = {
      for (final t in tokens) _bare(t),
      for (var i = 0; i + 1 < tokens.length; i++) _bare(tokens[i] + tokens[i + 1]),
    };
    for (final entry in _placeOf.entries) {
      final b = entry.key;
      final code = _bare(b.code);
      if (RegExp(r'\d').hasMatch(code) && grams.contains(code)) {
        final hit = _Hit(entry.value, b, 99);
        return (unique: hit, candidates: [hit]);
      }
    }

    // Name words, weighted by rarity (a typo is forgiven in long words).
    // The question's own words ("where should I park near...") aren't
    // building names, even where a name has them ("Glades Park Towers").
    final words = {
      for (final t in tokens)
        if (t.length >= 3 && !_askWords.contains(t)) _singular(t),
      // Everyday names for buildings: "the gym", "my dorm".
      for (final t in tokens) ...?_nicknames[t],
    };
    final hits = <_Hit>[];
    _words.forEach((b, bWords) {
      var score = 0.0;
      var matched = 0;
      for (final w in bWords) {
        final seen = words.contains(w) ||
            (w.length >= 6 &&
                words.any((t) =>
                    t.length >= 5 &&
                    // A word the assistant knows is meant as itself:
                    // "policy" isn't a misspelled "police".
                    !SmartCurbAssistant.known.contains(t) &&
                    editDistance(t, w, max: 1) != null));
        // A word that's also one the assistant answers on its own counts
        // half: "contact support" is about support, not the Student
        // Support Services building (its full name still finds it).
        if (seen) {
          matched++;
          // (Words are singular here: "campus" is "campu".)
          final known = SmartCurbAssistant.known.contains(w) ||
              SmartCurbAssistant.known.contains('${w}s');
          score += (known ? 0.5 : 1) / _df[w]!;
        }
      }
      if (score > 0) {
        hits.add(_Hit(_placeOf[b]!, b, score,
            wholeName: matched == bWords.length));
      }
    });
    if (hits.isEmpty) return (unique: null, candidates: const []);
    hits.sort((a, b) => b.score.compareTo(a.score));
    final top = hits.first;
    final runnerUp = hits.length > 1 ? hits[1].score : 0.0;
    // Clearly one building, matching better than any other: by a rare word
    // (or two shared ones), or by its whole name ("student support
    // services", though every word of it is in other names too).
    if ((top.score >= 0.99 || top.wholeName) && top.score > runnerUp + 0.01) {
      return (unique: top, candidates: [top]);
    }
    final close = [for (final h in hits) if (h.score >= top.score - 0.01) h];
    return (unique: null, candidates: close);
  }
}

// ==========================================
// CHAT SESSION (kept while the app is open)
// ==========================================

class ChatMessage {
  final bool fromUser;
  final String text;
  final List<ChatAction> actions;
  final ChatForm? form;
  final int id;
  ChatMessage(this.fromUser, this.text, this.id,
      [this.actions = const [], this.form]);
}

/// The conversation, owned by the main screen so it's still there when the
/// chat is opened again.
class ChatSession {
  ChatSession({AssistantData? data, GeminiChat? ai})
      : assistant = SmartCurbAssistant(
          data ?? FirebaseAssistantData(),
          ai: ai ?? GeminiChat(),
        );

  final SmartCurbAssistant assistant;
  final List<ChatMessage> messages = [];
  int _nextId = 0;

  ChatMessage add(bool fromUser, String text,
      [List<ChatAction> actions = const [], ChatForm? form]) {
    final m = ChatMessage(fromUser, text, _nextId++, actions, form);
    messages.add(m);
    return m;
  }
}

// ==========================================
// THE BUBBLE
// ==========================================

/// The round chat button at the bottom right of the main tabs. It pops in
/// when the screen opens and gives under the finger when pressed.
class AssistantBubble extends StatelessWidget {
  final VoidCallback onTap;
  const AssistantBubble({super.key, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: reduceMotion(context) ? Duration.zero : kMotionSlow,
      curve: Curves.easeOutBack,
      builder: (context, t, child) => Transform.scale(scale: t, child: child),
      child: Tooltip(
        message: 'Ask Smart Curb AI',
        child: PressScale(
          pressedScale: 0.9,
          child: Material(
            color: kAccent,
            shape: const CircleBorder(),
            elevation: 6,
            shadowColor: kAccent.withValues(alpha: 0.5),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: onTap,
              child: const SizedBox(
                width: 58,
                height: 58,
                child: Icon(
                  Icons.chat_bubble_rounded,
                  color: kOnAccent,
                  size: 26,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Opens the chat growing out of the bubble's corner. Pops with the tab to
/// switch to when a reply's "Go to ..." is tapped.
Future<int?> openAssistantChat(BuildContext context, ChatSession session) {
  final reduce = reduceMotion(context);
  return Navigator.of(context).push<int>(PageRouteBuilder<int>(
    transitionDuration: reduce ? Duration.zero : const Duration(milliseconds: 380),
    reverseTransitionDuration: reduce ? Duration.zero : kMotion,
    pageBuilder: (_, _, _) => AssistantChatPage(session: session),
    transitionsBuilder: (_, anim, _, child) {
      final t = CurvedAnimation(
        parent: anim,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeInCubic,
      );
      return FadeTransition(
        opacity: t,
        child: ScaleTransition(
          alignment: Alignment.bottomRight,
          scale: Tween(begin: 0.2, end: 1.0).animate(t),
          child: child,
        ),
      );
    },
  ));
}

// ==========================================
// THE CHAT SCREEN
// ==========================================

/// How long the assistant "types" before a reply appears: 1 s for a short
/// one, growing with the length (about 1 s more per 100 characters) up to
/// 10 s for the longest.
Duration typingTime(String reply) => Duration(
      milliseconds: (1000 + reply.length * 10).clamp(1000, 10000),
    );

class AssistantChatPage extends StatefulWidget {
  final ChatSession session;
  const AssistantChatPage({super.key, required this.session});

  @override
  State<AssistantChatPage> createState() => _AssistantChatPageState();
}

class _AssistantChatPageState extends State<AssistantChatPage> {
  final _input = TextEditingController();
  final _inputFocus = FocusNode();
  final _scroll = ScrollController();
  bool _typing = false;
  bool _hasText = false;

  ChatSession get _session => widget.session;

  @override
  void initState() {
    super.initState();
    _input.addListener(() {
      final has = _input.text.trim().isNotEmpty;
      if (has != _hasText) setState(() => _hasText = has);
    });
    if (_session.messages.isEmpty) {
      _botSays(Future.value(_session.assistant.greeting()));
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => _toBottom(jump: true));
    }
  }

  @override
  void dispose() {
    _input.dispose();
    _inputFocus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Shows the typing dots, then the reply: a moment longer for longer
  /// replies, so it reads like someone answering.
  Future<void> _botSays(Future<ChatReply> reply) async {
    setState(() => _typing = true);
    _toBottom();
    final started = DateTime.now();
    final r = await reply;
    // Pacing, not an animation, so it applies with reduced motion too.
    final wait = typingTime(r.text) - DateTime.now().difference(started);
    if (wait > Duration.zero) await Future<void>.delayed(wait);
    // Chat closed while "typing": the replies are still there next time.
    if (!mounted) {
      _session.add(false, r.text, r.actions, r.form);
      while (_waiting.isNotEmpty) {
        final next = await _session.assistant.reply(_waiting.removeAt(0));
        _session.add(false, next.text, next.actions, next.form);
      }
      return;
    }
    setState(() {
      _typing = false;
      // "Start over": a clean conversation, then the reply.
      if (r.clearsChat) _session.messages.clear();
      _session.add(false, r.text, r.actions, r.form);
    });
    _toBottom();
    if (_waiting.isNotEmpty) {
      _botSays(_session.assistant.reply(_waiting.removeAt(0)));
      return;
    }
    // "Opening the FAU map...": a moment to read it, then open it.
    final place = r.followUp?.place;
    if (place != null) {
      await Future<void>.delayed(const Duration(milliseconds: 700));
      if (mounted) _openPlace(place, r.followUp!.building);
    }
  }

  /// Shows what the user picked or sent as their message, then the reply.
  void _userSays(String text, Future<ChatReply> Function() reply) {
    if (_typing) return;
    _inputFocus.unfocus();
    setState(() => _session.add(true, text));
    _botSays(reply());
  }

  void _submitForm(ChatForm form, Map<String, String> values) => _userSays(
      form.describe(values), () => _session.assistant.submit(form, values));

  void _cancelForm() =>
      _userSays('Cancel', () => _session.assistant.cancelled());

  void _send(String text) {
    final t = text.trim();
    if (t.isEmpty) return;
    _input.clear();
    // Ready for the next message: also after clicking the send button,
    // which on web/desktop takes the focus off the box.
    _inputFocus.requestFocus();
    setState(() => _session.add(true, t));
    if (_typing) {
      // Sent while the assistant is still answering: shown now, answered
      // next, in order.
      _waiting.add(t);
      return;
    }
    _botSays(_session.assistant.reply(t));
  }

  /// Messages sent while the assistant was still answering.
  final List<String> _waiting = [];

  void _onAction(ChatAction a) {
    if (_typing) return;
    final tab = a.tab;
    final place = a.place;
    final building = a.building;
    if (tab != null) {
      Navigator.of(context).pop(tab);
    } else if (a.run != null) {
      _userSays(a.label, () => _session.assistant.run(a));
    } else if (place != null) {
      _openPlace(place, building);
    } else if (a.ask != null) {
      _send(a.ask!);
    }
  }

  bool _opening = false;

  /// Opens [place]'s map (with [building] picked), first adding the place to
  /// the user's Home if it isn't there yet. If that can't be saved (offline,
  /// say), the map still opens.
  Future<void> _openPlace(Place place, PlaceBuilding? building) async {
    if (_opening) return;
    _opening = true;
    try {
      var added = false;
      try {
        added = await _session.assistant.data.savePlace(place);
      } catch (e) {
        debugPrint('[assistant] saving ${place.id}: $e');
      }
      if (!mounted) return;
      if (added) {
        setState(() => _session.add(
              false,
              'I added ${place.fullName} to your places on Home, so it\'s '
              'one tap away next time.',
            ));
        _toBottom();
      }
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) =>
            PlaceMapScreen(place: place, initialBuilding: building),
      ));
    } finally {
      _opening = false;
    }
  }

  void _toBottom({bool jump = false}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      final end = _scroll.position.maxScrollExtent;
      if (jump || reduceMotion(context)) {
        _scroll.jumpTo(end);
      } else {
        _scroll.animateTo(end, duration: kMotion, curve: kEaseOut);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final messages = _session.messages;
    // Suggestions only under the latest reply (older ones are history).
    final lastBot = messages.lastIndexWhere((m) => !m.fromUser);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            const _BotAvatar(size: 34),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Smart Curb AI', style: mono(fontSize: 16)),
                Row(
                  children: [
                    const LiveDot(),
                    const SizedBox(width: 6),
                    AnimatedText(
                      _typing
                          ? 'typing…'
                          // Debug builds show whether the AI key loaded
                          // (it needs --dart-define-from-file=secrets.json).
                          : kDebugMode
                              ? ((_session.assistant.ai?.enabled ?? false)
                                  ? 'Online · Gemini on'
                                  : 'Online · no AI key')
                              : 'Online',
                      style: const TextStyle(fontSize: 11.5, color: kTextMuted),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: GestureDetector(
              // Tapping the conversation puts the keyboard away.
              onTap: () => _inputFocus.unfocus(),
              child: ListView.builder(
                controller: _scroll,
                physics: kScrollPhysics,
                padding: const EdgeInsets.fromLTRB(14, 16, 14, 12),
                itemCount: messages.length + (_typing ? 1 : 0),
                itemBuilder: (context, i) {
                  if (i == messages.length) {
                    return const _TypingBubble(key: ValueKey('typing'));
                  }
                  final m = messages[i];
                  return FadeSlideIn(
                    key: ValueKey(m.id),
                    offsetY: 12,
                    duration: kMotion,
                    child: _MessageView(
                      message: m,
                      actions: i == lastBot && !_typing ? m.actions : const [],
                      onAction: _onAction,
                      // Like suggestions, a form only works while it's the
                      // latest thing asked.
                      form: i == lastBot && !_typing ? m.form : null,
                      onFormSubmit: _submitForm,
                      onFormCancel: _cancelForm,
                    ),
                  );
                },
              ),
            ),
          ),
          _InputBar(
            controller: _input,
            focusNode: _inputFocus,
            canSend: _hasText,
            onSend: () => _send(_input.text),
          ),
        ],
      ),
    );
  }
}

class _BotAvatar extends StatelessWidget {
  final double size;
  const _BotAvatar({this.size = 28});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(color: kNavBg, shape: BoxShape.circle),
      child: Icon(Icons.smart_toy_rounded, color: kAccent, size: size * 0.58),
    );
  }
}

class _MessageView extends StatelessWidget {
  final ChatMessage message;
  final List<ChatAction> actions;
  final void Function(ChatAction) onAction;
  final ChatForm? form;
  final void Function(ChatForm form, Map<String, String> values) onFormSubmit;
  final VoidCallback onFormCancel;

  const _MessageView({
    required this.message,
    required this.actions,
    required this.onAction,
    required this.form,
    required this.onFormSubmit,
    required this.onFormCancel,
  });

  @override
  Widget build(BuildContext context) {
    final mine = message.fromUser;
    final maxWidth = MediaQuery.sizeOf(context).width * 0.78;
    final bubble = Container(
      constraints: BoxConstraints(maxWidth: maxWidth),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: mine ? kAccent : kCard,
        border: mine ? null : Border.all(color: kDivider),
        borderRadius: BorderRadius.only(
          topLeft: const Radius.circular(16),
          topRight: const Radius.circular(16),
          bottomLeft: Radius.circular(mine ? 16 : 4),
          bottomRight: Radius.circular(mine ? 4 : 16),
        ),
      ),
      child: SelectableText(
        message.text,
        style: TextStyle(
          color: mine ? kOnAccent : kText,
          fontSize: 14,
          height: 1.4,
          fontWeight: mine ? FontWeight.w600 : FontWeight.w400,
        ),
      ),
    );

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment:
            mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment:
                mine ? MainAxisAlignment.end : MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (!mine) ...[const _BotAvatar(), const SizedBox(width: 8)],
              Flexible(child: bubble),
            ],
          ),
          if (form case final f?)
            Padding(
              padding: const EdgeInsets.only(left: 36, top: 8),
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: math.min(440, maxWidth)),
                child: FadeSlideIn(
                  offsetY: 10,
                  duration: kMotion,
                  child: _ChatFormView(
                    key: ValueKey('form-${message.id}'),
                    form: f,
                    onSubmit: (values) => onFormSubmit(f, values),
                    onCancel: onFormCancel,
                  ),
                ),
              ),
            ),
          // Suggestions rise in under the reply, one after another.
          if (actions.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 36, top: 8),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (var i = 0; i < actions.length; i++)
                    FadeSlideIn(
                      index: i,
                      offsetY: 8,
                      duration: kMotion,
                      child: _ActionChip(
                        action: actions[i],
                        onTap: () => onAction(actions[i]),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// A [ChatForm] in the conversation: the app's own text fields (and choice
/// chips for picks like gender), sent with Enter in any field or the button.
class _ChatFormView extends StatefulWidget {
  final ChatForm form;
  final void Function(Map<String, String> values) onSubmit;
  final VoidCallback onCancel;

  const _ChatFormView({
    super.key,
    required this.form,
    required this.onSubmit,
    required this.onCancel,
  });

  @override
  State<_ChatFormView> createState() => _ChatFormViewState();
}

class _ChatFormViewState extends State<_ChatFormView> {
  List<ChatFormField> get _fields => widget.form.fields;

  late final Map<String, TextEditingController> _text = {
    for (final f in _fields)
      if (f.options == null)
        f.key: TextEditingController(
          text: f.phone
              ? formatPhone(widget.form.initial[f.key] ?? '')
              : widget.form.initial[f.key] ?? '',
        ),
  };
  late final Map<String, FocusNode> _focus = {
    for (final key in _text.keys) key: FocusNode(),
  };
  late final Map<String, String?> _picked = {
    for (final f in _fields)
      if (f.options case final options?)
        f.key: options.contains(widget.form.initial[f.key])
            ? widget.form.initial[f.key]
            : null,
  };
  String? _error;

  @override
  void initState() {
    super.initState();
    final start = _focus[widget.form.focus];
    if (start != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) start.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    for (final c in _text.values) {
      c.dispose();
    }
    for (final f in _focus.values) {
      f.dispose();
    }
    super.dispose();
  }

  Map<String, String> get _values => {
        for (final f in _fields)
          f.key: f.options != null
              ? _picked[f.key] ?? ''
              : _text[f.key]!.text.trim(),
      };

  void _submit() {
    final values = _values;
    final error = widget.form.check(values);
    setState(() => _error = error);
    if (error == null) widget.onSubmit(values);
  }

  Widget _field(ChatFormField f) {
    final label = Padding(
      padding: const EdgeInsets.only(bottom: 5),
      child: Text(
        '${f.label}${f.required ? ' *' : ''}',
        style: const TextStyle(
          color: kTextMuted,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
    final options = f.options;
    final input = options != null
        ? Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final o in options)
                ChoiceChip(
                  label: Text(o),
                  selected: _picked[f.key] == o,
                  onSelected: (_) => setState(() => _picked[f.key] = o),
                  showCheckmark: false,
                  selectedColor: kAccent,
                  backgroundColor: kCard,
                  side: BorderSide(
                    color: _picked[f.key] == o ? kAccent : kDivider,
                  ),
                  labelStyle: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: _picked[f.key] == o ? kOnAccent : kText,
                  ),
                ),
            ],
          )
        : AppTextField(
            controller: _text[f.key]!,
            focusNode: _focus[f.key],
            hintText: f.hint.isEmpty ? f.label : f.hint,
            icon: f.icon,
            keyboardType: f.keyboard,
            inputFormatters: f.phone ? [PhoneInputFormatter()] : null,
            // Enter in any field sends the form.
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _submit(),
          );
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [label, input],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
      decoration: BoxDecoration(
        color: kNavBg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: kAccent.withValues(alpha: 0.45)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final f in _fields) _field(f),
          // The first problem, eased in under the fields.
          AnimatedSize(
            duration: kMotion,
            curve: kEaseOut,
            alignment: Alignment.topCenter,
            child: _error == null
                ? const SizedBox(width: double.infinity)
                : Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(
                      _error!,
                      style: const TextStyle(
                        color: kRed,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                onPressed: widget.onCancel,
                style: TextButton.styleFrom(foregroundColor: kTextMuted),
                child: const Text('Cancel'),
              ),
              const SizedBox(width: 8),
              PressScale(
                child: ElevatedButton(
                  onPressed: _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: kAccent,
                    foregroundColor: kOnAccent,
                  ),
                  child: Text(widget.form.submitLabel),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ActionChip extends StatelessWidget {
  final ChatAction action;
  final VoidCallback onTap;
  const _ActionChip({required this.action, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final icon = action.place != null
        ? (action.building != null
            ? Icons.navigation_rounded
            : Icons.map_rounded)
        : (action.tab != null ? Icons.arrow_forward_rounded : null);
    final strong = icon != null; // navigation / go-to: filled
    return PressScale(
      pressedScale: 0.94,
      child: Material(
        color: strong ? kAccent : kNavBg,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: strong ? kAccent : kAccent.withValues(alpha: 0.45),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 16, color: kOnAccent),
                  const SizedBox(width: 6),
                ],
                Flexible(
                  child: Text(
                    action.label,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: strong ? kOnAccent : kAccent,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// "…" while the assistant is answering: three dots bobbing in turn.
class _TypingBubble extends StatefulWidget {
  const _TypingBubble({super.key});

  @override
  State<_TypingBubble> createState() => _TypingBubbleState();
}

class _TypingBubbleState extends State<_TypingBubble>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final still = reduceMotion(context);
    return FadeSlideIn(
      offsetY: 8,
      duration: kMotionFast,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            const _BotAvatar(),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              decoration: BoxDecoration(
                color: kCard,
                border: Border.all(color: kDivider),
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                  bottomRight: Radius.circular(16),
                  bottomLeft: Radius.circular(4),
                ),
              ),
              child: AnimatedBuilder(
                animation: _c,
                builder: (context, _) => Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (var i = 0; i < 3; i++) ...[
                      if (i > 0) const SizedBox(width: 5),
                      Builder(builder: (context) {
                        final wave = math.max(
                          0.0,
                          math.sin((_c.value - i * 0.18) * 2 * math.pi),
                        );
                        // Reduced motion: the dots light up in turn instead
                        // of bobbing, so "typing" still shows.
                        return Transform.translate(
                          offset: Offset(0, still ? 0 : -3 * wave),
                          child: Container(
                            width: 7,
                            height: 7,
                            decoration: BoxDecoration(
                              color: kTextMuted.withValues(
                                alpha: still ? 0.35 + 0.6 * wave : 0.9,
                              ),
                              shape: BoxShape.circle,
                            ),
                          ),
                        );
                      }),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InputBar extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final bool canSend;
  final VoidCallback onSend;

  const _InputBar({
    required this.controller,
    required this.focusNode,
    required this.canSend,
    required this.onSend,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: kBar,
        border: Border(top: BorderSide(color: kDivider)),
      ),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                focusNode: focusNode,
                textInputAction: TextInputAction.send,
                // Without this, Enter also takes the focus away, and you'd
                // have to click the box again to type the next message.
                onEditingComplete: () {},
                onSubmitted: (_) => onSend(),
                minLines: 1,
                maxLines: 4,
                cursorColor: kAccent,
                style: const TextStyle(color: kText, fontSize: 14),
                decoration: InputDecoration(
                  hintText: 'Ask Smart Curb AI…',
                  hintStyle: const TextStyle(color: kTextMuted, fontSize: 14),
                  filled: true,
                  fillColor: kCard,
                  isDense: true,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(22),
                    borderSide: const BorderSide(color: kDivider),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(22),
                    borderSide: const BorderSide(color: kDivider),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(22),
                    borderSide: const BorderSide(color: kAccent),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            // Lights up once there's something to send.
            AnimatedScale(
              scale: canSend ? 1 : 0.85,
              duration: kMotionFast,
              curve: kEaseOut,
              child: AnimatedOpacity(
                opacity: canSend ? 1 : 0.4,
                duration: kMotionFast,
                child: Material(
                  color: kAccent,
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: canSend ? onSend : null,
                    child: const SizedBox(
                      width: 44,
                      height: 44,
                      child: Icon(Icons.arrow_upward_rounded,
                          color: kOnAccent, size: 22),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
