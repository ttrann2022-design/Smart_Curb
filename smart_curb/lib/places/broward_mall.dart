// Westfield Broward Mall: lots and stores.
part of '../main.dart';

/// Lots with curbs in `units/` show live counts; the rest are plain map
/// points (see [Place.liveParking]).
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
  // Lots: the ones in `lots/` with this siteId (broward1-4, the biggest
  // surface lot on each side of the mall, numbered clockwise from the north).
  siteId: '-P52MJbV4GX-1cAesso6',
  // Placed the same way as FAU's (see there): guidance drives into each
  // space from its open end, along the lane behind its row.
  spotRows: [_browardLot1East],
  pathfinder: CampusPathfinder('assets/broward_walkways.json'),
);

const CurbSpotRow _browardLot1East = CurbSpotRow(
  lotId: 'broward1',
  // Broward Lot 1, east end. Nose-in spaces on the south side of an
  // east-west aisle (OSM line at 26.119729), starting at its corner with
  // the lot's north-south road (-80.255755): each space's aisle end is 1 m
  // off the aisle line, and the first space's side is 0.45 m off the road
  // line (as at FAU Lot 14).
  first: LatLng(26.119690, -80.255774),
  // Along the aisle, westward (OSM: 270.5°).
  rowBearing: 270.5,
  unitIds: ['C-201'],
  // Curbs at the aisle (north) end; cars pull in from the south.
  enterFromRight: false,
  // The lane behind the row meets the north-south road here.
  laneLeadIn: 1.9,
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
