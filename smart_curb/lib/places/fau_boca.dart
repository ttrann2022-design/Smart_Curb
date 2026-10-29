// FAU Boca Raton: lots, curb rows and every campus building.
part of '../main.dart';

final Place fauBoca = Place(
  id: 'fau_boca',
  shortName: 'FAU',
  fullName: 'Florida Atlantic University',
  address: '777 Glades Rd, Boca Raton, FL 33431',
  logoAsset: 'assets/FAU_logo.jpg',
  logoBackground: const Color(0xFF005483), // the logo's own blue
  nickname: 'FAU',
  mapTitle: 'FAU Campus Map',
  areaName: 'Boca Raton Main Campus',
  guidanceTitle: 'FAU Boca Raton Main Campus',
  insideLabel: 'On Campus',
  outsideLabel: 'Outside Campus Area',
  center: const LatLng(26.3745, -80.1030),
  entrance: const LatLng(26.3685, -80.1020),
  // Campus box. The north edge sits just past NW Spanish River Blvd, so the
  // map starts counting at its traffic lights coming in from I-95 (I-95 ramp
  // lights ~26.3873, the Airport Rd and FAU Blvd 4-way lights ~26.3861-66).
  sw: const LatLng(26.3630, -80.1170),
  ne: const LatLng(26.3880, -80.0890),
  minZoom: 14.5,
  buildings: _fauBuildings,
  // Lots: the ones in `lots/` with this siteId (positions, names and ids
  // as the dashboard has them). Ids match the `lot` field of the curbs in
  // `units/`.
  siteId: '-P52M40pbO0wEo92LGcK',
  liveParking: true,
  // To place a row, tap the centre of its first space in dev mode and copy
  // the coordinate. Guidance always drives into a space from its open end
  // (the end away from its curb), along the lane behind its row.
  spotRows: [
    _fauLot14North,
    // Across the lane, open ends facing _fauLot14North (curbs at the north
    // end, at the next aisle up); the first id sits opposite C-095. Both
    // rows share the lane between.
    CurbSpotRow.facing(_fauLot14North, unitIds: ['C-042']),
  ],
  // The small hand-made graph around the first lots and buildings, used
  // until the full campus network loads.
  pathfinder: CampusPathfinder(
    'assets/campus_walkways.json',
    nodes: {
      'lot08': const LatLng(26.373262, -80.106806),
      'lot02': const LatLng(26.373005, -80.099683),
      'lot07': const LatLng(26.373999, -80.105842),
      'lot06': const LatLng(26.374013, -80.104280),
      'ed47': const LatLng(26.373358, -80.105828),
      'bc71': const LatLng(26.373263, -80.100446),
      'cm22': const LatLng(26.372528, -80.104044),
      'ed47_west': const LatLng(26.373300, -80.106300),
      'breezeway_west': const LatLng(26.373300, -80.103500),
      'breezeway_center': const LatLng(26.373280, -80.101700),
      'breezeway_east': const LatLng(26.373270, -80.101000),
      'bc71_east': const LatLng(26.373150, -80.099950),
    },
    edges: [
      ['lot08', 'ed47_west'],
      ['lot07', 'ed47_west'],
      ['ed47', 'ed47_west'],
      ['lot07', 'lot06'],
      ['lot06', 'breezeway_west'],
      ['ed47', 'breezeway_west'],
      ['cm22', 'breezeway_west'],
      ['cm22', 'breezeway_center'],
      ['breezeway_west', 'breezeway_center'],
      ['breezeway_center', 'breezeway_east'],
      ['breezeway_east', 'bc71'],
      ['bc71', 'bc71_east'],
      ['bc71_east', 'lot02'],
    ],
  ),
);

const CurbSpotRow _fauLot14North = CurbSpotRow(
  lotId: 'lot14',
  // Lot 14. Nose-in spaces on the north side of an east-west aisle (OSM line
  // at 26.372301), starting at its crossing with the lot's north-south road
  // (-80.109880): each space's aisle end is 1 m off the aisle line, and the
  // first space's side is 0.45 m off the road line.
  first: LatLng(26.372340, -80.109899),
  // Along the aisle, westward (OSM: 270.1°).
  rowBearing: 270.1,
  unitIds: ['C-095', 'C-077', 'C-001'],
  // Curbs at the aisle (south) end; cars pull in from the north.
  enterFromRight: true,
  // The lane behind the row meets the north-south road here.
  laneLeadIn: 1.9,
  // A 3.9 m lane: with the facing row's curbs 1 m off the next aisle north
  // (26.372473, 19.1 m away), the two rows fill the room between the aisles.
  laneOffset: 1.97,
);

/// FAU Boca Raton: every building that has an official building code, from
/// OpenStreetMap (© OpenStreetMap contributors, ODbL), pulled Oct 2026.
/// Position = centre of the building's outline, so the dots line up with
/// the buildings drawn on the map. Parking garages (PK-) are left out.
const List<PlaceBuilding> _fauBuildings = [
  PlaceBuilding(
    id: 'ad10',
    code: 'AD-10',
    name: 'Kenneth R. Williams Administration (AD-10)',
    position: LatLng(26.371848, -80.101591),
  ),
  PlaceBuilding(
    id: 'ag39',
    code: 'AG-39',
    name: 'Ritter Art Gallery (AG-39)',
    position: LatLng(26.371550, -80.103648),
  ),
  PlaceBuilding(
    id: 'ah52',
    code: 'AH-52',
    name: 'Dorothy F. Schmidt Center for Arts and Humanities (AH-52)',
    position: LatLng(26.369743, -80.101365),
  ),
  PlaceBuilding(
    id: 'al9',
    code: 'AL-9',
    name: 'Dorothy F. Schmidt Arts and Letters (AL-9)',
    position: LatLng(26.369474, -80.102208),
  ),
  PlaceBuilding(
    id: 'au31a',
    code: 'AU-31A',
    name: 'Carole & Barry Kaye Performing Arts Auditorium (AU-31A)',
    position: LatLng(26.370302, -80.105596),
  ),
  PlaceBuilding(
    id: 'az79',
    code: 'AZ-79',
    name: 'Memory & Wellness Center, Louis & Anne Green (AZ-79)',
    position: LatLng(26.379654, -80.097165),
  ),
  PlaceBuilding(
    id: 'bb48',
    code: 'BB-48',
    name: 'Baseball Stadium (BB-48)',
    position: LatLng(26.370815, -80.109459),
  ),
  PlaceBuilding(
    id: 'bc71',
    code: 'BC-71',
    name: 'Charles E. Schmidt Biomedical Science Center (BC-71)',
    position: LatLng(26.373296, -80.100442),
  ),
  PlaceBuilding(
    id: 'bk76',
    code: 'BK-76',
    name: 'Bookstore (BK-76)',
    position: LatLng(26.370663, -80.103727),
  ),
  PlaceBuilding(
    id: 'bs12',
    code: 'BS-12',
    name: 'Behavioral Sciences (BS-12)',
    position: LatLng(26.372992, -80.102838),
  ),
  PlaceBuilding(
    id: 'bu86',
    code: 'BU-86',
    name: 'College of Business (BU-86)',
    position: LatLng(26.373213, -80.104676),
  ),
  PlaceBuilding(
    id: 'ce31d',
    code: 'CE-31D',
    name: 'Continuing Education Hall (CE-31D)',
    position: LatLng(26.370530, -80.106951),
  ),
  PlaceBuilding(
    id: 'cm22',
    code: 'CM-22',
    name: 'Computer Center (CM-22)',
    position: LatLng(26.372498, -80.104066),
  ),
  PlaceBuilding(
    id: 'co69',
    code: 'CO-69',
    name: 'Campus Operations & Police (CO-69)',
    position: LatLng(26.378060, -80.097316),
  ),
  PlaceBuilding(
    id: 'cr31e',
    code: 'CR-31E',
    name: 'Student Activities Center (CR-31E)',
    position: LatLng(26.369951, -80.106673),
  ),
  PlaceBuilding(
    id: 'cu97',
    code: 'CU-97',
    name: 'Culture & Society Building (CU-97)',
    position: LatLng(26.368409, -80.101906),
  ),
  PlaceBuilding(
    id: 'dm6',
    code: 'DM-6',
    name: 'Nations North Residence Hall - Algonquin (DM-6)',
    position: LatLng(26.369466, -80.104897),
  ),
  PlaceBuilding(
    id: 'dp49',
    code: 'DP-49',
    name: 'Gladys Davis Pavilion (DP-49)',
    position: LatLng(26.372508, -80.107069),
  ),
  PlaceBuilding(
    id: 'ds87',
    code: 'DS-87',
    name: 'Desantis Pavilion (DS-87)',
    position: LatLng(26.373398, -80.104460),
  ),
  PlaceBuilding(
    id: 'ed47',
    code: 'ED-47',
    name: 'College of Education (ED-47)',
    position: LatLng(26.373268, -80.105829),
  ),
  PlaceBuilding(
    id: 'ee96',
    code: 'EE-96',
    name: 'Engineering & Computer Science (EE-96)',
    position: LatLng(26.372883, -80.098079),
  ),
  PlaceBuilding(
    id: 'eg36',
    code: 'EG-36',
    name: 'College of Engineering West (EG-36)',
    position: LatLng(26.370577, -80.104460),
  ),
  PlaceBuilding(
    id: 'fa94',
    code: 'FA-94',
    name: 'Marleen & Harold Forkas Alumni Center (FA-94)',
    position: LatLng(26.374215, -80.103465),
  ),
  PlaceBuilding(
    id: 'fl24',
    code: 'FL-24',
    name: 'Fleming Hall (FL-24)',
    position: LatLng(26.373073, -80.103857),
  ),
  PlaceBuilding(
    id: 'fw23',
    code: 'FW-23',
    name: 'Fleming West (FW-23)',
    position: LatLng(26.373242, -80.104207),
  ),
  PlaceBuilding(
    id: 'gn73',
    code: 'GN-73',
    name: 'General Classroom North (GN-73)',
    position: LatLng(26.373214, -80.102372),
  ),
  PlaceBuilding(
    id: 'gp92',
    code: 'GP-92',
    name: 'Glades Park Towers (GP-92)',
    position: LatLng(26.367746, -80.104263),
  ),
  PlaceBuilding(
    id: 'gs2',
    code: 'GS-2',
    name: 'General Classroom South (GS-2)',
    position: LatLng(26.371073, -80.102823),
  ),
  PlaceBuilding(
    id: 'gy38',
    code: 'GY-38',
    name: 'The Burrow Arena (GY-38)',
    position: LatLng(26.372357, -80.109352),
  ),
  PlaceBuilding(
    id: 'hp89',
    code: 'HP-89',
    name: 'Heritage Park Towers (HP-89)',
    position: LatLng(26.369451, -80.103761),
  ),
  PlaceBuilding(
    id: 'ir70',
    code: 'IR-70',
    name: 'Indian River Towers (IR-70)',
    position: LatLng(26.368233, -80.103209),
  ),
  PlaceBuilding(
    id: 'is4',
    code: 'IS-4',
    name: 'Instructional Services (IS-4)',
    position: LatLng(26.371261, -80.103649),
  ),
  PlaceBuilding(
    id: 'kh25',
    code: 'KH-25',
    name: 'Barry Kaye Hall (KH-25)',
    position: LatLng(26.373115, -80.103473),
  ),
  PlaceBuilding(
    id: 'll31c',
    code: 'LL-31C',
    name: 'Friedberg Lifelong Learning Center (LL-31C)',
    position: LatLng(26.370811, -80.106865),
  ),
  PlaceBuilding(
    id: 'lo31b',
    code: 'LO-31B',
    name: 'Live Oak Pavilion (LO-31B)',
    position: LatLng(26.370781, -80.105759),
  ),
  PlaceBuilding(
    id: 'ly3',
    code: 'LY-3',
    name: 'S E Wimberly Library (LY-3)',
    position: LatLng(26.371845, -80.104117),
  ),
  PlaceBuilding(
    id: 'ly3a',
    code: 'LY-3A',
    name: 'Hillel Jewish Life Center (LY-3A)',
    position: LatLng(26.371831, -80.103370),
  ),
  PlaceBuilding(
    id: 'nu84',
    code: 'NU-84',
    name: 'Christine E Lynn College of Nursing (NU-84)',
    position: LatLng(26.370830, -80.100582),
  ),
  PlaceBuilding(
    id: 'od93',
    code: 'OD-93',
    name: 'Office Depot Center for Executive Education (OD-93)',
    position: LatLng(26.373414, -80.104990),
  ),
  PlaceBuilding(
    id: 'pa51',
    code: 'PA-51',
    name: 'Dorothy F. Schmidt Performing Arts (PA-51)',
    position: LatLng(26.368891, -80.101744),
  ),
  PlaceBuilding(
    id: 'pg35',
    code: 'PG-35',
    name: 'Plant Growth Complex (PG-35)',
    position: LatLng(26.373576, -80.103010),
  ),
  PlaceBuilding(
    id: 'pr75',
    code: 'PR-75',
    name: 'Eleanor R. Baldwin House (PR-75)',
    position: LatLng(26.370914, -80.095192),
  ),
  PlaceBuilding(
    id: 'ps55',
    code: 'PS-55',
    name: 'Physical Science (PS-55)',
    position: LatLng(26.372671, -80.101989),
  ),
  PlaceBuilding(
    id: 'pw62',
    code: 'PW-62',
    name: 'B.P.W. Scholarship House (PW-62)',
    position: LatLng(26.367102, -80.096201),
  ),
  PlaceBuilding(
    id: 'rc91',
    code: 'RC-91',
    name: 'Recreation & Fitness Center (RC-91)',
    position: LatLng(26.374130, -80.102294),
  ),
  PlaceBuilding(
    id: 'rd01',
    code: 'RD-01',
    name: 'Innovation Centre 1 (RD-01)',
    position: LatLng(26.385306, -80.097104),
  ),
  PlaceBuilding(
    id: 'rd02',
    code: 'RD-02',
    name: 'Innovation Centre 2 (RD-02)',
    position: LatLng(26.383796, -80.097171),
  ),
  PlaceBuilding(
    id: 'sb68',
    code: 'SB-68',
    name: 'Softball Stadium (SB-68)',
    position: LatLng(26.373551, -80.110084),
  ),
  PlaceBuilding(
    id: 'sc1',
    code: 'SC-1',
    name: 'Sanson Life Science (SC-1)',
    position: LatLng(26.372423, -80.102987),
  ),
  PlaceBuilding(
    id: 'se43',
    code: 'SE-43',
    name: 'Science & Engineering (SE-43)',
    position: LatLng(26.373294, -80.101803),
  ),
  PlaceBuilding(
    id: 'sh46',
    code: 'SH-46',
    name: 'Student Housing Services (SH-46)',
    position: LatLng(26.368800, -80.104836),
  ),
  PlaceBuilding(
    id: 'so44',
    code: 'SO-44',
    name: 'Social Sciences (SO-44)',
    position: LatLng(26.370683, -80.101659),
  ),
  PlaceBuilding(
    id: 'ss8',
    code: 'SS-8',
    name: 'Student Services (SS-8)',
    position: LatLng(26.370406, -80.103054),
  ),
  PlaceBuilding(
    id: 'ss8w',
    code: 'SS-8W',
    name: 'Student Health Services (SS-8W)',
    position: LatLng(26.370394, -80.103400),
  ),
  PlaceBuilding(
    id: 'su80',
    code: 'SU-80',
    name: 'Student Support Services (SU-80)',
    position: LatLng(26.369258, -80.105631),
  ),
  PlaceBuilding(
    id: 'un31',
    code: 'UN-31',
    name: 'Student Union (UN-31)',
    position: LatLng(26.370257, -80.106234),
  ),
  PlaceBuilding(
    id: 'ut5',
    code: 'UT-5',
    name: 'Utilities (UT-5)',
    position: LatLng(26.372408, -80.104928),
  ),
  PlaceBuilding(
    id: 'va53',
    code: 'VA-53',
    name: 'Dorothy F. Schmidt Visual Arts (VA-53)',
    position: LatLng(26.369090, -80.100889),
  ),
];
