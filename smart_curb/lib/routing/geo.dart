// Geometry helpers: distances, bearings, offsets.
part of '../main.dart';

// ==========================================
// GEOMETRY HELPERS (fast, campus-scale)
// ==========================================

/// Equirectangular math: accurate to well under 0.1% at campus distances
/// and much cheaper than an ellipsoid (Vincenty) distance, which matters
/// because these run on every GPS fix and every 50 ms simulation tick.
class Geo {
  static const double _earthR = 6371008.8;
  static const double _deg = math.pi / 180.0;

  static double meters(LatLng a, LatLng b) {
    final x = (b.longitude - a.longitude) *
        _deg *
        math.cos((a.latitude + b.latitude) * 0.5 * _deg);
    final y = (b.latitude - a.latitude) * _deg;
    return math.sqrt(x * x + y * y) * _earthR;
  }

  static double pathLength(List<LatLng> pts) {
    var total = 0.0;
    for (var i = 0; i < pts.length - 1; i++) {
      total += meters(pts[i], pts[i + 1]);
    }
    return total;
  }

  static LatLng lerp(LatLng a, LatLng b, double t) => LatLng(
        a.latitude + (b.latitude - a.latitude) * t,
        a.longitude + (b.longitude - a.longitude) * t,
      );

  /// Fraction (0..1) along segment a→b of the point closest to p.
  static double projectT(LatLng p, LatLng a, LatLng b) {
    final cosLat = math.cos(a.latitude * _deg);
    final abx = (b.longitude - a.longitude) * cosLat;
    final aby = b.latitude - a.latitude;
    final apx = (p.longitude - a.longitude) * cosLat;
    final apy = p.latitude - a.latitude;
    final len2 = abx * abx + aby * aby;
    if (len2 == 0) return 0;
    return ((apx * abx + apy * aby) / len2).clamp(0.0, 1.0).toDouble();
  }

  /// Compass bearing 0..360 from a to b.
  static double bearing(LatLng a, LatLng b) {
    final lat1 = a.latitude * _deg;
    final lat2 = b.latitude * _deg;
    final dLon = (b.longitude - a.longitude) * _deg;
    final y = math.sin(dLon) * math.cos(lat2);
    final x = math.cos(lat1) * math.sin(lat2) -
        math.sin(lat1) * math.cos(lat2) * math.cos(dLon);
    return (math.atan2(y, x) / _deg + 360.0) % 360.0;
  }

  /// The point [meters] from [p] in compass direction [bearing].
  static LatLng offset(LatLng p, double bearing, double meters) {
    final b = bearing * _deg;
    final dLat = meters * math.cos(b) / _earthR;
    final dLng =
        meters * math.sin(b) / (_earthR * math.cos(p.latitude * _deg));
    return LatLng(p.latitude + dLat / _deg, p.longitude + dLng / _deg);
  }

  /// Signed shortest rotation (-180..180] from one angle to another.
  static double shortestAngle(double from, double to) {
    var d = (to - from) % 360.0; // Dart % is always >= 0 here
    if (d > 180.0) d -= 360.0;
    return d;
  }

  /// The point [along] meters from the start of [pts] (at least 2 points),
  /// and the segment it lies on. [suffix] holds each point's distance to the
  /// end of the path, so this is a binary search, cheap enough to run every
  /// animation frame.
  static ({int seg, LatLng point}) pointAlong(
    List<LatLng> pts,
    List<double> suffix,
    double along,
  ) {
    final total = suffix.first;
    final rest = (total - along).clamp(0.0, total); // meters left to the end
    // The last point that still has at least `rest` to go.
    var lo = 0;
    var hi = pts.length - 2;
    while (lo < hi) {
      final mid = (lo + hi + 1) >> 1;
      if (suffix[mid] >= rest) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    final len = suffix[lo] - suffix[lo + 1];
    final t = len > 0 ? ((suffix[lo] - rest) / len).clamp(0.0, 1.0) : 0.0;
    return (seg: lo, point: lerp(pts[lo], pts[lo + 1], t));
  }
}
