// Westfield Broward Mall: lots and stores.
part of '../main.dart';

/// No curbs installed yet: the four lots are plain map points, and the
/// closest one to the destination (by walking distance) is recommended.
final Place browardMall = Place(
  id: 'broward_mall',
  shortName: 'BWD',
  fullName: 'Broward Mall',
  address: '8000 W Broward Blvd, Plantation, FL 33388',
  logoAsset: 'assets/broward_logo.jpg',
  logoBackground: Colors.white,
  nickname: 'Broward Mall',
  mapTitle: 'Broward Mall Map',
  areaName: 'Westfield Broward Mall, Plantation',
  guidanceTitle: 'Westfield Broward Mall',
  insideLabel: 'At the Mall',
  outsideLabel: 'Outside Mall Area',
  center: const LatLng(26.117789, -80.254729), // the mall building's centre
  // Perimeter Rd, just in from its traffic light on W Broward Blvd.
  entrance: const LatLng(26.120312, -80.257132),
  // The mall's block (W Broward Blvd, N University Dr, Federated Rd and
  // Perimeter Rd) and the roads around it; the same area as its walkways.
  sw: const LatLng(26.1100, -80.2630),
  ne: const LatLng(26.1250, -80.2470),
  minZoom: 15.0,
  buildings: _browardMallBuildings,
  // The biggest surface lot on each side of the mall (OpenStreetMap),
  // numbered clockwise from the north.
  lotPositions: const {
    'lot1': LatLng(26.119498, -80.256565), // north-west, by Dillard's
    'lot2': LatLng(26.118063, -80.253161), // east, by Macy's
    'lot3': LatLng(26.115663, -80.253942), // south, by Regal
    'lot4': LatLng(26.116812, -80.256363), // west, by JCPenney
  },
  liveParking: false,
  lotNames: const {
    'lot1': 'Parking Lot 1',
    'lot2': 'Parking Lot 2',
    'lot3': 'Parking Lot 3',
    'lot4': 'Parking Lot 4',
  },
  pathfinder: CampusPathfinder('assets/broward_walkways.json'),
);

/// Westfield Broward Mall: the mall itself, its anchor stores, the cinema
/// and a few other main destinations, from OpenStreetMap
/// (© OpenStreetMap contributors, ODbL), pulled Oct 2026. Code = the short
/// label on the map.
const List<PlaceBuilding> _browardMallBuildings = [
  PlaceBuilding(
    id: 'bm_mall',
    code: 'Broward Mall',
    name: 'Westfield Broward Mall (Main Building)',
    position: LatLng(26.117789, -80.254729),
  ),
  PlaceBuilding(
    id: 'bm_brio',
    code: 'Brio',
    name: 'Brio (Restaurant)',
    position: LatLng(26.115404, -80.252057),
  ),
  PlaceBuilding(
    id: 'bm_dillards',
    code: "Dillard's",
    name: "Dillard's (Department Store)",
    position: LatLng(26.118281, -80.256400),
  ),
  PlaceBuilding(
    id: 'bm_jcpenney',
    code: 'JCPenney',
    name: 'JCPenney (Department Store)',
    position: LatLng(26.116289, -80.255379),
  ),
  PlaceBuilding(
    id: 'bm_lenscrafters',
    code: 'LensCrafters',
    name: 'LensCrafters (Eyewear)',
    position: LatLng(26.118938, -80.254558),
  ),
  PlaceBuilding(
    id: 'bm_macys',
    code: "Macy's",
    name: "Macy's (Department Store)",
    position: LatLng(26.117144, -80.253427),
  ),
  PlaceBuilding(
    id: 'bm_regal',
    code: 'Regal',
    name: 'Regal Broward Stadium 12 (Cinema)',
    position: LatLng(26.116257, -80.254112),
  ),
];
