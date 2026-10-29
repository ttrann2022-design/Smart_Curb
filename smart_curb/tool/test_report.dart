// Runs every Smart Curb test (test/all_tests.dart) and prints a report:
// a panel per area (what it covers, every test with its time, and how
// efficient that part of the app is), then a summary table.
//
//   dart run tool/test_report.dart             everything
//   dart run tool/test_report.dart --offline   skip the internet checks
//   dart run tool/test_report.dart --summary   only the summary table
//
// Exit code 0 when everything passes, 1 otherwise (handy for CI).
import 'dart:convert';
import 'dart:io';

final bool _color = stdout.supportsAnsiEscapes;
String _c(String code, String s) => _color ? '\x1B[${code}m$s\x1B[0m' : s;
String _bold(String s) => _c('1', s);
String _dim(String s) => _c('2', s);
String _green(String s) => _c('32', s);
String _red(String s) => _c('31', s);
String _yellow(String s) => _c('33', s);
String _cyan(String s) => _c('36', s);
String _lime(String s) => _c('38;5;154', s); // the app's accent green

/// Panel width, inside the 2-space margin.
const _w = 76;
const _inner = _w - 4; // between "│ " and " │"

/// What each area covers.
const _about = {
  'Saving data to the database': 'Cars, contact info and places are saved '
      'with exactly the fields the app\'s screens read back; invalid data is '
      'rejected; changes and deletes touch only what they should.',
  'Reading data from the database': 'Live curb data turns into the right '
      'lot counts and curb status; saved cars, places and contact info come '
      'back correctly; missing or broken data never crashes the app.',
  'Guiding the user': 'The right lot or curb is recommended, full spots are '
      'skipped, every building gets a reachable lot, walking paths and curb '
      'approaches lead to the right place, search finds the right building, '
      'and GPS jitter is smoothed.',
  'Algorithm efficiency': 'A* speed for every building, and the teammate\'s '
      'crowd-weighted A* model (run_parking_test.py / test_benchmarker.py) on '
      'the real FAU and Broward maps: busy-day routes, plain vs weighted A*, '
      'the 5 edge cases, and agreement with the app\'s own paths.',
  'App optimization': 'Speed, memory, capacity and time complexity against '
      'Google RAIL, Android vitals and ISO/IEC 25010.',
  'AI assistant': 'Understands everyday requests with the app\'s real data, '
      'is honest about what it can\'t do, always gives the safety answer, '
      'uses Gemini with a silent fallback, keeps personal details private, '
      'and the chat screen works with Enter and forms.',
  'Online services': 'Firebase, OSRM road routing and Gemini answer for real.',
  'Python A* edge cases': 'The original test_benchmarker.py (cross-check).',
  'Python A* benchmark': 'The original run_parking_test.py (cross-check).',
};

class _Test {
  _Test(this.name, this.status, this.ms, [this.group = '']);
  final String name;

  /// Its sub-group within the area ("places data"), shown as a heading.
  final String group;
  final String status; // pass, fail, skip
  final int ms;
}

class _Section {
  _Section(this.name);
  final String name;
  int passed = 0, failed = 0, skipped = 0;
  int startMs = -1, endMs = 0;
  final List<_Test> tests = [];
  /// What its tests printed, with the test that printed it (-1: none).
  final List<({String msg, int test})> notes = [];

  /// Measured checks: [area, what, value, budget, unit, standard] after
  /// "PERF" (see test/performance_test.dart's perf()).
  final List<List<String>> perf = [];
  int get count => passed + failed + skipped;
  double get seconds => ((endMs - startMs).clamp(0, 1 << 30)) / 1000;
}

class _Failure {
  _Failure(this.section, this.name);
  final String section, name;
  final List<String> errors = [];
}

/// One checked line: PASS or FAIL (or HEAD, a heading).
typedef _Eff = ({String grade, String text});

Future<void> main(List<String> args) async {
  final offline = args.contains('--offline');
  final summaryOnly = args.contains('--summary');
  final started = DateTime.now();

  _banner(started, offline);

  final process = await Process.start(
    'flutter',
    [
      'test',
      'test/all_tests.dart',
      '--reporter',
      'json',
      if (offline) '--dart-define=OFFLINE=true',
    ],
    runInShell: true,
  );

  final groups = <int, ({String name, int? parent})>{};
  final tests = <int, ({String name, String section, String leaf, int start})>{};
  final sections = <String, _Section>{};
  final failures = <int, _Failure>{};
  final statusOf = <int, String>{}; // test id -> pass / fail / skip
  var total = 0, done = 0;
  var success = false;
  final stderrLines = <String>[];

  String sectionOf(List groupIds) {
    // The top-level group under the file's root group is the area.
    for (final id in groupIds) {
      final g = groups[id];
      if (g != null && g.name.isNotEmpty && groups[g.parent]?.name.isEmpty != false) {
        return g.name;
      }
    }
    return 'Other';
  }

  process.stderr.transform(utf8.decoder).transform(const LineSplitter()).listen(stderrLines.add);

  await for (final line
      in process.stdout.transform(utf8.decoder).transform(const LineSplitter())) {
    if (!line.startsWith('{')) continue;
    final Map<String, dynamic> e;
    try {
      e = jsonDecode(line) as Map<String, dynamic>;
    } on FormatException {
      continue;
    }
    switch (e['type']) {
      case 'group':
        final g = e['group'] as Map<String, dynamic>;
        groups[g['id'] as int] = (name: g['name'] as String? ?? '', parent: g['parentID'] as int?);
        if (g['parentID'] == null) total += (g['testCount'] as int? ?? 0);
      case 'testStart':
        final t = e['test'] as Map<String, dynamic>;
        final name = t['name'] as String;
        final ids = (t['groupIDs'] as List?) ?? const [];
        final section = sectionOf(ids);
        // The innermost group's full name ("<area> places data").
        final leaf = ids.isEmpty ? '' : groups[ids.last]?.name ?? '';
        tests[t['id'] as int] =
            (name: name, section: section, leaf: leaf, start: e['time'] as int);
        // (Not the runner's own steps: "loading ...", "(setUpAll)".)
        if (name.startsWith('loading ') || name.startsWith('(')) break;
        final s = sections.putIfAbsent(section, () => _Section(section));
        if (s.startMs < 0) s.startMs = e['time'] as int;
      case 'print':
        final msg = (e['message'] as String).trim();
        final t = tests[e['testID']];
        if (msg.startsWith('PERF|') && t != null) {
          // A measured check, in the area of the test that measured it.
          sections.putIfAbsent(t.section, () => _Section(t.section)).perf.add(msg.split('|'));
        } else if (msg.isNotEmpty && t != null && !msg.startsWith('[')) {
          sections
              .putIfAbsent(t.section, () => _Section(t.section))
              .notes
              .add((msg: msg, test: e['testID'] as int));
        }
      case 'error':
        final t = tests[e['testID'] as int];
        if (t == null) break;
        failures
            .putIfAbsent(e['testID'] as int, () => _Failure(t.section, t.name))
            .errors
            .add((e['error'] as String).trim());
      case 'testDone':
        if (e['hidden'] == true) break;
        final t = tests[e['testID'] as int];
        if (t == null) break;
        final s = sections.putIfAbsent(t.section, () => _Section(t.section));
        s.endMs = e['time'] as int;
        // "<area> <sub-group> <test>": the sub-group becomes a heading.
        final sub = t.leaf.startsWith('${t.section} ')
            ? t.leaf.substring(t.section.length + 1)
            : '';
        final prefix = sub.isEmpty ? '${t.section} ' : '${t.leaf} ';
        final short =
            t.name.startsWith(prefix) ? t.name.substring(prefix.length) : t.name;
        final ms = (e['time'] as int) - t.start;
        final status = e['skipped'] == true
            ? 'skip'
            : (e['result'] == 'success' ? 'pass' : 'fail');
        switch (status) {
          case 'skip':
            s.skipped++;
          case 'pass':
            s.passed++;
          default:
            s.failed++;
        }
        s.tests.add(_Test(short, status, ms, sub));
        statusOf[e['testID'] as int] = status;
        done++;
        if (_color) {
          stdout.write('\r  ${_cyan('Running')}  ${_bar(done, total)}  '
              '${_dim('$done/$total')}   ');
        }
      case 'done':
        success = e['success'] == true;
    }
  }
  final exitCode = await process.exitCode;
  if (_color) stdout.write('\r${' ' * (_w + 4)}\r');

  // The original Python files, as a cross-check when Python is installed.
  await _runPython(sections, failures);

  // ---- a panel per area: its tests, then each check, passed or failed ----
  final effs = {
    for (final s in sections.values)
      s.name: _checks(
          s, s.perf, statusOf),
  };
  if (!summaryOnly) {
    var n = 0;
    for (final s in sections.values) {
      _areaPanel(++n, s, effs[s.name]!);
    }
  }

  // ---- failures in detail ----
  if (failures.isNotEmpty) {
    _panelTop(_red('FAILURES'), '', _red);
    for (final f in failures.values) {
      _row('${_red('✘')} ${_bold(_fit(f.name, _inner - 2))}', _red);
      for (final err in f.errors) {
        for (final l in err.split('\n').take(6)) {
          _row('   ${_dim(_fit(l, _inner - 3))}', _red);
        }
      }
    }
    _panelBottom('', _red);
  }
  if (sections.isEmpty && stderrLines.isNotEmpty) {
    stdout.writeln(_red('  The tests could not start:'));
    for (final l in stderrLines.take(20)) {
      stdout.writeln('    $l');
    }
  }

  // ---- summary ----
  final passed = sections.values.fold(0, (a, s) => a + s.passed);
  final failed = sections.values.fold(0, (a, s) => a + s.failed);
  final skipped = sections.values.fold(0, (a, s) => a + s.skipped);
  _summary(sections.values.toList(), effs);

  final checks = effs.values.expand((l) => l).where((e) => e.grade != 'HEAD');
  final checksFailed = checks.where((e) => e.grade == 'FAIL').length;
  final areasFailed = sections.values
      .where((s) => s.failed > 0 || effs[s.name]!.any((e) => e.grade == 'FAIL'))
      .length;
  final allGood = success &&
      exitCode == 0 &&
      failed == 0 &&
      checksFailed == 0 &&
      sections.isNotEmpty;
  final took = DateTime.now().difference(started).inMilliseconds / 1000;
  stdout.writeln();
  final headline = allGood
      ? '✔  ALL ${sections.length} AREAS PASSED'
      : '✘  $areasFailed OF ${sections.length} AREAS FAILED';
  _box([
    allGood ? _bold(_green(headline)) : _bold(_red(headline)),
    _dim('Tests: $passed passed · $failed failed'
        '${skipped > 0 ? ' · $skipped skipped' : ''}   '
        'Checks: ${checks.length - checksFailed} passed · $checksFailed failed'),
    _dim('${took.toStringAsFixed(1)}s${offline ? ' · offline' : ''}'),
  ], allGood ? _green : _red);
  stdout.writeln();
  exit(allGood ? 0 : 1);
}

// ---- panels ----

void _areaPanel(int n, _Section s, List<_Eff> checks) {
  final ok = s.failed == 0 && !checks.any((e) => e.grade == 'FAIL');
  final paint = ok ? _lime : _red;
  final score = '${s.passed}/${s.count}${s.skipped > 0 ? ' · ${s.skipped} skipped' : ''}';
  _panelTop(_bold('${n.toString().padLeft(2, '0')}  ${s.name}'),
      ok ? _green('PASSED ✔') : _red('FAILED ✘'), paint);

  if (_about[s.name] case final about?) {
    for (final l in _wrap(about, _inner)) {
      _row(_dim(l), paint);
    }
    _row('', paint);
  }

  _row('${_bold('TESTS  $score')}${' ' * (_inner - 11 - _vis(score))}${_bold('TIME')}', paint);
  String? group;
  for (final t in s.tests) {
    if (t.group.isNotEmpty && t.group != group) {
      group = t.group;
      _row(_cyan('▸ ${_fit(group, _inner - 2)}'), paint);
    }
    final mark = switch (t.status) {
      'pass' => _green('✔ PASS'),
      'skip' => _yellow('○ SKIP'),
      _ => _red('✘ FAIL'),
    };
    final time = _ms(t.ms);
    // The whole statement, wrapped (time on its first line).
    final lines = _wrap(t.name, _inner - 15);
    final pad = _inner - 7 - _vis(lines.first) - _vis(time);
    String paintName(String l) => t.status == 'fail' ? _red(l) : l;
    _row('$mark ${paintName(lines.first)}${' ' * pad}${_dim(time)}', paint);
    for (final l in lines.skip(1)) {
      _row('       ${paintName(l)}', paint);
    }
  }

  if (checks.isNotEmpty) {
    _row('', paint);
    _row(_bold('CHECKS  ${checks.where((e) => e.grade == 'PASS').length}/'
        '${checks.where((e) => e.grade != 'HEAD').length}'), paint);
    for (final e in checks) {
      if (e.grade == 'HEAD') {
        _row(_cyan('▸ ${e.text}'), paint);
        continue;
      }
      final tag = e.grade == 'PASS' ? _green('✔ PASS') : _red('✘ FAIL');
      final lines = _wrap(e.text, _inner - 7);
      for (var i = 0; i < lines.length; i++) {
        _row('${i == 0 ? tag : ' ' * 6} ${lines[i]}', paint);
      }
    }
  }
  _panelBottom(_dim('${s.seconds.toStringAsFixed(1)}s'), paint);
}

void _summary(List<_Section> sections, Map<String, List<_Eff>> checks) {
  _panelTop(_bold('SUMMARY'), '', _cyan);
  _row('${_bold('#   AREA'.padRight(36))}${_bold('TESTS'.padLeft(7))}'
      '${_bold('CHECKS'.padLeft(8))}${_bold('TIME'.padLeft(7))}   ${_bold('RESULT')}', _cyan);
  var n = 0;
  for (final s in sections) {
    final c = checks[s.name]!.where((e) => e.grade != 'HEAD');
    final cFailed = c.where((e) => e.grade == 'FAIL').length;
    final ok = s.failed == 0 && cFailed == 0;
    final name = _fit(s.name, 31);
    final tests = '${s.passed}/${s.count}'.padLeft(7);
    final cs = (c.isEmpty ? '–' : '${c.length - cFailed}/${c.length}').padLeft(8);
    _row('${_dim((++n).toString().padLeft(2, '0'))}  '
        '${ok ? name : _red(name)}${' ' * (32 - _vis(name))}'
        '${s.failed == 0 ? _green(tests) : _red(tests)}'
        '${cFailed == 0 ? _green(cs) : _red(cs)}'
        '${_dim('${s.seconds.toStringAsFixed(1)}s'.padLeft(7))}   '
        '${ok ? _green('✔ PASSED') : _red('✘ FAILED')}', _cyan);
  }
  _row('', _cyan);
  _row(_dim('TESTS: tests passed / run. CHECKS: measured results within their'), _cyan);
  _row(_dim('budgets (speed, time complexity, live services) passed / made.'), _cyan);
  _row(_dim('An area PASSES only when every test and every check passes.'), _cyan);
  _panelBottom('', _cyan);
}

void _panelTop(String title, String right, String Function(String) paint) {
  final fill = _w - 5 - _vis(title) - (right.isEmpty ? 0 : _vis(right) + 2);
  stdout.writeln();
  stdout.writeln('  ${paint('╭─ ')}$title ${paint('─' * fill.clamp(1, _w))}'
      '${right.isEmpty ? '' : ' $right '}${paint('╮')}');
}

void _panelBottom(String right, String Function(String) paint) {
  final fill = _w - 2 - (right.isEmpty ? 0 : _vis(right) + 3);
  stdout.writeln('  ${paint('╰${'─' * fill}')}'
      '${right.isEmpty ? '' : ' $right ${paint('─')}'}${paint('╯')}');
}

void _row(String content, String Function(String) paint) {
  final pad = (_inner - _vis(content)).clamp(0, _w);
  stdout.writeln('  ${paint('│')} $content${' ' * pad} ${paint('│')}');
}

/// Lines centered in a rounded box drawn in [paint].
void _box(List<String> lines, String Function(String) paint) {
  final inner = _w - 2;
  stdout.writeln('  ${paint('╭${'─' * inner}╮')}');
  for (final l in lines) {
    final visible = _vis(l);
    final left = ((inner - visible) / 2).floor().clamp(0, inner);
    final right = (inner - visible - left).clamp(0, inner);
    stdout.writeln('  ${paint('│')}${' ' * left}$l${' ' * right}${paint('│')}');
  }
  stdout.writeln('  ${paint('╰${'─' * inner}╯')}');
}

void _banner(DateTime at, bool offline) {
  final date = '${at.year}-${_two(at.month)}-${_two(at.day)} '
      '${_two(at.hour)}:${_two(at.minute)}';
  stdout.writeln();
  _box([
    _bold(_lime('S M A R T   C U R B')),
    _bold('Full Test Report'),
    _dim('Every test and every check: passed or failed'),
    _dim('$date${offline ? '  ·  offline mode' : ''}'),
  ], _lime);
  stdout.writeln();
}

// ---- checks, per area ----

/// Every measured result an area's tests printed, as PASS or FAIL: A*
/// timings against their budgets, benchmark routes, the performance and
/// time-complexity budgets, and the rest by whether its test passed.
List<_Eff> _checks(_Section s, List<List<String>> perf, Map<int, String> statusOf) {
  final out = <_Eff>[];
  for (final n in s.notes) {
    final testOk = n.test < 0 ? s.failed == 0 : statusOf[n.test] == 'pass';
    String verdict(bool withinBudget) => testOk && withinBudget ? 'PASS' : 'FAIL';
    final m = n.msg;
    final app = RegExp(r'^(.+?): (\d+) buildings in (\d+) ms \(slowest (\d+) ms\)').firstMatch(m);
    final routes = RegExp(r'(\d+) routes in (\d+) ms').firstMatch(m);
    final bench = RegExp(r'A\* benchmark: (\S+)\s+w=([\d.]+)\s+(\S+)\s+cost (\S+)\s+(\d+) nodes\s+([\d.]+) ms')
        .firstMatch(m);
    if (app != null) {
      final slowest = double.parse(app.group(4)!);
      final avg = int.parse(app.group(3)!) / int.parse(app.group(2)!);
      out.add((
        grade: verdict(slowest <= 100),
        text: 'A* best spot, ${app.group(1)}: ${avg.toStringAsFixed(1)} ms per '
            'building, slowest ${app.group(4)} ms (budget 100 ms, RAIL)',
      ));
    } else if (routes != null) {
      final per = int.parse(routes.group(2)!) / int.parse(routes.group(1)!);
      out.add((
        grade: verdict(per <= 5),
        text: 'A* routes: ${per.toStringAsFixed(2)} ms per route over '
            '${routes.group(1)} routes (budget 5 ms)',
      ));
    } else if (bench != null) {
      final found = bench.group(3) == 'SUCCESS';
      final ms = double.parse(bench.group(6)!);
      out.add((
        grade: verdict(ms <= 50),
        text: found
            ? '${bench.group(1)}, w=${bench.group(2)}: ${bench.group(5)} nodes, '
                'cost ${bench.group(4)} m, $ms ms (budget 50 ms)'
            : '${bench.group(1)}, w=${bench.group(2)}: lot full, no path, as '
                'expected (${bench.group(5)} nodes, $ms ms)',
      ));
    } else {
      out.add((grade: verdict(true), text: m.replaceAll(RegExp(r'\s+'), ' ')));
    }
  }
  String? area;
  for (final r in perf) {
    if (r.length < 7) continue;
    final value = double.tryParse(r[3]) ?? 0;
    final budget = double.tryParse(r[4]) ?? 0;
    final unit = r[5].isEmpty ? '' : ' ${r[5]}';
    if (r[1] != area) {
      area = r[1];
      out.add((grade: 'HEAD', text: area));
    }
    out.add((
      grade: value <= budget ? 'PASS' : 'FAIL',
      text: '${r[2]}: ${r[3]}$unit (budget ${r[4]}$unit) · ${r[6]}',
    ));
  }
  return out;
}

// ---- Python (cross-check, only when installed) ----

/// A working Python 3 ("python" on Windows can be just a Store shortcut).
Future<String?> _findPython() async {
  for (final cmd in ['python', 'python3', 'py']) {
    try {
      final r = await Process.run(cmd, ['--version'], runInShell: true);
      if (r.exitCode == 0 && '${r.stdout}${r.stderr}'.trim().startsWith('Python 3')) {
        return cmd;
      }
    } catch (_) {
      // not this one
    }
  }
  return null;
}

/// Runs the original Python edge-case tests and benchmark from the repo
/// root. Without Python nothing is missing: the same checks run in Dart
/// (test/astar_benchmark_test.dart).
Future<void> _runPython(Map<String, _Section> sections, Map<int, _Failure> failures) async {
  final root = Directory.current.parent.path;
  final hasTests = File('$root/test_benchmarker.py').existsSync();
  final hasBench = File('$root/run_parking_test.py').existsSync();
  if (!hasTests && !hasBench) return;
  final python = await _findPython();
  if (python == null) return;

  if (hasTests) {
    final s = sections['Python A* edge cases'] = _Section('Python A* edge cases');
    final sw = Stopwatch()..start();
    final r = await Process.run(python, ['-m', 'unittest', '-v', 'test_benchmarker'],
        workingDirectory: root, runInShell: true);
    s.startMs = 0;
    s.endMs = sw.elapsedMilliseconds;
    // unittest -v writes "<docstring or test id> ... ok|FAIL|ERROR".
    // (Windows ends lines with \r\n.)
    final out = '${r.stdout}\n${r.stderr}'.replaceAll('\r', '');
    for (final m in RegExp(r'^(.+?) \.\.\. (ok|FAIL|ERROR|skipped.*)$', multiLine: true)
        .allMatches(out)) {
      final name = m.group(1)!.trim();
      final res = m.group(2)!;
      if (res == 'ok') {
        s.passed++;
        s.tests.add(_Test(name, 'pass', 0));
      } else if (res.startsWith('skipped')) {
        s.skipped++;
        s.tests.add(_Test(name, 'skip', 0));
      } else {
        s.failed++;
        s.tests.add(_Test(name, 'fail', 0));
        failures[-failures.length - 1] = _Failure(s.name, name)..errors.add(res);
      }
    }
    if (s.count == 0) {
      s.failed++;
      s.tests.add(_Test('test_benchmarker.py', 'fail', 0));
      failures[-failures.length - 1] = _Failure(s.name, 'test_benchmarker.py')
        ..errors.add(out.trim().split('\n').take(8).join('\n'));
    }
  }

  if (hasBench) {
    final s = sections['Python A* benchmark'] = _Section('Python A* benchmark');
    final sw = Stopwatch()..start();
    final r = await Process.run(python, ['run_parking_test.py'],
        workingDirectory: root, runInShell: true);
    s.startMs = 0;
    s.endMs = sw.elapsedMilliseconds;
    final out = '${r.stdout}'.replaceAll('\r', '');
    String? target;
    for (final line in out.split('\n')) {
      final t = RegExp(r'TARGET DESTINATION: (\S+)').firstMatch(line);
      if (t != null) target = t.group(1);
      final w = RegExp(r'Weight:\s*([\d.]+)\s*\|\s*Status:\s*(\S+)\s*\|\s*Cost:\s*(\S+)'
              r'\s*\|\s*Nodes Exp:\s*(\d+)\s*\|\s*Time:\s*([\d.]+) ms')
          .firstMatch(line);
      if (w != null) {
        s.notes.add((
          msg: 'A* benchmark: $target  w=${w.group(1)}  ${w.group(2)}  '
              'cost ${w.group(3)}  ${w.group(4)} nodes  ${w.group(5)} ms',
          test: -1,
        ));
      }
    }
    if (r.exitCode == 0 && out.contains('Weight:')) {
      s.passed++;
      s.tests.add(_Test('8-hub crowd-weighted benchmark ran', 'pass', s.endMs));
    } else {
      s.failed++;
      s.tests.add(_Test('run_parking_test.py', 'fail', s.endMs));
      failures[-failures.length - 1] = _Failure(s.name, 'run_parking_test.py')
        ..errors.add('${r.stderr}'.trim().split('\n').take(8).join('\n'));
    }
  }
}

// ---- small helpers ----

String _strip(String s) => s.replaceAll(RegExp(r'\x1B\[[0-9;]*m'), '');
int _vis(String s) => _strip(s).runes.length;

/// [s] cut to [n] characters (plain text).
String _fit(String s, int n) =>
    s.runes.length <= n ? s : '${String.fromCharCodes(s.runes.take(n - 1))}…';

/// Word-wrapped to [n] characters a line.
List<String> _wrap(String s, int n) {
  final lines = <String>[];
  var cur = '';
  for (final word in s.split(' ')) {
    if (_vis(cur) + _vis(word) + (cur.isEmpty ? 0 : 1) > n && cur.isNotEmpty) {
      lines.add(cur);
      cur = word;
    } else {
      cur = cur.isEmpty ? word : '$cur $word';
    }
  }
  if (cur.isNotEmpty) lines.add(cur);
  return [for (final l in lines) _vis(l) > n ? _fit(_strip(l), n) : l];
}

String _ms(int ms) => ms < 1000 ? '$ms ms' : '${(ms / 1000).toStringAsFixed(1)} s';

String _bar(int done, int total) {
  const width = 28;
  final filled = total == 0 ? 0 : (done * width / total).round().clamp(0, width);
  return _lime('█' * filled) + _dim('░' * (width - filled));
}

String _two(int n) => n.toString().padLeft(2, '0');
