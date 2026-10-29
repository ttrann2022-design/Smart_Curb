import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:smart_curb/assistant.dart';
import 'package:smart_curb/gemini_chat.dart';

import 'assistant_test.dart' show FakeData;

/// The screen's behaviour, without the language model (tests have no network).
GeminiChat get noAi => GeminiChat(apiKey: '');

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  Future<void> say(WidgetTester tester, String text) async {
    await tester.enterText(find.byType(TextField).last, text);
    await tester.testTextInput.receiveAction(TextInputAction.send);
    await tester.pump();
    await tester.pump(const Duration(seconds: 11)); // the "typing" wait
    await tester.pump(const Duration(seconds: 1));
  }

  testWidgets('keeps the focus after Enter, and answers messages in order',
      (tester) async {
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final session = ChatSession(data: FakeData(), ai: noAi);
    await tester.pumpWidget(
        MaterialApp(home: AssistantChatPage(session: session)));
    await tester.pump(const Duration(seconds: 11)); // the greeting
    await tester.pump(const Duration(seconds: 1));

    final box = find.byType(TextField).last;
    await tester.tap(box);
    await tester.pump();
    await tester.enterText(box, 'hi');
    await tester.testTextInput.receiveAction(TextInputAction.send);
    await tester.pump();
    // Still in the box: the next message can be typed straight away...
    expect(tester.widget<TextField>(box).focusNode!.hasFocus, isTrue);
    // ...and sent while the assistant is still "typing".
    await tester.enterText(box, 'thanks');
    await tester.testTextInput.receiveAction(TextInputAction.send);
    await tester.pump();
    expect(find.text('thanks'), findsOneWidget);
    expect(tester.widget<TextField>(box).focusNode!.hasFocus, isTrue);

    await tester.pump(const Duration(seconds: 11));
    await tester.pump(const Duration(seconds: 11));
    await tester.pump(const Duration(seconds: 1));
    final bot = [
      for (final m in session.messages)
        if (!m.fromUser) m.text,
    ];
    expect(bot, hasLength(3)); // greeting, hi, thanks
    expect(bot[1], startsWith('Hi!'));
    expect(bot[2], contains('welcome'));
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('add a car through the form in the chat, sent with Enter',
      (tester) async {
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final data = FakeData();
    final session = ChatSession(data: data, ai: noAi);
    await tester.pumpWidget(
        MaterialApp(home: AssistantChatPage(session: session)));
    await tester.pump(const Duration(seconds: 11)); // the greeting
    await tester.pump(const Duration(seconds: 1));

    await say(tester, 'can you help me add another car?');
    expect(find.text('Add vehicle'), findsOneWidget);

    // Missing the required fields: says so, saves nothing.
    await tester.tap(find.text('Add vehicle'));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Please fill in your model.'), findsOneWidget);
    expect(data.cars, isEmpty);

    // The form's fields (the chat's own input box is the last TextField).
    final fields = find.descendant(
      of: find.byWidgetPredicate(
          (w) => w.runtimeType.toString() == '_ChatFormView'),
      matching: find.byType(TextField),
    );
    expect(fields, findsNWidgets(5));
    await tester.enterText(fields.at(0), 'Toyota');
    await tester.enterText(fields.at(1), 'RAV 4');
    await tester.enterText(fields.at(2), 'S108123');
    await tester.enterText(fields.at(3), '2024');
    await tester.enterText(fields.at(4), 'Silver');
    // Enter in the last field sends it.
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();
    expect(find.text('Toyota · RAV 4 · S108123 · 2024 · Silver'), findsOneWidget);
    await tester.pump(const Duration(seconds: 11));
    await tester.pump(const Duration(seconds: 1));

    expect(data.cars.single['plate'], 'S108123');
    expect(find.textContaining('Done! I added your Toyota RAV 4'), findsOneWidget);
    expect(find.text('Add vehicle'), findsNothing); // the form is gone
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}
