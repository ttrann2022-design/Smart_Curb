// A destination on a map (building or store) and building search ranking.
part of '../main.dart';

// ==========================================
// PLACE MODELS & A* PATHFINDING
// ==========================================

/// A destination on a place's map (a campus building, a store in a mall).
class PlaceBuilding {
  final String id;
  final String code;
  final String name;
  final LatLng position;

  const PlaceBuilding({
    required this.id,
    required this.code,
    required this.name,
    required this.position,
  });
}

/// The buildings matching a search [query], best matches first: codes
/// starting with it, then names starting with it, then the rest (each group
/// in list order). When it names a building exactly, by code ("ed-47", or
/// "ed47" without the dash) or by name ("College of Education", with or
/// without its "(ED-47)"), only that building.
List<PlaceBuilding> rankBuildingMatches(
  List<PlaceBuilding> buildings,
  String query,
) {
  String bare(String s) => s.toLowerCase().replaceAll(RegExp(r'[\s\-]'), '');
  String words(String s) =>
      s.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
  // "College of Education (ED-47)" -> "college of education"
  String baseName(String name) =>
      words(name.replaceFirst(RegExp(r'\s*\([^)]*\)\s*$'), ''));
  final q = words(query);
  final qb = bare(q);
  if (q.isEmpty) return List.of(buildings);

  final exact = [
    for (final b in buildings)
      if ((qb.isNotEmpty && bare(b.code) == qb) ||
          words(b.name) == q ||
          baseName(b.name) == q)
        b,
  ];
  if (exact.isNotEmpty) return exact;

  int? rank(PlaceBuilding b) {
    final code = bare(b.code);
    final name = b.name.toLowerCase();
    if (qb.isNotEmpty && code == qb) return 0;
    if (qb.isNotEmpty && code.startsWith(qb)) return 1;
    if (name.startsWith(q)) return 2;
    if (name.contains(q) || (qb.isNotEmpty && code.contains(qb))) return 3;
    return null; // no match
  }

  final ranked = [
    for (var i = 0; i < buildings.length; i++)
      if (rank(buildings[i]) case final r?) (r, i, buildings[i]),
  ]..sort((a, b) => a.$1 != b.$1 ? a.$1 - b.$1 : a.$2 - b.$2);
  return [for (final r in ranked) r.$3];
}
