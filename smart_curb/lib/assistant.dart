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
import 'package:flutter/material.dart';

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
        followUp = null;

  const ChatReply.form(this.text, ChatForm this.form, [this.actions = const []])
      : followUp = null;

  const ChatReply.opening(this.text, ChatAction this.followUp,
      [this.actions = const []])
      : form = null;
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
    if (!place.liveParking) return staticLots(place);
    final cached = _lotCache[place.id];
    if (cached != null && DateTime.now().difference(cached.at) < _lotsFresh) {
      return cached.lots;
    }
    final results = await Future.wait([_read('lots'), _read('units')]);
    final lots = parseLiveLots(place, results[0], results[1]);
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
  SmartCurbAssistant(this.data, {List<Place>? places})
      : places = places ?? Place.all {
    _index = _BuildingIndex(this.places);
  }

  final AssistantData data;
  final List<Place> places;
  late final _BuildingIndex _index;

  /// Asked which building; the next message may just be its name.
  bool _awaitingBuilding = false;

  static const String _intro =
      "Hi! I'm Smart Curb AI Agent. I can help you with:";

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

  ChatReply greeting() => const ChatReply(_intro, menu);

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

    return _guard(() async {
      final answer = await _answer(m, wasAwaiting);
      // "Hi, where do I park for ED-47?": answer it, with a hello.
      if (m.hasGreeting && !m.isOnlyGreeting && answer.text != _intro) {
        return _retext(answer, 'Hi! ${answer.text}');
      }
      return answer;
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
    // ---- greetings and small talk ----
    if (m.isOnlyGreeting) return greeting();
    // Bye before thanks: "ok bye" / "thanks, bye" are goodbyes.
    if (m.short && (m.any(_bye) || m.anyPhrase(_byePhrases))) {
      return const ChatReply(
        'Bye! Drive safe, and good luck finding a spot. '
        "I'm here whenever you need me.",
      );
    }
    if (m.anyPhrase(_compliments)) {
      return const ChatReply(
        "Aw, thank you! I'm happy to help. Anything else you need?",
        _moreHelp,
      );
    }
    if (m.short && m.has(_insults) && !m.any(_parkWords)) {
      return const ChatReply(
        "Sorry I let you down! I'm still learning. Try asking another way, "
        "or pick one of these. If something in the app isn't working, the "
        'team would like to know: $kSupportEmail.',
        menu,
      );
    }
    if (m.short && m.any(_thanks)) {
      return const ChatReply(
        "You're welcome! Anything else I can help with?",
        _moreHelp,
      );
    }
    if (m.tokens.length <= 3 && m.tokens.every(_yes.contains)) {
      return const ChatReply('Great! What would you like to do?', menu);
    }
    if (m.tokens.length <= 3 && m.tokens.every(_no.contains)) {
      return const ChatReply(
        "Okay! I'm right here if you need anything.",
        _moreHelp,
      );
    }
    if (m.anyPhrase(_howAreYou)) {
      return const ChatReply(
        "I'm running smoothly, thanks for asking! "
        'Ready to help you find parking. What do you need?',
        menu,
      );
    }
    // "Help" / "help me please", but not "can you help me add a car".
    if (m.anyPhrase(_whoAreYou) || m.anyPhrase(_whatCanYouDo) ||
        (m.any(_help) && m.tokens.every(_helpOnly.contains))) {
      return const ChatReply(
        "I'm Smart Curb AI Agent, your parking assistant in this app. "
        'I can tell you where to park for any building, how many spots '
        'are open, what each color on the map means, and help with your '
        'cars, places and profile. Try one of these:',
        menu,
      );
    }
    // "I want to talk with an agent": a person, not this assistant.
    if (m.anyPhrase(_humanPhrases) ||
        (m.anyPhrase(_talkPhrases) && m.has(_humanWords))) {
      return const ChatReply(
        "I'm Smart Curb AI Agent, the app's virtual assistant, so I'm not a "
        "person, but I'll do my best to help! To reach someone on the Smart "
        'Curb team, email $kSupportEmail (also in the ⋮ menu > Settings > '
        'Contact Us). Tell them what happened and which screen you were on.',
        [
          ChatAction.ask('What can you do?'),
          ChatAction.ask('How do I use the app?'),
        ],
      );
    }
    if (m.anyPhrase(_whoMadeYou)) {
      return const ChatReply(
        'Smart Curb was built by Team Smart Curb, an FAU Engineering senior '
        'design team: solar-powered smart curbs that sense whether a spot is '
        'taken, plus this app and an admin dashboard.',
        [ChatAction.ask('How does Smart Curb work?')],
      );
    }
    if (m.any(_joke)) {
      return const ChatReply(
        'Why did the car apply to college? It wanted to be a little more '
        'parked in knowledge. ...I know, I should stick to parking.',
        [ChatAction.ask('Where should I park?')],
      );
    }

    if (m.anyPhrase(_timePhrases)) return _timeNow();

    // ---- the places on Home: add, remove, open ----
    if (await _placeCommand(m) case final r?) return r;

    // ---- a building: where to park for it ----
    final building = _index.find(m);
    final faq = _faqFor(m);
    if (building.unique case final hit?) {
      final park = await _parkFor(hit.place, hit.building);
      // "Accessible parking near the library": both answers.
      if (faq != null && faq.withBuilding) {
        return ChatReply('${faq.reply.text}\n\n${park.text}', park.actions);
      }
      return park;
    }

    // ---- how to use the app, and questions about it ----
    if (faq != null) {
      return faq.asksPlace ? _pickPlace(faq.reply) : faq.reply;
    }
    if (m.anyPhrase(_wherePlacesPhrases)) return _wherePlaces();

    // ---- a lot: how full it is ----
    final lot = _findLot(m);
    if (lot != null) return _lotStatus(lot.place, lot.id, lot.label);

    if (m.anyPhrase(_curbCountPhrases)) return _curbCount();
    if (m.anyPhrase(_allLotsPhrases)) return _allLots();
    if (m.anyPhrase(_allBuildingsPhrases)) return _allBuildings();
    // "Which lot is closest" depends on where you're going: asked below.
    if ((m.has({'emptiest'}) || m.anyPhrase(_emptiestPhrases)) &&
        !m.has({'closest', 'nearest', 'close', 'near', 'nearby'})) {
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
          "I couldn't find that building. Try its code (like ED-47) or a "
          'word from its name (like "library" or "business").',
          _buildingExamples(),
        );
      }
      _awaitingBuilding = true;
      return ChatReply(
        'Sure! Which building are you going to? Type its name or code '
        '(like ED-47 or "College of Business"), or pick one:',
        _buildingExamples(),
      );
    }

    // ---- the user's own things ----
    if (m.any(_vehicleWords)) return _vehicles(m);
    if (m.any(_placeWords) || m.anyPhrase(_placePhrases)) return _places(m);
    if (m.any(_logoutWords) || m.anyPhrase(_logoutPhrases)) {
      return const ChatReply(
        'To log out, tap the log-out icon at the top left of the main '
        "screen. You'll go back to the login page.",
      );
    }
    if (m.any(_passwordWords)) {
      return const ChatReply(
        "Password changes aren't in the app yet. If you can't sign in, "
        'contact support and we can help you reset it.',
        [ChatAction.ask('Contact support')],
      );
    }
    if (m.has({'login', 'signin'}) || m.anyPhrase(_loginPhrases)) {
      final email = data.email;
      return ChatReply(
        email == null
            ? "You're not signed in right now. Log in from the login screen "
                'with your email and password.'
            : "You're signed in as $email. To use a different account, tap "
                'the log-out icon at the top left of the main screen, then '
                'log in with the other one.',
      );
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

    return const ChatReply(
      "Sorry, I don't understand that. Here's what I can help with:",
      menu,
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
          "I'll point you to the closest)";
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
      'everywhere else I point you to the closest lot. More places can '
      'join as Smart Curbs are installed.',
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
        "None of the lots with Smart Curbs has an open spot right now. Lots "
        "without sensors may still have space: tell me your building and "
        "I'll pick the closest one.",
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
        "All the lots near $where are full right now. I'd try again in a "
        'few minutes, or open the map to watch for a spot.',
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
      'For $where, park at $spot$count. '
      "It's about a $walk walk from there. "
      'Tap Navigate there and I\'ll guide you in.',
      actions,
    );
  }

  Future<ChatReply> _lotStatus(Place place, String lotId, String label) async {
    final lots = await data.lots(place);
    final lot = lots[lotId];
    if (lot == null) {
      return ChatReply(
        "I couldn't find $label at ${place.nickname}. "
        'Open the map to see all its lots.',
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
        "$name doesn't have Smart Curb sensors yet, so I can't see its "
        'spaces. ${live.isEmpty ? '' : 'Live counts are available for ${live.join(', ')}.'}'
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
        "$name's curbs aren't reporting right now, so I can't tell how many "
        'spots are open.',
        const [ChatAction.ask('Open spots right now')],
      );
    }
    if (free == 0) {
      return ChatReply(
        '$name is full right now: all $total sensored spots are taken.$offlineNote',
        const [ChatAction.ask('Where should I park?')],
      );
    }
    return ChatReply(
      '$name has $free of $total sensored spots open right now.$offlineNote',
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
            "• ${place.nickname}: no Smart Curb sensors yet. I'll still point "
            'you to the closest lot.');
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
      'Here are the live counts from the Smart Curb sensors:\n'
      '${lines.join('\n')}\n'
      'Lots without sensors still show on the map; tell me a building and '
      "I'll pick the best lot for it.",
      const [ChatAction.ask('Where should I park?')],
    );
  }

  ChatReply _whichBuilding(List<_Hit> candidates) {
    _awaitingBuilding = true;
    return ChatReply(
      'Which one do you mean?',
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
    final removing = m.any(_removeWords);
    final changing = !removing && m.has(_editWords);
    final adding = !removing &&
        !changing &&
        (m.any(_addWords) || m.has({'another', 'second', 'register'}));
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
        return _pickCar('Which vehicle do you want to delete?',
            named.isEmpty ? cars : named, _confirmDeleteCar);
      }
      if (named.length == 1) return _changeCar(named.single);
      if (cars.length == 1) return _changeCar(cars.single);
      return _pickCar('Which vehicle do you want to change?',
          named.isEmpty ? cars : named, _changeCar);
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
  Future<ChatReply> _places(_Message m) async {
    final saved = await data.savedPlaceIds();
    final mine = [for (final p in places) if (saved.contains(p.id)) p];
    final lines = [
      for (final p in places)
        '• ${p.fullName}: ${saved.contains(p.id) ? 'on your Home ✓' : 'not added yet'}'
            ' (${p.address})',
    ];
    return ChatReply(
      '${mine.isEmpty ? "You haven't added any places yet. " : ''}'
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
    if (removing) return _removePlaceFlow(place, all: all);
    if (adding) return _addPlaceFlow(place, all: all);
    if (place == null) return null;
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
    final wants = m.any(_editWords) ||
        m.any(_addWords) ||
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
        'On the map:\n'
        '• Green space: the curb sees the spot is open\n'
        '• Red space: the spot is taken\n'
        '• Gray space: that curb is offline, so its spot is unknown\n'
        'Lot labels: green when under 70% full, amber at 70-90%, red at '
        '90% or more, and gray when the lot has no sensors. The lot I '
        'recommend gets a bright ring, and your target curb stands taller.',
        [ChatAction.ask('Open spots right now')],
      );

  ChatReply _navigationHelp() => const ChatReply(
        'To get directions: open a place from Home, then search for a '
        'building or tap it on the map. I pick the best lot (or open curb), '
        'draw the drive there, and once you park I show the walking path to '
        'the building. Tap the location button for turn-by-turn focus mode. '
        'Or just tell me the building and tap Navigate there.',
        [ChatAction.ask('Where should I park?')],
      );

  ChatReply _howItWorks() => const ChatReply(
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

  ({Place place, String id, String label})? _findLot(_Message m) {
    final mall = m.anyPhrase(_browardWords);
    final fau = places.firstWhere((p) => p.liveParking, orElse: () => places.first);
    final broward =
        places.firstWhere((p) => !p.liveParking, orElse: () => places.last);
    final text = m.text;

    final lotMatch =
        RegExp(r'\b(?:parking\s+)?lot\s*#?\s*(\d{1,3})\s*(n)?\b').firstMatch(text);
    if (lotMatch != null) {
      final n = int.parse(lotMatch.group(1)!);
      final suffix = lotMatch.group(2) ?? '';
      final label = 'Lot $n${suffix.toUpperCase()}';
      if (mall) return (place: broward, id: 'lot$n', label: label);
      return (
        place: fau,
        id: 'lot${n.toString().padLeft(2, '0')}$suffix',
        label: label,
      );
    }
    final garage = RegExp(r'\bgarage\s*(\d|i{1,3}|one|two|three)\b')
        .firstMatch(text);
    if (garage != null) {
      const numbers = {
        'i': 1, 'ii': 2, 'iii': 3, 'one': 1, 'two': 2, 'three': 3, //
      };
      final g = garage.group(1)!;
      final n = int.tryParse(g) ?? numbers[g]!;
      return (place: fau, id: 'garage$n', label: 'Garage $n');
    }
    final named = RegExp(r'\b(aqua|copper)\s+lot\b').firstMatch(text);
    if (named != null) {
      final id = named.group(1)!;
      return (
        place: fau,
        id: id,
        label: '${id[0].toUpperCase()}${id.substring(1)} Lot',
      );
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
    'thanks', 'thank', 'thx', 'ty', 'thankyou', 'appreciate', 'cheers',
    'great', 'awesome', 'perfect', 'cool', 'nice', 'ok', 'okay', 'got',
  };
  static const _bye = {'bye', 'goodbye', 'cya', 'farewell', 'goodnight'};
  static const _byePhrases = ['see you', 'see ya', 'talk later', 'catch you later'];
  static const _help = {'help', 'menu', 'options', 'commands', 'start'};
  static const _howAreYou = [
    'how are you', 'how r u', 'how are u', 'how is it going',
    'hows it going', 'how you doing', 'how are things',
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
    'who built the app', 'who made smart curb',
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
    'license', 'auto', 'suv', 'van',
  };
  static const _placeWords = {
    'place', 'places', 'location', 'locations', 'campus', 'campuses', 'saved',
    'site', 'sites',
  };
  static const _placePhrases = ['my places', 'where can i use', 'which places'];
  static const _profileWords = {
    'profile', 'account', 'name', 'phone', 'address', 'email', 'details',
    'info', 'information', 'personal',
  };
  static const _profilePhrases = ['about me', 'my info', 'contact info'];
  static const _addWords = {'add', 'new', 'register', 'create', 'save'};
  static const _removeWords = {'delete', 'remove', 'erase', 'unsave'};
  static const _editWords = {'edit', 'change', 'update', 'fix', 'modify'};
  static const _logoutWords = {'logout', 'signout'};
  static const _logoutPhrases = ['log out', 'sign out', 'log off'];
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
  static const _howItWorksWords = {'sensor', 'sensors', 'led', 'solar', 'about'};
  static const _howItWorksPhrases = [
    'how does it work', 'how does this work', 'how does smart curb',
    'what is smart curb', 'what is this app', 'how it works', 'what does this app',
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
    'more schools',
  ];
  static const _curbCountPhrases = [
    'how many curbs', 'how many smart curbs', 'how many sensors',
    'number of curbs', 'number of sensors', 'how many units', 'how many devices',
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
    'which account',
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
    'freezing', 'glitch', 'glitchy', 'laggy', 'lagging',
  };
  static const _backPhrases = [
    'go back', 'get back', 'back to home', 'back home', 'exit the map',
    'leave the map', 'close the map', 'exit map', 'return home',
    'return to home', 'main screen', 'home screen', 'home page', 'main menu',
    'switch tabs', 'other tabs', 'change tabs',
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
    'overnight', 'rules', 'rule', 'allowed', 'legal', 'illegal', 'visitor',
    'visitors', 'guest', 'guests',
  };
  static const _rulesPhrases = [
    'time limit', 'how long can i park', 'park all day', 'can i park here',
    'am i allowed', 'free to park',
  ];
  static const _privacyWords = {
    'privacy', 'private', 'tracking', 'tracked', 'spy', 'spying', 'security',
    'secure', 'surveillance', 'camera', 'cameras',
  };
  static const _privacyPhrases = [
    'track me', 'track my', 'my data', 'share my', 'sell my', 'who can see',
    'see my location', 'store my', 'save my location', 'my information safe',
    'my info safe',
  ];
  static const _fillsUpPhrases = [
    'fills up', 'fill up', 'filled up', 'gets full', 'got full',
    'becomes full', 'someone takes', 'someone took', 'someone else',
    'gets taken', 'got taken', 'taken before', 'by the time i',
    'while driving', 'while im driving', 'while i drive',
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
    'ticket', 'tickets', 'citation', 'citations', 'tow', 'towed', 'towing',
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
    'when are lots', 'when is parking', 'predict',
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

  /// Questions about using the app, first match wins: the more specific
  /// ones ("stop navigating") come before the broader ones ("the map").
  static final List<_Faq> _faqs = [
    _Faq(
      (m) =>
          (m.has(_stopWords) || m.hasPhrase('turn off')) &&
          (m.has(_routeWords) || m.hasPhrase('focus mode')),
      const ChatReply(
        'To stop navigating, tap the ✕ in the search bar at the top of the '
        'map: the route and the destination clear. To leave turn-by-turn '
        'focus mode but keep the route, tap the arrow button at the top '
        'right again. The back arrow at the top left takes you out of the '
        'map.',
        [ChatAction.ask('How do I choose a building?')],
      ),
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
        'Focus mode follows you turn by turn. On the map, once your GPS is '
        'found, tap the arrow button at the top right (next to Reset Map '
        'View): the map zooms in, turns with your heading and follows your '
        'arrow along the route. Tap it again to leave focus mode.',
        [ChatAction.ask('How do I choose a building?')],
      ),
    ),
    _Faq(
      (m) =>
          m.has({'save', 'saved', 'favorite', 'favourite', 'favorites',
            'favourites', 'bookmark', 'star'}) &&
          m.any(_destinationWords),
      const ChatReply(
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
        'On the map, tap the 3D button at the top right (the cube or map '
        'icon) to tilt the map into 3D, and again to go back to flat 2D.',
      ),
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
        'Tap Reset Map View (the square target icon at the top right of the '
        'map) to zoom back out to the whole place. It also clears your '
        'destination and leaves focus mode. Pinch to zoom in and out.',
      ),
    ),
    _Faq(
      (m) =>
          m.any({'developer', 'simulate', 'simulation', 'teleport'}) ||
          m.has({'dev', 'demo', 'simulator'}) ||
          m.anyPhrase(['click to move', 'travel to fau']),
      const ChatReply(
        'Developer mode is for testing and demos. On a map, tap the '
        'developer icon at the top right. Then you can see and copy the '
        'coordinates of any tap, use "Click to move" to put your arrow '
        'anywhere, "Travel to FAU" to jump there, and "Simulate Run" / '
        '"Simulate Walk" to play the drive and the walk. Tap the icon again '
        'to turn it off.',
      ),
    ),
    _Faq(
      (m) => m.has(_privacyWords) || m.anyPhrase(_privacyPhrases),
      const ChatReply(
        'Your location is used on your phone to show your arrow and route '
        "you; Smart Curb doesn't save it to your account. What's stored is "
        'what you enter yourself: your profile, your vehicles and your saved '
        'places, tied to your login. The curbs only report whether each spot '
        'is taken or open.',
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
        "Smart Curb uses your phone's GPS to show your arrow and route you. "
        "If it can't find you: turn on Location Services, allow Smart Curb "
        '(or your browser) to use your location, then open the map again. '
        'The card at the bottom of the map shows the GPS status. Between '
        'tall buildings it can take a few seconds to lock on.',
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(_fillsUpPhrases),
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
        'Once you park, the driving route goes away and a walking path '
        "appears from your spot to the building's door, with the distance "
        "counting down in the bottom card. Follow it and I'll tell you when "
        "you've arrived.",
      ),
    ),
    _Faq(
      (m) => m.anyPhrase(_walkPhrases) || m.has({'eta'}),
      const ChatReply(
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
        'I pick the open lot (or curb) that gives you the shortest walk to '
        "the building's door, measured along the real walking paths. Full "
        "lots and offline curbs are skipped, so the nearest lot isn't always "
        "the pick when it has no space. If it fills while you drive, I "
        'switch you to the next best one.',
        [ChatAction.ask('Where should I park?')],
      ),
    ),
    _Faq(
      (m) => m.has(_reserveWords) || m.anyPhrase(_reservePhrases),
      const ChatReply(
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
        "Charging stations aren't on the Smart Curb map yet. I can still "
        "find you the closest lot with space.",
        [ChatAction.ask('Where should I park?')],
      ),
      withBuilding: true,
    ),
    _Faq(
      (m) => m.has(_accessibleWords) || m.anyPhrase(_accessiblePhrases),
      const ChatReply(
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
          m.anyPhrase(_rulesPhrases),
      const ChatReply(
        "The Smart Curb app is free. It doesn't sell parking permits or take "
        "payments, and it doesn't set the parking rules (permits, time "
        'limits, overnight parking): follow the signs at the lot, and at '
        'FAU check Parking and Transportation Services.',
      ),
      withBuilding: true,
    ),
    _Faq(
      (m) => m.anyPhrase(_bestTimePhrases),
      const ChatReply(
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
        'Smart Curb needs an internet connection for live spot counts and '
        "routes. With a weak signal the map may lag; once you're back "
        'online it catches up by itself.',
      ),
    ),
    _Faq(
      (m) =>
          m.has({'offline'}) ||
          m.hasPhrase('not reporting') ||
          (m.has({'gray', 'grey'}) && m.has({'why', 'curb', 'curbs'})),
      const ChatReply(
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
        'Notifications are in the ⋮ menu at the top right of the main '
        'screen > Settings > Notifications. Flip the switch to turn them on '
        'or off.',
      ),
    ),
    _Faq(
      (m) => m.has({'settings', 'setting', 'preferences'}),
      const ChatReply(
        'Settings are in the ⋮ menu at the top right of the Home, Vehicle '
        'and Profile screens. There you can turn notifications on or off '
        'and find Contact Us. About App is in the same menu.',
      ),
    ),
    _Faq(
      (m) => m.has({'version'}) || m.anyPhrase(_versionPhrases),
      const ChatReply(
        "You're on Smart Curb version $kAppVersion. You can see it any time "
        'in the ⋮ menu > About App.',
      ),
    ),
    _Faq(
      (m) =>
          m.anyPhrase(_signUpPhrases) ||
          m.has({'signup', 'registration'}) ||
          (m.has({'register'}) && !m.any(_vehicleWords)),
      const ChatReply(
        'Smart Curb needs an account, and you\'re already signed in! New '
        "users tap \"Don't have an account? "
        'Register" on the login screen and sign up with an email and a '
        'password. To switch accounts, log out with the icon at the top '
        'left first.',
      ),
    ),
    _Faq(
      (m) =>
          m.has({'email', 'mail'}) &&
          (m.has(_editWords) || m.has({'new', 'different', 'another'})),
      const ChatReply(
        "Your email is your login, so it can't be changed in the app yet. "
        'Contact support and the team can move your account to a new email.',
        [ChatAction.ask('Contact support')],
      ),
    ),
    _Faq(
      (m) =>
          (m.has({'account'}) &&
              (m.has(_removeWords) ||
                  m.has({'close', 'deactivate', 'cancel', 'terminate'}))) ||
          m.anyPhrase(['delete my data', 'remove my data', 'delete everything']),
      const ChatReply(
        "Deleting an account isn't in the app yet. Email the team at "
        '$kSupportEmail from the address you signed up with, and they\'ll '
        'delete it along with your vehicles and saved places.',
      ),
    ),
    _Faq(
      (m) =>
          (m.anyPhrase(_gettingStartedPhrases) ||
              m.has({'tutorial', 'instructions', 'onboarding', 'manual'})) &&
          // "How do I use focus mode": the map's own how-to.
          !m.has(_navigationWords) &&
          !m.hasPhrase('focus mode'),
      const ChatReply(
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
        'weather', 'forecast', 'raining', 'rain', 'rainy', 'temperature',
        'sunny', 'storm', 'hurricane',
      }),
      const ChatReply(
        "I can't check the weather, but on a rainy day a spot close to the "
        "door helps! Tell me your building and I'll find the closest open "
        'lot.',
        [ChatAction.ask('Where should I park?')],
      ),
    ),
    _Faq(
      (m) => m.has(_appTrouble),
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
    ..._notificationWords, ..._rulesWords, 'settings', 'version', 'register',
    'account', 'offline', 'gps', 'favorite', 'favourite',
  };
}

/// A question about using the app and its answer.
class _Faq {
  const _Faq(
    this.when,
    this.reply, {
    this.withBuilding = false,
    this.asksPlace = false,
  });

  final bool Function(_Message m) when;
  final ChatReply reply;

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
  _Message(String raw)
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
    };
    final hits = <_Hit>[];
    _words.forEach((b, bWords) {
      var score = 0.0;
      var matched = 0;
      for (final w in bWords) {
        final seen = words.contains(w) ||
            (w.length >= 6 &&
                words.any((t) =>
                    t.length >= 5 && editDistance(t, w, max: 1) != null));
        // A word that's also one the assistant answers on its own counts
        // half: "contact support" is about support, not the Student
        // Support Services building (its full name still finds it).
        if (seen) {
          matched++;
          score += (SmartCurbAssistant.known.contains(w) ? 0.5 : 1) / _df[w]!;
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
  ChatSession({AssistantData? data})
      : assistant = SmartCurbAssistant(data ?? FirebaseAssistantData());

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
    // Chat closed while "typing": the reply is still there next time.
    if (!mounted) {
      _session.add(false, r.text, r.actions, r.form);
      return;
    }
    setState(() {
      _typing = false;
      _session.add(false, r.text, r.actions, r.form);
    });
    _toBottom();
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
    if (t.isEmpty || _typing) return;
    _input.clear();
    setState(() => _session.add(true, t));
    _botSays(_session.assistant.reply(t));
  }

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
                      _typing ? 'typing…' : 'Online',
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
            canSend: _hasText && !_typing,
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
