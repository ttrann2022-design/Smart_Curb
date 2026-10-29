// The test report's run (dart run tool/test_report.dart): what the app
// actually does, grouped by area. The other test files (`flutter test`)
// also check the details behind these during development.
//
// Plain run:  flutter test test/all_tests.dart
// (Named without "_test" so `flutter test` doesn't run things twice.)
import 'package:flutter_test/flutter_test.dart';

import 'assistant_chat_ui_test.dart' as chat_screen;
import 'astar_benchmark_test.dart' as astar_bench;
import 'functional_test.dart' as functional;
import 'online_health_test.dart' as online;
import 'performance_test.dart' as performance;

void main() {
  // Saving data, reading data, guiding the user, algorithm efficiency and
  // the AI assistant (each is a top-level group there).
  functional.main();
  // The teammate's crowd-weighted A* model on the real map.
  group('Algorithm efficiency', astar_bench.main);
  // Speed, memory, capacity and time complexity against the standards.
  group('App optimization', performance.main);
  // The chat screen itself: typing, Enter, forms.
  group('AI assistant', chat_screen.main);
  // Last, since it opens the network for its own checks. Skipped with
  // --dart-define=OFFLINE=true (what the report's --offline passes).
  if (!const bool.fromEnvironment('OFFLINE')) {
    group('Online services', online.main);
  }
}
