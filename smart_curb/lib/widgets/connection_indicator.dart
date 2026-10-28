// Connection quality monitor and its indicator.
part of '../main.dart';

// ==========================================
// CONNECTION QUALITY
// ==========================================

enum NetQuality { checking, good, unstable, bad, offline }

/// Watches the connection to the parking database and grades it.
///
/// Two signals: Firebase's own `.info/connected` flag (reacts the moment the
/// socket drops or comes back) and a tiny timed request every few seconds.
/// The last [_window] requests decide the grade:
///  * good     – median under 300 ms, nothing failed
///  * unstable – median 300–1000 ms, or one request failed
///  * bad      – median over 1000 ms, or two or more failed
///  * offline  – Firebase reports no connection, or every request failed
class ConnectionMonitor extends ChangeNotifier {
  static const Duration _interval = Duration(seconds: 5);
  static const Duration _timeout = Duration(seconds: 4);
  static const int _window = 4;

  final http.Client _client = http.Client(); // keep-alive: measures real RTT
  final List<int?> _samples = []; // ms per ping; null = failed
  StreamSubscription<DatabaseEvent>? _connSub;
  Timer? _timer;
  bool _firebaseConnected = true;
  bool _disposed = false;

  NetQuality quality = NetQuality.checking;
  int? latencyMs; // median of recent successful pings

  Uri get _pingUri {
    final base = DefaultFirebaseOptions.currentPlatform.databaseURL ??
        'https://smartcurb-d174e-default-rtdb.firebaseio.com';
    // A path that holds nothing: the reply is a few bytes either way.
    return Uri.parse('$base/_ping.json');
  }

  void start() {
    _connSub = FirebaseDatabase.instance
        .ref('.info/connected')
        .onValue
        .listen((e) {
      _firebaseConnected = e.snapshot.value == true;
      _grade();
      if (_firebaseConnected) _ping(); // re-measure right after reconnecting
    });
    _ping();
    _timer = Timer.periodic(_interval, (_) => _ping());
  }

  Future<void> _ping() async {
    final sw = Stopwatch()..start();
    int? ms;
    try {
      await _client.get(_pingUri).timeout(_timeout);
      ms = sw.elapsedMilliseconds;
    } catch (_) {
      ms = null; // timed out or no network
    }
    if (_disposed) return;
    _samples.add(ms);
    if (_samples.length > _window) _samples.removeAt(0);
    _grade();
  }

  void _grade() {
    if (_disposed) return;
    final ok = _samples.whereType<int>().toList()..sort();
    final failed = _samples.length - ok.length;
    latencyMs = ok.isEmpty ? null : ok[ok.length ~/ 2];

    final NetQuality q;
    if (!_firebaseConnected ||
        (_samples.isNotEmpty && ok.isEmpty && _samples.length >= 2)) {
      q = NetQuality.offline;
    } else if (_samples.isEmpty) {
      q = NetQuality.checking;
    } else if (failed >= 2 || (latencyMs ?? 99999) > 1000) {
      q = NetQuality.bad;
    } else if (failed == 1 || latencyMs! > 300) {
      q = NetQuality.unstable;
    } else {
      q = NetQuality.good;
    }
    quality = q;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _connSub?.cancel();
    _client.close();
    super.dispose();
  }
}

/// Wi-Fi style signal icon for the connection: green = good, amber =
/// unstable, red = bad, red "no wifi" = offline. Tap or hover for details.
/// It owns its own monitor, so it can be dropped anywhere.
class ConnectionIndicator extends StatefulWidget {
  final double size;

  const ConnectionIndicator({super.key, this.size = 16});

  @override
  State<ConnectionIndicator> createState() => _ConnectionIndicatorState();
}

class _ConnectionIndicatorState extends State<ConnectionIndicator> {
  final ConnectionMonitor _monitor = ConnectionMonitor();

  @override
  void initState() {
    super.initState();
    _monitor.start();
  }

  @override
  void dispose() {
    _monitor.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _monitor,
      builder: (context, _) {
        final q = _monitor.quality;
        final ms = _monitor.latencyMs;
        final (IconData icon, Color color, String label) = switch (q) {
          NetQuality.checking => (Icons.wifi, kTextMuted, 'Checking connection…'),
          NetQuality.good => (Icons.wifi, kOpen, 'Connection good'),
          NetQuality.unstable =>
            (Icons.wifi_2_bar, kAmber, 'Connection unstable'),
          NetQuality.bad => (Icons.wifi_1_bar, kRed, 'Connection poor'),
          NetQuality.offline => (Icons.wifi_off, kRed, 'Offline'),
        };
        final detail = (ms != null && q != NetQuality.offline)
            ? '$label · $ms ms'
            : label;

        return Tooltip(
          message: detail,
          triggerMode: TooltipTriggerMode.tap,
          child: Semantics(
            label: detail,
            child: AnimatedSwitcher(
              duration: kMotion,
              transitionBuilder: (child, anim) => FadeTransition(
                opacity: anim,
                child: ScaleTransition(scale: anim, child: child),
              ),
              child: Icon(
                icon,
                key: ValueKey(q),
                size: widget.size,
                color: color,
              ),
            ),
          ),
        );
      },
    );
  }
}

/// showDialog with a modern entrance: fade + gentle scale-up from 95%.
Future<T?> showAppDialog<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool barrierDismissible = true,
}) {
  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: barrierDismissible,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: Colors.black.withValues(alpha: 0.6),
    transitionDuration: reduceMotion(context) ? Duration.zero : kMotion,
    pageBuilder: (ctx, _, _) => builder(ctx),
    transitionBuilder: (ctx, anim, _, child) {
      final t = CurvedAnimation(
        parent: anim,
        curve: kEaseOut,
        reverseCurve: Curves.easeInCubic,
      );
      return FadeTransition(
        opacity: t,
        child: ScaleTransition(
          scale: Tween(begin: 0.95, end: 1.0).animate(t),
          child: child,
        ),
      );
    },
  );
}
