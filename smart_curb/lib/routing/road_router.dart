// Driving routes on real roads (OSRM).
part of '../main.dart';

class RealRoadRouter {
  static final http.Client _client = http.Client(); // reuse connections

  /// Driving route from [start] to [destination]; a straight line if
  /// routing fails. [startHeading] is the car's direction of travel while
  /// it's moving. Without it OSRM starts the route on whichever road is
  /// nearest the GPS fix, which on a divided road can be the side going the
  /// other way (a route that opens with a U-turn).
  static Future<List<LatLng>> getRoadRoute({
    required LatLng start,
    required LatLng destination,
    double? startHeading,
  }) async {
    try {
      if (startHeading != null) {
        final route = await _fetch(start, destination, startHeading);
        if (route != null) return route;
        // No road matched that direction: ask again without it.
      }
      final route = await _fetch(start, destination, null);
      if (route != null) return route;
    } catch (e) {
      debugPrint('OSRM routing error: $e');
    }
    return [start, destination];
  }

  /// One OSRM request. Null when the server answered without a usable
  /// route; throws on network errors and timeouts.
  static Future<List<LatLng>?> _fetch(
    LatLng start,
    LatLng destination,
    double? heading,
  ) async {
    // Only roads within 45° of the heading at the start; any at the end.
    final bearings =
        heading == null ? '' : '&bearings=${heading.round() % 360},45;';
    final url = Uri.parse(
      'https://router.project-osrm.org/route/v1/driving/'
      '${start.longitude},${start.latitude};'
      '${destination.longitude},${destination.latitude}'
      '?overview=full&geometries=geojson$bearings',
    );

    final response =
        await _client.get(url).timeout(const Duration(seconds: 10));
    if (response.statusCode != 200) {
      debugPrint('OSRM returned status ${response.statusCode}');
      return null;
    }
    final data = jsonDecode(response.body);
    final routes = data['routes'] as List<dynamic>?;
    if (routes == null || routes.isEmpty) return null;
    final coords = routes[0]['geometry']['coordinates'] as List<dynamic>;
    final pts = coords
        .map((pt) => LatLng(
              (pt[1] as num).toDouble(),
              (pt[0] as num).toDouble(),
            ))
        .toList();
    return pts.length >= 2 ? pts : null;
  }
}
