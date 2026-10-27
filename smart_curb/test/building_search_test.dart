import 'package:flutter_test/flutter_test.dart';
import 'package:smart_curb/main.dart';

void main() {
  List<String> codes(String query) =>
      [for (final b in rankBuildingMatches(fauBoca.buildings, query)) b.code];

  test('an exact building code shows only that building', () {
    expect(codes('ED-47'), ['ED-47']);
    expect(codes('ed-47'), ['ED-47']);
    expect(codes('ed47'), ['ED-47']);
    expect(codes(' ED 47 '), ['ED-47']);
  });

  test('an exact building name shows only that building', () {
    expect(codes('College of Education'), ['ED-47']);
    expect(codes('college  of education '), ['ED-47']);
    expect(codes('College of Education (ED-47)'), ['ED-47']);
    // Broward Mall: the store's name is its whole label.
    final mall = [
      for (final b in rankBuildingMatches(browardMall.buildings, "macy's"))
        b.code,
    ];
    expect(mall, ["Macy's"]);
  });

  test('anything short of exact still lists every possibility', () {
    // "ED-4" isn't a code on its own: ED-47 first, but not alone.
    expect(codes('ed').first, 'ED-47');
    expect(codes('ed').length, greaterThan(1));
    // Several buildings are a "College of ...".
    expect(codes('college').length, greaterThan(1));
  });

  test('codes starting with the text come before other matches', () {
    // "Ed" starts ED-47's code; other names merely contain "ed".
    expect(codes('ed').first, 'ED-47');
    // Every "S..." code before any building that only mentions "s".
    final s = codes('s');
    final firstOther = s.indexWhere((c) => !c.startsWith('S'));
    expect(s.take(firstOther).every((c) => c.startsWith('S')), isTrue);
  });

  test('a name match finds the building by what it is', () {
    // Both "College of Education" and "Continuing Education Hall".
    expect(codes('education'), containsAll(['ED-47', 'CE-31D']));
    expect(codes('college of education').first, 'ED-47');
    expect(codes('library').first, 'LY-3');
    // Names starting with the text before names only containing it.
    final eng = codes('engineering');
    expect(eng.first, 'EE-96'); // "Engineering & Computer Science"
    expect(eng, contains('EG-36')); // "College of Engineering West"
  });

  test('no match, nothing; empty text, everything', () {
    expect(codes('zzzz'), isEmpty);
    expect(codes('').length, fauBoca.buildings.length);
  });
}
