import 'package:flutter_test/flutter_test.dart';
import 'package:smart_curb/assistant.dart';
import 'package:smart_curb/main.dart';

/// Made-up app data: at FAU, Lot 14's curbs report (C-095 taken, C-077
/// open, C-001 offline); two cars; FAU saved; a filled-in profile.
class FakeData implements AssistantData {
  FakeData({
    List<Map<String, dynamic>> cars = const [],
    List<String> saved = const [],
    this.me,
  })  : cars = [
          for (var i = 0; i < cars.length; i++) {...cars[i], 'id': 'car$i'},
        ],
        saved = [...saved];

  /// Changed by what the assistant does, so tests can check it.
  final List<Map<String, dynamic>> cars;
  final List<String> saved;
  Map<String, dynamic>? me;

  @override
  Future<Map<String, Map<String, dynamic>>> lots(Place place) async {
    if (!place.liveParking) return staticLots(place);
    return parseLiveLots(place, {
      'lot14': {'name': 'Lot 14'},
    }, {
      'C-095': {'lot': 'lot14', 'occupied': true, 'online': true},
      'C-077': {'lot': 'lot14', 'occupied': false, 'online': true},
      'C-001': {'lot': 'lot14', 'occupied': false, 'online': false},
    });
  }

  @override
  Future<List<Map<String, dynamic>>> vehicles() async => cars;
  @override
  Future<Map<String, dynamic>?> profile() async => me;
  @override
  Future<List<String>> savedPlaceIds() async => [...saved];

  @override
  Future<bool> savePlace(Place place) async {
    if (saved.contains(place.id)) return false;
    saved.add(place.id);
    return true;
  }

  @override
  Future<bool> removePlace(Place place) async => saved.remove(place.id);

  var _nextCar = 100;
  @override
  Future<void> addVehicle(Map<String, String> car) async =>
      cars.add({...car, 'id': 'car${_nextCar++}'});
  @override
  Future<void> updateVehicle(String id, Map<String, String> car) async {
    final i = cars.indexWhere((c) => c['id'] == id);
    cars[i] = {...cars[i], ...car};
  }

  @override
  Future<void> deleteVehicle(String id) async =>
      cars.removeWhere((c) => c['id'] == id);

  @override
  Future<void> saveProfile(Map<String, String> profile) async =>
      me = {...?me, ...profile};

  @override
  String? get email => 'owl@fau.edu';
}

const _sorry = "Sorry, I don't understand that";

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    for (final p in Place.all) {
      await p.pathfinder.load();
    }
  });

  SmartCurbAssistant bot([FakeData? data]) => SmartCurbAssistant(data ?? FakeData());
  List<String> labels(ChatReply r) => [for (final a in r.actions) a.label];

  group('hello, small talk and not understanding', () {
    test('hi gets the introduction and the menu', () async {
      for (final hi in ['hi', 'Hello!', 'hey there', 'hai', 'good morning']) {
        final r = await bot().reply(hi);
        expect(r.text, contains('Smart Curb AI Agent'), reason: hi);
        expect(labels(r), contains('Where should I park?'), reason: hi);
        expect(labels(r).length, SmartCurbAssistant.menu.length);
      }
    });

    test('a greeting is said back the way it was said', () async {
      final cases = {
        'good morning': 'Good morning!',
        'Good afternoon!': 'Good afternoon!',
        'evening': 'Good evening!',
        'hey there': 'Hey!',
        'hello': 'Hello!',
        'hi': 'Hi!',
        'howdy': 'Howdy!',
      };
      for (final e in cases.entries) {
        expect((await bot().reply(e.key)).text, startsWith(e.value), reason: e.key);
      }
      // With a question after it, the question gets answered too.
      final r = await bot().reply('good morning, where do I park for ED-47?');
      expect(r.text, startsWith('Good morning! '));
      expect(r.text, contains('ED-47'));
    });

    test('greets the user by first name, and briefly the second time', () async {
      final b = bot(FakeData(me: {'firstName': 'Sam'}));
      final first = await b.reply('good morning');
      expect(first.text, startsWith('Good morning, Sam! '));
      expect(first.text, contains('Smart Curb AI Agent'));
      final again = await b.reply('hi');
      expect(again.text, startsWith('Hi, Sam! '));
      expect(again.text, isNot(contains('Smart Curb AI Agent')));
      expect((await b.reply('thanks')).text, contains("You're welcome, Sam!"));
      expect((await b.reply('good night')).text, startsWith('Good night, Sam!'));
    });

    test('the chat opens with a hello for the time of day', () {
      final h = DateTime.now().hour;
      final hello = h >= 5 && h < 12
          ? 'Good morning'
          : (h >= 12 && h < 17 ? 'Good afternoon' : (h >= 17 ? 'Good evening' : 'Hi'));
      expect(bot().greeting().text, startsWith("$hello! I'm Smart Curb AI Agent"));
    });

    test('saying the same thing twice gets different words', () async {
      final b = bot();
      final one = await b.reply('thanks');
      final two = await b.reply('thank you');
      expect(one.text, isNot(two.text));
      final miss1 = await b.reply('asdf qwerty');
      final miss2 = await b.reply('zxcv bnm');
      expect(miss1.text, startsWith(_sorry));
      expect(miss2.text, startsWith(_sorry));
      expect(miss1.text, isNot(miss2.text));
      final p1 = await b.reply('where should I park for ED-47');
      final p2 = await b.reply('where should I park for ED-47');
      expect(p1.text, isNot(p2.text));
      expect(p2.text, contains('ED-47'));
    });

    test('everyday chat gets an everyday answer', () async {
      final cases = {
        "I'm good, how about you?": "I'm doing great too",
        "I'm fine": 'Glad to hear it',
        'ok': 'Great!',
        'got it': 'Great!',
        'lol': 'Haha',
        'sorry': 'No worries',
        'my bad': 'No worries',
        'are you there?': "I'm here",
        "what's up": 'Not much',
        'nice to meet you': 'Nice to meet you too',
        'are you chatgpt': "I'm Smart Curb AI Agent",
        'are you siri': "I'm Smart Curb AI Agent",
        'do you sleep': '24/7',
        "I'm bored": 'parking joke',
        'tell me a fun fact': 'Fun fact',
        "what's your favorite thing": 'My favorite thing',
        'how old are you': kAppVersion,
        'where are you from': 'FAU',
        "I'm so tired": 'long day',
        'you are welcome': 'Aw, thanks',
        'good luck': 'you too',
        'have a nice day': 'Bye',
        'tell me a joke': 'parked in knowledge',
      };
      for (final e in cases.entries) {
        expect((await bot().reply(e.key)).text, contains(e.value), reason: e.key);
      }
      // A second joke is a different one.
      final b = bot();
      final j1 = await b.reply('tell me a joke');
      final j2 = await b.reply('Tell me another joke');
      expect(j1.text, isNot(j2.text));
    });

    test('in a hurry or frustrated: answered in kind', () async {
      expect((await bot().reply("I'm late!")).text, contains("let's get you parked fast"));
      final late = await bot().reply("I'm late for class at ED-47");
      expect(late.text, startsWith("Let's get you there fast! "));
      expect(late.text, contains('ED-47'));
      final ugh = await bot().reply("ugh I can't find parking anywhere");
      expect(ugh.text, contains("parking hunts are the worst"));
      expect(ugh.text, contains('Which building'));
      // ...and then the building is enough.
      final b = bot();
      await b.reply("I can't find a spot");
      expect((await b.reply('the library')).text, contains('LY-3'));
    });

    test('gibberish gets "sorry" and the menu again', () async {
      for (final m in [
        'asdf qwerty',
        'purple monkey dishwasher',
        'what is the meaning of life',
      ]) {
        final r = await bot().reply(m);
        expect(r.text, startsWith(_sorry), reason: m);
        expect(labels(r), contains('Open spots right now'), reason: m);
      }
    });

    test('thanks, bye, how are you, who are you', () async {
      expect((await bot().reply('thanks!')).text, contains('welcome'));
      expect((await bot().reply('ok bye')).text, contains('Bye'));
      expect((await bot().reply('how are you?')).text, contains('running'));
      expect((await bot().reply('who are you')).text, contains('Smart Curb AI Agent'));
      expect((await bot().reply('what can you do')).actions, isNotEmpty);
    });
  });

  group('where to park', () {
    test('by building code, any way it is written', () async {
      for (final m in [
        'where should I park for ED-47?',
        'ed47',
        'parking near ed 47',
        'ED-47',
      ]) {
        final r = await bot().reply(m);
        expect(r.text, contains('College of Education (ED-47)'), reason: m);
        final go = r.actions.firstWhere((a) => a.building != null);
        expect(go.label, 'Navigate there');
        expect(go.building!.code, 'ED-47');
        expect(go.place, fauBoca);
      }
    });

    test('by name, even with a typo', () async {
      expect((await bot().reply('where do I park for the college of business'))
          .text, contains('BU-86'));
      expect((await bot().reply('parkng for colege of bussiness')).text,
          contains('BU-86'));
      expect((await bot().reply('closest lot to the library')).text,
          contains('LY-3'));
    });

    test('when the best spot is a curb, it names the curb and the count',
        () async {
      // A building whose best parking (with the fake data) is an open curb.
      final lots = await FakeData().lots(fauBoca);
      final near = fauBoca.buildings.firstWhere(
        (b) => bestParkingFor(fauBoca, b, lots)?.unitId != null,
      );
      final r = await bot().reply('where should i park for ${near.code}');
      expect(r.text, contains('curb C-077 in Lot 14 (1 free right now)'));
    });

    test('an ambiguous building asks which one', () async {
      final r = await bot().reply('where should I park for engineering');
      expect(r.text, contains('Which one'));
      expect(labels(r).join(' '), contains('EE-96'));
      expect(labels(r).join(' '), contains('EG-36'));
      // Tapping one answers it.
      final pick = r.actions.firstWhere((a) => a.label.contains('EE-96'));
      expect((await bot().reply(pick.ask!)).text, contains('EE-96'));
    });

    test('"where should I park?" then just the building', () async {
      final b = bot();
      final ask = await b.reply('Where should I park?');
      expect(ask.text, contains('Which building'));
      final r = await b.reply('the library');
      expect(r.text, contains('LY-3'));
      // Not a building: it says so and keeps asking.
      final again = await b.reply('where should i park');
      expect(again.text, contains('Which building'));
      expect((await b.reply('zzzz')).text, contains("couldn't find"));
    });

    test('Broward Mall stores, and a hello in front of a question', () async {
      final r = await bot().reply("hi, where do I park for macy's");
      expect(r.text, startsWith('Hi! '));
      expect(r.text, contains("Macy's"));
      expect(r.text, contains('Parking Lot 2'));
      expect(r.actions.firstWhere((a) => a.place != null).place, browardMall);
    });
  });

  group('lots and open spots', () {
    test('a lot with curbs: live count', () async {
      final r = await bot().reply('is lot 14 full?');
      expect(r.text, contains('Lot 14 has 1 of 2'));
      expect(r.text, contains('1 curb is offline'));
    });

    test('a lot without curbs, a garage, and one that does not exist', () async {
      expect((await bot().reply('how many spots in lot 6')).text,
          contains("doesn't have Smart Curb sensors"));
      expect((await bot().reply('garage 2')).text,
          contains("doesn't have Smart Curb sensors"));
      expect((await bot().reply('lot 999')).text, contains("couldn't find"));
    });

    test('open spots right now: every live lot, and the mall', () async {
      final r = await bot().reply('Open spots right now');
      expect(r.text, contains('FAU Lot 14: 1 of 2 open'));
      expect(r.text, contains('Broward Mall: no Smart Curb sensors'));
      expect((await bot().reply('any free spaces?')).text,
          contains('Lot 14'));
    });
  });

  group("the user's own things", () {
    FakeData data() => FakeData(
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
    ChatAction step(ChatReply r, String label) =>
        r.actions.firstWhere((a) => a.label == label);

    test('vehicles: the list', () async {
      final r = await bot(data()).reply('my vehicles');
      expect(r.text, contains('2 vehicles'));
      expect(r.text, contains('Toyota Camry (2020, Blue), plate OWL123'));
      expect(labels(r), contains('Delete a vehicle'));
      expect((await bot(FakeData()).reply('my car')).text,
          contains("haven't added"));
    });

    test('add a car with the form in the chat', () async {
      final d = data();
      final b = bot(d);
      final r = await b.reply('can you help me add another car?');
      expect(r.text, startsWith('Sure!'));
      final form = r.form!;
      expect([for (final f in form.fields) f.key],
          ['manufacturer', 'model', 'plate', 'year', 'color']);
      // Model and plate are required, and the year must look like one.
      expect(form.check({'model': '', 'plate': ''}), contains('model'));
      expect(form.check({'model': 'RAV 4', 'plate': 'X1', 'year': '99'}),
          contains('4 digits'));
      final done = await b.submit(form, {
        'manufacturer': 'Toyota', 'model': 'RAV 4', 'plate': 'S108123',
        'year': '2024', 'color': 'Silver',
      });
      expect(done.text, contains('Done! I added your Toyota RAV 4 (plate S108123)'));
      expect(done.text, contains('Anything else I can help you with?'));
      expect(d.cars.last['model'], 'RAV 4');
      expect(d.cars, hasLength(3));
    });

    test('delete a car: pick it, confirm, gone', () async {
      final d = data();
      final b = bot(d);
      final r = await b.reply('can you help me delete a car');
      expect(r.text, contains('Which vehicle do you want to delete?'));
      expect(labels(r), ['Toyota Camry · OWL123', 'Honda Civic · HND777', 'Cancel']);
      final sure = await b.run(step(r, 'Honda Civic · HND777'));
      expect(sure.text, contains("can't be undone"));
      final done = await b.run(step(sure, 'Yes, delete it'));
      expect(done.text, contains('Done! I deleted your Honda Civic (plate HND777)'));
      expect(d.cars.map((c) => c['model']), ['Camry']);

      // Named straight away, and "yes" typed instead of tapped.
      final d2 = data();
      final b2 = bot(d2);
      expect((await b2.reply('remove my camry')).text, contains('Delete your Toyota Camry'));
      expect((await b2.reply('yes')).text, contains('Done! I deleted'));
      expect(d2.cars, hasLength(1));
      // "No, keep it" keeps it.
      final d3 = data();
      final b3 = bot(d3);
      await b3.reply('delete the honda');
      expect((await b3.reply('no')).text, contains("didn't change anything"));
      expect(d3.cars, hasLength(2));
    });

    test('change a car: pick it, the form shows its details', () async {
      final d = data();
      final b = bot(d);
      final r = await b.reply('can you help me change vehicle information?');
      expect(r.text, contains('Which vehicle do you want to change?'));
      final form = (await b.run(step(r, 'Toyota Camry · OWL123'))).form!;
      expect(form.initial['plate'], 'OWL123');
      expect(form.initial['color'], 'Blue');
      final done = await b.submit(form, {...form.initial, 'color': 'Red'});
      expect(done.text, contains('Done! I changed your Toyota Camry'));
      expect(d.cars.first['color'], 'Red');
      // Typing the car instead of tapping it.
      final b2 = bot(data());
      await b2.reply('edit my vehicle');
      expect((await b2.reply('the civic')).form!.initial['plate'], 'HND777');
    });

    test('no cars yet: offers to add one', () async {
      final b = bot(FakeData());
      final r = await b.reply('delete my car');
      expect(r.text, contains("don't have any vehicles"));
      expect((await b.reply('yes')).form, isNotNull);
    });

    test('contact info: shown, then changed in the form', () async {
      final d = data();
      final b = bot(d);
      final me = await b.reply('show my contact information');
      expect(me.text, contains('Sam Owl'));
      expect(me.text, contains('561-555-1234'));
      expect(me.text, contains('owl@fau.edu'));
      expect(me.text, contains('1 Owl Way, Boca Raton, FL 33431, USA'));

      final r = await b.reply('can you help me change my contact information?');
      expect(r.text, contains("Here's your contact information now"));
      final form = r.form!;
      expect(form.initial['firstName'], 'Sam');
      expect(form.initial['gender'], 'Other');
      expect(form.check({...form.initial, 'phone': '555'}), contains('10-digit'));
      expect(form.check({...form.initial, 'city': ''}), contains('city'));
      final done = await b.submit(form, {...form.initial, 'city': 'Miami'});
      expect(done.text, contains('Done! I changed your contact information'));
      expect(d.me!['city'], 'Miami');
      expect((await bot(data()).reply('change my phone number')).form!.focus,
          'phone');
    });

    test('no contact info yet: fill it in now, or later', () async {
      final d = FakeData();
      final b = bot(d);
      final ask = await b.reply('can you help me change my contact information?');
      expect(ask.text, startsWith("Sorry, you didn't fill in your contact information yet"));
      expect(ask.text, contains('Do you want to do it now?'));
      expect(labels(ask), ['Yes, fill it in now', 'No, maybe later']);
      final form = (await b.run(step(ask, 'Yes, fill it in now'))).form!;
      expect(form.initial, isEmpty);
      final done = await b.submit(form, {
        'firstName': 'Ann', 'lastName': 'Lee', 'middleName': '',
        'phone': '5615550000', 'gender': 'Female', 'address1': '2 Main St',
        'address2': '', 'city': 'Boca Raton', 'state': 'FL',
        'zipCode': '33431', 'country': 'USA',
      });
      expect(done.text, contains('Done! I saved your contact information'));
      expect(d.me!['firstName'], 'Ann');

      final later = bot(FakeData());
      await later.reply('my profile');
      final no = await later.reply('no');
      expect(no.text, contains('Profile Incomplete'));
      expect(no.actions.single.tab, kProfileTab);
    });

    test('places on Home: list, add, add back, remove, open', () async {
      // What can I choose: every place, which ones are added.
      final d = data();
      final b = bot(d);
      final list = await b.reply('what places are available for me to choose?');
      expect(list.text, contains('Florida Atlantic University: on your Home ✓'));
      expect(list.text, contains('Broward Mall: not added yet'));
      expect(labels(list), ['Open FAU', 'Add Broward Mall', 'Remove a place']);
      expect(list.actions.first.place, fauBoca);

      // "Add Broward again, I deleted it": added right away.
      final again = await b.reply('can you help me add Broward again? I accidently delete it');
      expect(again.text, contains('Done! I added Broward Mall to your places on Home'));
      expect(d.saved, contains('broward_mall'));
      expect((await b.reply('add broward mall')).text, contains('already on your Home'));
      expect((await b.reply('add a place')).text, contains("already added every place"));

      // Remove: which one, confirm, gone (and it can come back).
      final which = await b.reply('can you help me delete 1 place');
      expect(labels(which), ['FAU', 'Broward Mall', 'Cancel']);
      final sure = await b.reply('FAU');
      expect(sure.text, contains('Remove Florida Atlantic University from your Home?'));
      final gone = await b.reply('yes');
      expect(gone.text, contains('Done! I removed Florida Atlantic University'));
      expect(d.saved, ['broward_mall']);
      final back = await b.run(gone.actions.firstWhere((a) => a.label == 'Add it back'));
      expect(back.text, contains('Done! I added Florida Atlantic University'));

      // Open a place's map from a message.
      final open = await b.reply('open the FAU map');
      expect(open.text, contains('Opening the FAU map'));
      expect(open.followUp!.place, fauBoca);
      expect((await b.reply('take me to broward mall')).followUp!.place, browardMall);
      // ...but a building there is still about its parking.
      expect((await b.reply('take me to the library at FAU')).text, contains('LY-3'));

      // Is it added, and where is it.
      expect((await bot(data()).reply('is broward mall added?')).text,
          contains("isn't on your Home yet"));
      expect((await b.reply('what is the address of broward mall')).text,
          contains('8000 W Broward Blvd'));
    });

    test('adding a place with none named offers the missing ones', () async {
      final b = bot(FakeData());
      final r = await b.reply('how do I add a place');
      expect(r.text, contains('Which place do you want to add?'));
      expect(labels(r), ['Add FAU', 'Add Broward Mall', 'Add all', 'Cancel']);
      expect((await b.reply('add all')).text, contains('Done! I added'));
      expect((await bot(FakeData()).reply('remove a place')).text,
          contains("don't have any places"));
    });
  });

  group('how things work', () {
    test('colors, how it works, directions, support, log out', () async {
      expect((await bot().reply('what do the colors mean')).text,
          contains('Green space'));
      expect((await bot().reply('what does red mean on the map')).text,
          contains('taken'));
      expect((await bot().reply('How does Smart Curb work?')).text,
          contains('senses'));
      expect((await bot().reply('how do I get directions')).text,
          contains('focus mode'));
      expect((await bot().reply('Contact support')).text, contains(kSupportEmail));
      // ...while the building with "Support" in its name is still found.
      expect((await bot().reply('parking for student support services')).text,
          contains('SU-80'));
      expect((await bot().reply('how do i log out')).text, contains('log-out'));
    });

    test('choosing or changing where to go', () async {
      for (final m in [
        'then how can I choose my building now?',
        'how can I add where I want to go',
        'how can I select what building to go',
        'how do I pick a building',
        'how do I change my destination',
        'how to search for a building',
        "where i'm going, how do i set it",
        'How do I choose a building?',
      ]) {
        final r = await bot().reply(m);
        expect(r.text, contains('Search for destination'), reason: m);
      }
      // A named building still gets its parking answer.
      expect((await bot().reply('how do I choose ED-47')).text,
          contains('College of Education (ED-47)'));
      // "where can I park near the engineering building" is still "which one?"
      expect((await bot().reply('where can I park near the engineering building'))
          .text, contains('Which one'));
    });

    test('choosing where to go asks which place, with live counts', () async {
      final r = await bot().reply('how can I add where I want to go?');
      expect(r.text, contains('Available now:'));
      expect(r.text, contains('• FAU: 1 of 2 Smart Curb spots open'));
      expect(r.text, contains('• Broward Mall: 4 lots'));
      expect(r.text, contains('Where do you want to go?'));
      final picks = r.actions.where((a) => a.place != null).toList();
      expect([for (final a in picks) a.label], ['FAU', 'Broward Mall']);
      expect(picks.every((a) => a.building == null), isTrue);
      expect(r.actions.any((a) => a.tab != null), isFalse);
      // "Show me the map" asks the same way.
      expect((await bot().reply('show me the map')).text,
          contains('Where do you want to go?'));
    });

    test('a place is added to Home only once', () async {
      final data = FakeData(saved: ['fau_boca']);
      expect(await data.savePlace(fauBoca), isFalse);
      expect(await data.savePlace(browardMall), isTrue);
      expect(await data.savePlace(browardMall), isFalse);
    });

    test('talking to a person', () async {
      for (final m in [
        'I want to talk with an agent',
        'can I speak to a real person',
        'customer service',
        'connect me to someone on the team',
      ]) {
        final r = await bot().reply(m);
        expect(r.text, contains('not a person'), reason: m);
        expect(r.text, contains(kSupportEmail), reason: m);
      }
    });

    test('questions about using the map and the app', () async {
      final cases = {
        'how do I stop navigation': 'stop navigating',
        'cancel my route': 'stop navigating',
        'how do I open the map': 'place card',
        'the map is blank': 'blank or stuck',
        'how do I go back': 'back arrow',
        'what happens when I tap a lot': "tap a lot's dot",
        'how do I see each curb': "tap a lot's dot",
        'how do I switch to 3D': '3D',
        'how do I recenter the map': 'Reset Map View',
        'what is developer mode': 'Developer mode',
        'how do I simulate a drive': 'Simulate Run',
        'my location is wrong': 'Location Services',
        'gps not working': 'Location Services',
        'do you track me': "doesn't save it",
        'what if the lot fills up while driving': 'next best lot',
        'I parked, now what?': 'walking path',
        'how far is the walk': 'real sidewalks',
        'why did you pick that lot': 'shortest walk',
        'can I reserve a spot': 'first come, first served',
        'where can I charge my EV': 'Charging stations',
        'handicap parking': 'accessible (ADA)',
        'do I need a parking permit': 'permit',
        'is the app free': 'app is free',
        'when is the best time to park': "can't predict",
        'does it work without internet': 'internet connection',
        'why is the curb gray': 'offline',
        'how accurate are the counts': 'live',
        'turn off notifications': 'Settings > Notifications',
        'where are the settings': 'Settings are in',
        'what version is this': kAppVersion,
        'how do I sign up': 'Register',
        'how do I change my email': "can't be changed",
        'delete my account': "Deleting an account",
        'how do I edit my car': 'nothing to change',
        'how do I use the app': "Here's how to use Smart Curb",
        'is there voice navigation': 'no spoken voice',
        'dark mode': 'dark theme',
        'hablas espanol': 'only understand English',
        "what's the weather": "can't check the weather",
        'the app keeps crashing': 'closing and reopening',
        'search my locations': 'filters your saved places',
        'does it work at other campuses': 'Smart Curb works at',
        'how do I turn on focus mode': 'Focus mode follows you',
        'tap the arrow button': 'Focus mode follows you',
        'the arrow is not moving': 'Location Services',
        'I am lost': 'No worries',
        'can I save a building': "can't be saved",
        'do I need an account': 'needs an account',
        'can I park overnight': 'overnight parking',
        'is it free to park': "doesn't set the parking rules",
        'who owns this app': 'Team Smart Curb',
        'what is this': 'wheel stop',
        'how many lots are there': 'FAU has',
        'what buildings are there': 'I know',
      };
      for (final e in cases.entries) {
        final r = await bot().reply(e.key);
        expect(r.text, contains(e.value), reason: e.key);
      }
    });

    test('live answers: emptiest lot, curb count, time, sign-in', () async {
      expect((await bot().reply('which lot has the most space?')).text,
          contains('FAU Lot 14 has the most open spots: 1 of 2'));
      final count = await bot().reply('how many curbs are there');
      expect(count.text, contains('3 Smart Curbs'));
      expect(count.text, contains('2 online'));
      expect((await bot().reply('what time is it')).text, contains(' on '));
      expect((await bot().reply('which account am I logged in with')).text,
          contains('owl@fau.edu'));
    });

    test('a policy question with a building gets both answers', () async {
      final r = await bot().reply('accessible parking near the library');
      expect(r.text, contains('accessible (ADA)'));
      expect(r.text, contains('LY-3'));
      expect(r.actions.first.label, 'Navigate there');
    });

    test('small talk: compliments, insults, yes and no', () async {
      expect((await bot().reply("you're awesome")).text, contains('thank'));
      expect((await bot().reply('this app sucks')).text, contains('sorry I let'));
      expect((await bot().reply('yes')).text, contains('What would you like'));
      expect((await bot().reply('no')).text, contains("I'm right here"));
    });

    test('the old answers still win where they should', () async {
      final cases = {
        'what does the green dot mean': 'Green space',
        'show me open spots on the map': 'sensors see right now',
        'how do I get directions': 'focus mode',
        'how do I add a place': 'Which place do you want to add?',
        'how do I add a new car': "Fill in your car's details",
        'how do i change my phone number': 'Sorry, you didn',
        'is lot 14 full?': 'Lot 14 has 1 of 2',
        'what is my email': 'owl@fau.edu',
      };
      for (final e in cases.entries) {
        final r = await bot().reply(e.key);
        expect(r.text, contains(e.value), reason: e.key);
      }
    });

    test('typing time grows with the reply, from 1 s to 10 s', () async {
      expect(typingTime(''), const Duration(seconds: 1));
      expect(typingTime('Hi!'), const Duration(milliseconds: 1030));
      expect(typingTime('x' * 300), const Duration(seconds: 4));
      expect(typingTime('x' * 5000), const Duration(seconds: 10));
      final long = await bot().reply('How do I choose a building?');
      expect(typingTime(long.text).inSeconds, inInclusiveRange(5, 10));
    });

    test('every menu suggestion gets a real answer', () async {
      for (final a in SmartCurbAssistant.menu) {
        final r = await bot().reply(a.ask!);
        expect(r.text, isNot(startsWith(_sorry)), reason: a.label);
      }
    });
  });

  group('questions about the app itself', () {
    test('progress, safety, version and everything around it', () async {
      final cases = {
        'what is the current progress of the app now?': 'still growing',
        'is the app finished?': 'Not in the app yet',
        'is it in beta': 'Working now',
        'what are the limitations': 'Not in the app yet',
        'is this app safe to use?': 'Smart Curb is safe to use',
        'is this a scam': 'safe to use',
        'can I trust this app': 'safe to use',
        'what is the current version of the app?': kAppVersion,
        "what's new": 'Recent updates',
        'what features does the app have': "Here's what Smart Curb does",
        'what does this app do': "Here's what Smart Curb does",
        'when will you add voice directions': "don't have release dates",
        'what is coming next': "don't have release dates",
        'how often is the app updated': "don't have release dates",
        'does it work on iphone': 'iPhones',
        'can I use it on my computer': 'web browser',
        'what is the app built with': 'Flutter',
        'is it open source': kSupportEmail,
        'is this an official FAU app': 'FAU Engineering senior design team',
        'why was smart curb made': 'end circling',
        'why use this instead of google maps': 'open parking spot',
        'how is it different from waze': 'open parking spot',
        'how many people use the app': "don't have user numbers",
        'does the app have ads': 'no ads',
        'is there a privacy policy': 'privacy policy page',
        'what permissions does the app need': 'location',
        'does the app use my camera': "doesn't use your camera",
        'how do I rate the app': 'means a lot',
        'what is the app called': 'Smart Curb',
        'who is the team': 'Team Smart Curb',
        'does it work in other countries': 'Smart Curb works at',
      };
      for (final e in cases.entries) {
        final r = await bot(FakeData(saved: ['fau_boca'])).reply(e.key);
        expect(r.text, contains(e.value), reason: e.key);
      }
    });

    test('...without taking over look-alike questions', () async {
      final b = FakeData(me: {'firstName': 'Sam', 'lastName': 'Owl'});
      expect((await bot(b).reply('status of lot 14')).text, contains('Lot 14 has'));
      expect((await bot(b).reply('complete my profile')).form, isNotNull);
      expect((await bot(b).reply('how many devices are there')).text, contains('Smart Curbs'));
      expect((await bot(b).reply('is it safe to park at night')).text, contains('well-lit'));
      expect((await bot(b).reply('sign in with apple')).text, contains('email and a password'));
      expect((await bot(b).reply('can you add a feature')).text, contains('Feature ideas'));
      expect((await bot(b).reply('where should I park for the police building')).text,
          contains('CO-69'));
    });
  });

  group('a reliable backup for life and hobbies', () {
    test('feelings get a caring answer, topics a friendly one', () async {
      final cases = {
        "I'm feeling really sad today": '988',
        'I feel so lonely': '988',
        "I'm stressed about my exam": 'deep breath',
        'I just graduated!!': 'congrats',
        'have you watched any good anime': 'movies and shows',
        'what song should I listen to': 'music',
        'do you play minecraft': 'games',
        'who will win the nba finals': 'sports',
        'can you explain physics to me': 'science',
        'my boss is annoying': 'work',
        'my dog is so cute': 'pets',
        'any ideas for the weekend': 'trips',
        'do you know python': 'tech',
      };
      for (final e in cases.entries) {
        final r = await bot().reply(e.key);
        expect(r.text, contains(e.value), reason: e.key);
        expect(r.text, isNot(startsWith(_sorry)), reason: e.key);
      }
      // ...while app questions with those words still get the app's answer.
      expect((await bot().reply('parking for the gym')).text, contains('RC-91'));
      expect((await bot().reply('ugh parking is stressful')).text,
          contains('Which building'));
      expect((await bot().reply('show me my vehicles')).text,
          isNot(contains('movies')));
    });
  });

  group('going on with the conversation', () {
    test('"can I ask another question?" gets an invitation, not "sorry"', () async {
      for (final q in [
        'also can I have another question?',
        'I have a question',
        'can I ask you something',
        'quick question',
        'one more thing',
        'can you help me with something',
      ]) {
        final r = await bot().reply(q);
        expect(r.text, isNot(startsWith(_sorry)), reason: q);
        expect(r.text, anyOf(contains('Ask away'), contains("I'm all ears"),
            contains('Go for it')), reason: q);
      }
      expect((await bot().reply('hold on')).text, contains('take your time'));
      // A real question with "question" in it still gets answered.
      expect((await bot().reply('I have a question, where do I park for ED-47'))
          .text, contains('ED-47'));
    });
  });

  group('safety first', () {
    test('accidents, emergencies and trouble on the road', () async {
      final cases = {
        'I had a car accident': 'are you okay',
        'I got into an accident in lot 14': 'are you okay',
        'someone hit my car': 'Exchange names, phone numbers, insurance',
        'I scratched someone car': 'leave a note',
        'what should I do after an accident': 'Take photos',
        'I hit a smart curb': "Don't worry about the curb",
        'I backed into a curb by accident': "Don't worry about the curb",
        'someone is hurt': 'Please call $kEmergencyNumber right now',
        'I need an ambulance': 'Please call $kEmergencyNumber right now',
        'can you call 911': 'Please call $kEmergencyNumber right now',
        'can you call the police': "I can't make calls myself",
        'my car got stolen': 'report it to the police',
        'someone broke into my car': 'report it to the police',
        'my car was towed': 'towing company',
        'I feel unsafe': 'Your safety comes first',
        'someone is following me': 'Your safety comes first',
        'is it dangerous to park at night': 'well-lit',
        'my car wont start': 'roadside assistance',
        'I have a flat tire': 'roadside assistance',
        'I locked my keys in my car': 'lockout',
        'someone is blocking my car': "don't try to squeeze out",
        'someone took my spot': "let's find you another",
        'I am driving right now': 'keep your eyes on the road',
      };
      for (final e in cases.entries) {
        expect((await bot().reply(e.key)).text, contains(e.value), reason: e.key);
      }
      // The campus police number is given where it helps.
      expect((await bot().reply('I had a car accident')).text,
          contains(kCampusPolicePhone));
    });

    test('everyday wording is not mistaken for an emergency', () async {
      final cases = {
        'I ran into a problem': kSupportEmail,
        'the app wont start': 'closing and reopening',
        'the curb shows the wrong color': "curb's number",
        'what if the lot fills up while driving': 'next best lot',
        'where should I park for the police building': 'CO-69',
      };
      for (final e in cases.entries) {
        expect((await bot().reply(e.key)).text, contains(e.value), reason: e.key);
      }
    });
  });

  group('asked to do something it cannot do', () {
    test('registering an account: no, then how to do it yourself', () async {
      for (final q in [
        'is it possible to register another account through the AI chat box?',
        'can you register an account for me',
        'can the AI create an account for me',
      ]) {
        final r = await bot().reply(q);
        expect(r.text, startsWith("No, sorry, I can't create or register an account"), reason: q);
        expect(r.text, contains("here's how you can do it yourself"), reason: q);
        expect(r.text, contains('Log out with the icon at the top left'), reason: q);
        expect(r.text, contains("Don't have an account? Register"), reason: q);
      }
      // Asking how (not asking the assistant to do it) gets just the steps.
      final how = await bot().reply('how do I register another account');
      expect(how.text, isNot(contains('No, sorry')));
      expect(how.text, contains('1. Log out'));
    });

    test('other things only the user (or the team) can do', () async {
      final cases = {
        'can you log me in': "No, sorry, I can't sign you in",
        'can you log me out': "No, sorry, I can't log you out",
        'can you reset my password': "No, sorry, I can't see, change or reset passwords",
        'can you change my email': "No, sorry, I can't change your email",
        'can you delete my account': "No, sorry, I can't delete your account",
        'can you turn on notifications': "No, sorry, I can't change your settings",
        'can you turn on 3d': "No, sorry, I can't switch the map to 3D",
        'can you pay for my parking': "No, sorry, I can't pay for parking",
        'can you park my car': "I can't drive or park your car",
        'can you call me': "I can't make calls",
        'can you text me when a spot opens': "I can't send texts or alerts",
        'where did I park': "I can't remember where you parked",
        'can you remind me to move my car': "I can't set reminders",
        'can you reserve a spot for me': "can't be reserved",
      };
      for (final e in cases.entries) {
        expect((await bot().reply(e.key)).text, contains(e.value), reason: e.key);
      }
    });

    test('...while what it can do, it just does', () async {
      expect((await bot().reply('can you add my car')).form, isNotNull);
      expect((await bot().reply('is it possible to add a car through the chat')).form, isNotNull);
      expect((await bot().reply('can you add broward mall')).text, contains('Done! I added'));
    });
  });

  group('what customers ask', () {
    final me = {
      'firstName': 'Sam', 'lastName': 'Owl', 'phone': '561-555-1234',
      'address1': '1 Owl Way', 'city': 'Boca Raton', 'state': 'FL',
    };
    FakeData data() => FakeData(
          me: me,
          cars: [{'manufacturer': 'Toyota', 'model': 'Camry', 'plate': 'OWL123'}],
          saved: ['fau_boca'],
        );

    test('accounts', () async {
      final cases = {
        'can I have two accounts': 'register another account',
        'how do I switch accounts': 'signed in as owl@fau.edu',
        'what email am I using': 'signed in as owl@fau.edu',
        'why do I need an account': 'needs an account',
        'can I use the app without an account': 'needs an account',
        'can I sign in with google': 'email and a password only',
      };
      for (final e in cases.entries) {
        expect((await bot(data()).reply(e.key)).text, contains(e.value), reason: e.key);
      }
    });

    test('parking', () async {
      final cases = {
        'is there parking at FAU': 'Florida Atlantic University has 47 parking lots',
        'best lot for engineering': 'Which one do you mean',
        'parking for the gym': 'Recreation & Fitness Center (RC-91)',
        'how far is lot 14 from the library': 'From Lot 14 to S E Wimberly Library (LY-3)',
        'which lots have smart curbs': 'FAU Lot 14: 3 curbs',
        'is parking free': 'The Smart Curb app is free',
        'where can visitors park': 'Visitor rules depend on the place',
        'motorcycle parking': "don't track motorcycle",
        'is curb C-077 open': 'C-077 in Lot 14 is open right now',
        'is curb C-095 open': 'C-095 in Lot 14 is taken',
        'is curb C-001 free': 'C-001 in Lot 14 is offline',
        'is curb C-999 open': "couldn't find a curb called C-999",
        "what's the closest lot to me": "by where you're going",
        'can I park anywhere': 'parking rules',
        'when does the lot fill up': "can't predict busy times",
        'I got a parking ticket': "doesn't issue or handle parking tickets",
        'I want a refund': 'nothing to refund',
      };
      for (final e in cases.entries) {
        expect((await bot(data()).reply(e.key)).text, contains(e.value), reason: e.key);
      }
    });

    test('the map', () async {
      final cases = {
        'the route is wrong': 'Routes follow real roads',
        'why did it change my lot': 'next best lot',
        'what is the blue line': 'bright green line is your driving route',
        'what does the dotted line mean': 'walk to the door',
        'how do I see my location on the map': "You're the arrow on the map",
        'can I see the walking path': 'dotted green walking path',
        'does it work at night': 'day and night',
        'what happens when it rains': 'rain or shine',
      };
      for (final e in cases.entries) {
        expect((await bot(data()).reply(e.key)).text, contains(e.value), reason: e.key);
      }
    });

    test('places on Home', () async {
      final cases = {
        'my place disappeared': "Let's take a look!",
        'how many places can I add': 'You can add every place',
        'can I add my home address': 'your own address can',
        'can you add miami campus': "doesn't work at Miami yet",
        'what is on my home page': 'Florida Atlantic University: on your Home',
        'is the mall open': "don't have opening hours",
      };
      for (final e in cases.entries) {
        expect((await bot(data()).reply(e.key)).text, contains(e.value), reason: e.key);
      }
    });

    test('vehicles and contact info', () async {
      final cases = {
        'what is my license plate': "Your Toyota Camry's plate is OWL123",
        'how many cars can I add': 'As many as you like',
        'can I set a default car': 'no default car',
        'why do I need to add my car': 'optional',
        'I sold my car': 'Delete your Toyota Camry',
        'what is my phone number': 'Your phone number is 561-555-1234.',
        'what is my name': 'Your name is Sam Owl.',
        "what's my address": 'Your address is 1 Owl Way, Boca Raton, FL.',
        'why do you need my address': 'part of your Smart Curb account',
        'delete my contact info': "can't be removed",
      };
      for (final e in cases.entries) {
        expect((await bot(data()).reply(e.key)).text, contains(e.value), reason: e.key);
      }
      expect((await bot(data()).reply('can I add a motorcycle')).form, isNotNull);
      expect((await bot(data()).reply('I moved')).form!.focus, 'address1');
    });

    test('the curbs, support and everything else', () async {
      final cases = {
        'what is a smart curb': 'wheel stop',
        'tell me about smart curb': 'wheel stop',
        'how does it detect cars': 'senses',
        'what if a curb is broken': "curb's number",
        'the curb shows the wrong color': "curb's number",
        'is it solar powered': 'solar',
        'do the curbs have batteries': 'solar-powered',
        'how much does a smart curb cost': "aren't for sale",
        'who installed the curbs': 'Team Smart Curb',
        'the app is slow': 'closing and reopening',
        'can you add a feature': 'Feature ideas',
        'what time does the library close': "don't have opening hours",
        'where is the bathroom': "can't find restrooms",
        'where can I eat': "can't recommend places to eat",
        'does the app drain my battery': 'battery',
        'how do I delete the app': "doesn't delete your account",
        'my friend wants the app': 'their own email',
        'is my location shared': "doesn't save it",
        'what does sensored mean': 'have a Smart Curb',
        "I can't find my building": "building's code",
        'how do I close the chat': 'back arrow',
        'are you real': 'not a person',
        'what is your name': 'Smart Curb AI',
        'what is 2+2': "That's 4!",
        'what is 10 / 4': "That's 2.50!",
        'start over': 'Fresh start',
        'never mind': 'No problem',
        'huh': 'Sorry if that was confusing',
        'you are wrong': 'I got it wrong',
        'this is cool': 'thank you',
      };
      for (final e in cases.entries) {
        expect((await bot(data()).reply(e.key)).text, contains(e.value), reason: e.key);
      }
      // "campus" alone isn't the Campus Operations & Police building.
      expect((await bot(data()).reply('study on campus')).text,
          isNot(contains('CO-69')));
      // A phone number isn't a sum.
      expect((await bot(data()).reply('my phone is 561-555-1234')).text,
          isNot(contains("That's")));
      expect((await bot().reply('start over')).clearsChat, isTrue);
    });
  });
}
