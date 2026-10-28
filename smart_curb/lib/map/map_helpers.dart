// Map helpers: GeoJSON, location puck icons, GPS smoothing.
part of '../main.dart';

// ==========================================
// PLACE MAP SCREEN (MapLibre GL, 3D)
// ==========================================

enum _Progress { none, onRoute, offRoute, arrived }

class _RouteProjection {
  final int seg;
  final LatLng point;
  final double dist;
  const _RouteProjection(this.seg, this.point, this.dist);
}

// ---------- GeoJSON helpers ----------

List<double> _coord(LatLng p) => [p.longitude, p.latitude];

Map<String, dynamic> _fc(List<Map<String, dynamic>> features) =>
    {'type': 'FeatureCollection', 'features': features};

Map<String, dynamic> _pointFeature(LatLng p, Map<String, dynamic> props) => {
      'type': 'Feature',
      'properties': props,
      'geometry': {'type': 'Point', 'coordinates': _coord(p)},
    };

String _hex(Color c) =>
    '#${(c.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';

/// The location marker, drawn once and cached as PNG bytes: with the
/// navigation arrow (driving) or as a plain dot (the rest of the time).
final Future<Uint8List> _puckArrowBytes = _drawPuckIcon(arrow: true);
final Future<Uint8List> _puckDotBytes = _drawPuckIcon(arrow: false);

/// The faded "which way the device faces" cone, in a few widths: narrow
/// when the compass is accurate, wider when it's less sure.
const Map<String, double> _coneSpreads = {
  'sc-cone-narrow': 50,
  'sc-cone-mid': 70,
  'sc-cone-wide': 95,
};
final Map<String, Future<Uint8List>> _coneBytes = {
  for (final e in _coneSpreads.entries) e.key: _drawConeIcon(e.value),
};

Future<Uint8List> _drawPuckIcon({required bool arrow}) async {
  const s = 96.0;
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  const center = Offset(s / 2, s / 2);

  canvas.drawCircle(center, 30, Paint()..color = Colors.black);
  canvas.drawCircle(
    center,
    30,
    Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6
      ..color = kAccent,
  );
  if (arrow) {
    final path = Path()
      ..moveTo(s / 2, s / 2 - 19)
      ..lineTo(s / 2 + 13, s / 2 + 15)
      ..lineTo(s / 2, s / 2 + 7)
      ..lineTo(s / 2 - 13, s / 2 + 15)
      ..close();
    canvas.drawPath(path, Paint()..color = kAccent);
  }

  return _toPng(recorder, s);
}

/// A wedge [spreadDeg] wide pointing up (north before rotation), its tip at
/// the image centre so it fans out from the location dot, fading out with
/// distance.
Future<Uint8List> _drawConeIcon(double spreadDeg) async {
  const s = 256.0;
  const radius = 124.0;
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  const center = Offset(s / 2, s / 2);
  final half = spreadDeg / 2 * math.pi / 180;

  final wedge = Path()
    ..moveTo(center.dx, center.dy)
    ..arcTo(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2 - half, // up is -90° on the canvas
      2 * half,
      false,
    )
    ..close();
  canvas.drawPath(
    wedge,
    Paint()
      ..shader = ui.Gradient.radial(
        center,
        radius,
        [kAccent.withValues(alpha: 0.6), kAccent.withValues(alpha: 0)],
      ),
  );

  return _toPng(recorder, s);
}

Future<Uint8List> _toPng(ui.PictureRecorder recorder, double s) async {
  final image = await recorder.endRecording().toImage(s.toInt(), s.toInt());
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  return data!.buffer.asUint8List();
}

/// Smooths live GPS by how accurate each fix is (a simple Kalman filter).
/// Indoors or between buildings a phone's fixes wander 10-40 m; standing
/// still, such a fix barely moves the estimate. Moving, the estimate is
/// first carried forward by the speed and direction the phone reports, so
/// the arrow keeps up with you instead of trailing behind.
class GpsSmoother {
  /// Below this speed (m/s) the reported direction is noise.
  static const double _minMovingSpeed = 0.8;

  LatLng? _pos;
  double _variance = 0; // m², how unsure the estimate is
  DateTime? _at;

  /// Adds a fix with its reported [accuracy] (m), [speed] (m/s, 0 when
  /// unknown) and [heading] (direction of travel, degrees) and returns the
  /// smoothed position.
  LatLng add(
    LatLng fix, {
    required double accuracy,
    required double speed,
    required double heading,
    required DateTime at,
  }) {
    // Some devices report 0 for an unknown accuracy.
    final acc = accuracy > 0 ? math.max(accuracy, 3.0) : 10.0;
    var prev = _pos;
    final prevAt = _at;
    _at = at;
    if (prev == null || prevAt == null) {
      _pos = fix;
      _variance = acc * acc;
      return fix;
    }
    final dt = math.max(0, at.difference(prevAt).inMilliseconds) / 1000.0;
    // Where you'd be now if you kept going the way the phone says you're
    // moving; standing still, where you were.
    if (speed >= _minMovingSpeed && heading >= 0) {
      prev = Geo.offset(prev, heading, speed * dt);
    }
    // How far off that guess may be: about a metre a second standing or
    // walking, more at speed (turns, braking).
    final drift = (1.0 + 0.5 * speed) * dt;
    _variance += drift * drift;
    final k = _variance / (_variance + acc * acc);
    final next = Geo.lerp(prev, fix, k);
    _pos = next;
    _variance *= 1 - k;
    return next;
  }
}

/// Coalesces GeoJSON updates per source: while one update is in flight,
/// newer ones replace each other, so the platform channel never backs up
/// (important for the 20 fps simulation).
class _SourceSync {
  final Future<void> Function(String id, Map<String, dynamic> data) _send;
  final Map<String, Map<String, dynamic>> _pending = {};
  final Set<String> _busy = {};

  _SourceSync(this._send);

  void push(String id, Map<String, dynamic> data) {
    _pending[id] = data;
    if (!_busy.contains(id)) _drain(id);
  }

  Future<void> _drain(String id) async {
    _busy.add(id);
    try {
      while (_pending.containsKey(id)) {
        final data = _pending.remove(id)!;
        try {
          await _send(id, data);
        } catch (e) {
          debugPrint('[map] update of "$id" failed: $e');
        }
      }
    } finally {
      _busy.remove(id);
    }
  }
}
