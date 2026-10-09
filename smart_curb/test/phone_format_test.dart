import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_curb/main.dart';

TextEditingValue _type(String before, String after, int cursor) =>
    PhoneInputFormatter().formatEditUpdate(
      TextEditingValue(text: before),
      TextEditingValue(
        text: after,
        selection: TextSelection.collapsed(offset: cursor),
      ),
    );

void main() {
  test('formatPhone', () {
    expect(formatPhone('9717076920'), '971-707-6920');
    expect(formatPhone('971-707-6920'), '971-707-6920');
    expect(formatPhone('(971) 707 6920'), '971-707-6920');
    expect(formatPhone('97170'), '971-70');
    expect(formatPhone('971'), '971');
    expect(formatPhone(''), '');
    expect(formatPhone('+44 20 7946 0958'), '+44 20 7946 0958');
  });

  test('typing adds dashes and keeps cursor after the typed digit', () {
    final v = _type('971', '9717', 4);
    expect(v.text, '971-7');
    expect(v.selection.end, 5);
  });

  test('caps at 10 digits', () {
    expect(_type('971-707-6920', '971-707-69201', 13).text, '971-707-6920');
  });

  test('backspace over a dash removes the digit before it', () {
    // "971-7" -> user deletes the "7" -> "971-"
    final v = _type('971-7', '971-', 4);
    expect(v.text, '971');
    expect(v.selection.end, 3);
  });

  test('editing in the middle keeps the cursor in place', () {
    // insert "5" after "971-7" inside "971-707-6920"
    final v = _type('971-707-6920', '971-7507-6920', 6);
    expect(v.text, '971-750-7692');
    expect(v.selection.end, 6);
  });
}
