// Text formatting: distances and phone numbers.
part of '../main.dart';

/// "850 m" / "1.4 km"
String formatDistance(double meters) {
  if (meters < 1000) return '${meters.round()} m';
  return '${(meters / 1000).toStringAsFixed(1)} km';
}

/// Formats a US phone number as xxx-xxx-xxxx. Partial numbers are formatted
/// as far as they go ("97170" -> "971-70"). Anything that isn't 1–10 digits
/// (e.g. an international number) is returned unchanged.
String formatPhone(String input) {
  final digits = input.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty || digits.length > 10) return input.trim();
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) {
    return '${digits.substring(0, 3)}-${digits.substring(3)}';
  }
  return '${digits.substring(0, 3)}-${digits.substring(3, 6)}-'
      '${digits.substring(6)}';
}

/// Live phone formatting while typing: digits only, at most 10, dashes added
/// automatically, and the cursor stays next to the digit you just typed.
class PhoneInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final capped = digits.length > 10 ? digits.substring(0, 10) : digits;
    final text = formatPhone(capped);

    // Where the cursor should land: after the same number of digits.
    final cursor = newValue.selection.end.clamp(0, newValue.text.length);
    final digitsBefore = newValue.text
        .substring(0, cursor)
        .replaceAll(RegExp(r'\D'), '')
        .length
        .clamp(0, capped.length);
    var offset = 0;
    var seen = 0;
    while (offset < text.length && seen < digitsBefore) {
      if (RegExp(r'\d').hasMatch(text[offset])) seen++;
      offset++;
    }
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: offset),
    );
  }
}
