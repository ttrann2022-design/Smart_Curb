import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_curb/main.dart';

Widget _app(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  testWidgets('a removed row collapses smoothly, then reports it is gone',
      (tester) async {
    var gone = false;
    Widget row(bool present) => _app(Column(
          children: [
            CollapsibleRow(
              present: present,
              onGone: () => gone = true,
              child: const SizedBox(height: 100, child: Text('car')),
            ),
          ],
        ));

    await tester.pumpWidget(row(true));
    expect(tester.getSize(find.byType(CollapsibleRow)).height, 100);

    await tester.pumpWidget(row(false));
    await tester.pump(kMotion ~/ 2);
    // Halfway: still there, partly collapsed, so the rows below slide up.
    final mid = tester.getSize(find.byType(CollapsibleRow)).height;
    expect(mid, greaterThan(0));
    expect(mid, lessThan(100));
    expect(gone, isFalse);

    await tester.pumpAndSettle();
    expect(tester.getSize(find.byType(CollapsibleRow)).height, 0);
    expect(gone, isTrue);
  });

  testWidgets('swipeOut: the row slides off left first, then the gap closes',
      (tester) async {
    var gone = false;
    Widget row(bool present) => _app(Column(
          children: [
            CollapsibleRow(
              present: present,
              swipeOut: true,
              onGone: () => gone = true,
              child: const SizedBox(height: 100, child: Text('place')),
            ),
            const SizedBox(height: 50, child: Text('below')),
          ],
        ));

    await tester.pumpWidget(row(true));
    final startX = tester.getTopLeft(find.text('place')).dx;
    final belowY = tester.getTopLeft(find.text('below')).dy;

    await tester.pumpWidget(row(false));
    await tester.pump(const Duration(milliseconds: 120));
    // Sliding left, but the row below hasn't moved yet.
    expect(tester.getTopLeft(find.text('place')).dx, lessThan(startX));
    expect(tester.getTopLeft(find.text('below')).dy, belowY);

    await tester.pump(const Duration(milliseconds: 120));
    // Now the gap is closing: the row below is on its way up.
    expect(tester.getTopLeft(find.text('below')).dy, lessThan(belowY));
    expect(gone, isFalse);

    await tester.pumpAndSettle();
    expect(tester.getTopLeft(find.text('below')).dy, belowY - 100);
    expect(gone, isTrue);
  });

  group('AnimatedRowList', () {
    Widget list(List<String> names, {bool springy = false, Object? query}) => _app(SizedBox(
          height: 300,
          child: AnimatedRowList(
            springy: springy,
            scrollToTopOn: query,
            isEmpty: names.isEmpty,
            empty: const Text('nothing matches'),
            children: [
              for (final n in names)
                SizedBox(key: ValueKey(n), height: 60, child: Text(n)),
            ],
          ),
        ));

    testWidgets('a filtered-out row folds away; the empty text waits for it',
        (tester) async {
      await tester.pumpWidget(list(['Macy\'s', 'Regal']));
      await tester.pumpAndSettle();

      // Search narrows to one: Regal is still there, on its way out.
      await tester.pumpWidget(list(['Macy\'s']));
      await tester.pump(kMotion ~/ 2);
      expect(find.text('Regal'), findsOneWidget);
      await tester.pumpAndSettle();
      expect(find.text('Regal'), findsNothing);

      // Nothing matches: the last row leaves before the message appears.
      await tester.pumpWidget(list([]));
      await tester.pump(kMotion ~/ 2);
      expect(find.text('Macy\'s'), findsOneWidget);
      expect(find.text('nothing matches'), findsNothing);
      await tester.pumpAndSettle();
      expect(find.text('Macy\'s'), findsNothing);
      expect(find.text('nothing matches'), findsOneWidget);
    });

    testWidgets(
        'searching removes every non-match, even rows never built '
        '(off screen), leaving no leftovers', (tester) async {
      // b0..b59; "college" rows: b2, b40, b55 (b40 and b55 start off screen).
      String name(int i) =>
          {2: 'college 2', 40: 'college 40', 55: 'college 55'}[i] ?? 'b$i';
      Widget search(String q) => _app(SizedBox(
            height: 300,
            child: AnimatedRowList(
              scrollToTopOn: q,
              children: [
                for (var i = 0; i < 60; i++)
                  if (name(i).contains(q))
                    SizedBox(key: ValueKey(i), height: 60, child: Text(name(i))),
              ],
            ),
          ));

      await tester.pumpWidget(search(''));
      await tester.pumpAndSettle();

      await tester.pumpWidget(search('college'));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(milliseconds: 500)); // exits over
      await tester.pumpAndSettle();
      final pos = tester.state<ScrollableState>(find.byType(Scrollable)).position;
      // Only the three matches, and nothing more to scroll to.
      expect(find.textContaining('college', skipOffstage: false),
          findsNWidgets(3));
      expect(find.textContaining(RegExp(r'^b\d'), skipOffstage: false),
          findsNothing);
      expect(pos.maxScrollExtent, 0);
      await tester.drag(find.byType(ListView), const Offset(0, -2000));
      await tester.pumpAndSettle();
      expect(find.textContaining(RegExp(r'^b\d'), skipOffstage: false),
          findsNothing);

      // Narrowed to one.
      await tester.pumpWidget(search('college 40'));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(find.textContaining('college', skipOffstage: false),
          findsOneWidget);
      expect(find.text('college 40'), findsOneWidget);
    });

    testWidgets('rows are built lazily, only once on screen', (tester) async {
      final built = <int>{};
      await tester.pumpWidget(_app(SizedBox(
        height: 300,
        child: AnimatedRowList(children: [
          for (var i = 0; i < 60; i++)
            Builder(
              key: ValueKey(i),
              builder: (_) {
                built.add(i);
                return SizedBox(height: 60, child: Text('$i'));
              },
            ),
        ]),
      )));
      await tester.pumpAndSettle();
      expect(built, contains(0));
      expect(built.length, lessThan(20)); // not all 60
    });

    testWidgets('springy: rows behind trail while scrolling, then settle',
        (tester) async {
      // Where the 60 px row [name] is painted.
      double topOf(String name) => tester.getTopLeft(find.byWidgetPredicate(
            (w) => w is SizedBox && w.key == ValueKey(name),
            skipOffstage: false,
          )).dy;

      await tester.pumpWidget(
          list([for (var i = 0; i < 20; i++) 'r$i'], springy: true));
      await tester.pumpAndSettle();

      // Dragging up (scrolling down): rows lower in the view trail behind,
      // so the gaps between them stretch.
      final finger =
          await tester.startGesture(tester.getCenter(find.byType(ListView)));
      for (var i = 0; i < 6; i++) {
        await finger.moveBy(const Offset(0, -30));
        await tester.pump(const Duration(milliseconds: 16));
      }
      expect(topOf('r4') - topOf('r3'), greaterThan(60.5));

      // Let go: once it stops, every row is back in its place, 60 px apart.
      await finger.up();
      await tester.pumpAndSettle();
      for (var i = 3; i < 7; i++) {
        expect(topOf('r${i + 1}') - topOf('r$i'), closeTo(60, 0.01),
            reason: 'r$i');
      }
    });

    testWidgets('scrolls back to the top when the search changes',
        (tester) async {
      final names = [for (var i = 0; i < 20; i++) 'r$i'];
      await tester.pumpWidget(list(names, query: ''));
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView), const Offset(0, -400));
      await tester.pumpAndSettle();
      final position =
          tester.state<ScrollableState>(find.byType(Scrollable)).position;
      expect(position.pixels, greaterThan(0));

      await tester.pumpWidget(list(names.take(10).toList(), query: 'r'));
      await tester.pumpAndSettle();
      expect(position.pixels, 0);
    });
  });

  group('wheel / touchpad glide', () {
    // The map's suggestion panel: a short, springy, divided list.
    Future<ScrollPosition> panel(WidgetTester tester) async {
      await tester.pumpWidget(_app(Column(children: [
        ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 295),
          child: AnimatedRowList(
            shrinkWrap: true,
            springy: true,
            divided: true,
            children: [
              for (var i = 0; i < 60; i++)
                SizedBox(key: ValueKey(i), height: 58, child: Text('b$i')),
            ],
          ),
        ),
      ])));
      await tester.pumpAndSettle();
      return tester.state<ScrollableState>(find.byType(Scrollable)).position;
    }

    TestPointer mouse(WidgetTester tester) => TestPointer(1, PointerDeviceKind.mouse)
      ..hover(tester.getCenter(find.byType(ListView)));

    testWidgets('a stream of small steps glides smoothly, no overshoot',
        (tester) async {
      final pos = await panel(tester);
      final p = mouse(tester);
      final seen = <double>[];
      for (var i = 0; i < 20; i++) {
        await tester.sendEventToBinding(p.scroll(const Offset(0, 15)));
        await tester.pump(const Duration(milliseconds: 16));
        seen.add(pos.pixels);
      }
      for (var i = 0; i < 30; i++) {
        await tester.pump(const Duration(milliseconds: 16));
        seen.add(pos.pixels);
      }
      // Only ever forward (no jolt back), never past what was scrolled.
      for (var i = 1; i < seen.length; i++) {
        expect(seen[i], greaterThanOrEqualTo(seen[i - 1] - 0.01));
      }
      expect(seen.reduce((a, b) => a > b ? a : b), lessThanOrEqualTo(300.01));
      await tester.pumpAndSettle();
      expect(pos.pixels, closeTo(300, 0.5));
    });

    testWidgets('flicking past the end stops at the end, not beyond',
        (tester) async {
      final pos = await panel(tester);
      final p = mouse(tester);
      for (var i = 0; i < 60; i++) {
        await tester.sendEventToBinding(p.scroll(const Offset(0, 200)));
        await tester.pump(const Duration(milliseconds: 16));
        expect(pos.pixels, lessThanOrEqualTo(pos.maxScrollExtent + 0.01));
      }
      await tester.pumpAndSettle();
      expect(pos.pixels, closeTo(pos.maxScrollExtent, 0.5));
    });

    testWidgets(
        'rows built as they scroll into view appear in place, full size '
        '(the list never changes length under the scroll)', (tester) async {
      await tester.pumpWidget(_app(Column(children: [
        ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 295),
          child: AnimatedRowList(
            shrinkWrap: true,
            divided: true,
            children: [
              for (var i = 0; i < 60; i++)
                Builder(
                  key: ValueKey(i),
                  builder: (_) => SizedBox(height: 58, child: Text('b$i')),
                ),
            ],
          ),
        ),
      ])));
      // Past the opening (that window runs on the real clock).
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 800)));
      await tester.pumpAndSettle();
      final pos = tester.state<ScrollableState>(find.byType(Scrollable)).position;
      final length = pos.maxScrollExtent;

      // Every row on screen is a full 59 px (58 + divider) from the next.
      void checkRigid() {
        final shown = [
          for (var i = 0; i < 60; i++)
            if (find.text('b$i').evaluate().isNotEmpty) i,
        ];
        for (var k = 1; k < shown.length; k++) {
          final a = tester.getTopLeft(find.text('b${shown[k - 1]}')).dy;
          final b = tester.getTopLeft(find.text('b${shown[k]}')).dy;
          expect(b - a, closeTo(59.0 * (shown[k] - shown[k - 1]), 0.01));
        }
      }

      // Down through the list, frame by frame, building rows as they appear.
      final finger =
          await tester.startGesture(tester.getCenter(find.byType(ListView)));
      for (var i = 0; i < 60; i++) {
        await finger.moveBy(const Offset(0, -20));
        await tester.pump(const Duration(milliseconds: 16));
        expect(pos.maxScrollExtent, closeTo(length, 0.01));
        checkRigid();
      }
      // And back up, rebuilding the rows that went off the top.
      for (var i = 0; i < 60; i++) {
        await finger.moveBy(const Offset(0, 20));
        await tester.pump(const Duration(milliseconds: 16));
        expect(pos.maxScrollExtent, closeTo(length, 0.01));
        checkRigid();
      }
      await finger.up();
      await tester.pumpAndSettle();
    });

    testWidgets('down, then up mid-glide, lands exactly; rows stay rigid',
        (tester) async {
      final pos = await panel(tester);
      final p = mouse(tester);
      await tester.sendEventToBinding(p.scroll(const Offset(0, 300)));
      await tester.pump(const Duration(milliseconds: 50));
      await tester.sendEventToBinding(p.scroll(const Offset(0, -100)));
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 16));
        // Mid-glide the rows keep their spacing (58 + 1 px divider).
        final a = tester.getTopLeft(find.text('b5', skipOffstage: false)).dy;
        final b = tester.getTopLeft(find.text('b6', skipOffstage: false)).dy;
        expect(b - a, closeTo(59, 0.01));
      }
      await tester.pumpAndSettle();
      expect(pos.pixels, closeTo(200, 0.5));
    });
  });

  testWidgets('a mouse-wheel notch glides instead of jumping', (tester) async {
    await tester.pumpWidget(_app(SmoothScroll(
      child: ListView(
        children: [for (var i = 0; i < 50; i++) SizedBox(height: 60, child: Text('$i'))],
      ),
    )));
    final position =
        tester.state<ScrollableState>(find.byType(Scrollable)).position;

    final pointer = TestPointer(1, PointerDeviceKind.mouse);
    pointer.hover(tester.getCenter(find.byType(ListView)));
    await tester.sendEventToBinding(pointer.scroll(const Offset(0, 120)));
    await tester.pump(); // the wheel event lands
    await tester.pump(const Duration(milliseconds: 60));
    // On its way, not there in one frame.
    expect(position.pixels, greaterThan(0));
    expect(position.pixels, lessThan(120));

    // A second notch mid-glide adds on from where the first was headed.
    await tester.sendEventToBinding(pointer.scroll(const Offset(0, 120)));
    await tester.pumpAndSettle();
    expect(position.pixels, closeTo(240, 0.5));
  });
}
