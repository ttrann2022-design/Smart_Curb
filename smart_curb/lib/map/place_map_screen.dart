// The place map screen: live lots, search, routing, navigation, dev tools.
part of '../main.dart';

class PlaceMapScreen extends StatefulWidget {
  /// Everything place-specific on the map (area, destinations, lots).
  final Place place;

  /// Opens with this destination already picked (e.g. "Navigate there" in
  /// the assistant), routing to it as soon as the parking data is in.
  final PlaceBuilding? initialBuilding;

  const PlaceMapScreen({super.key, required this.place, this.initialBuilding});

  @override
  State<PlaceMapScreen> createState() => _PlaceMapScreenState();
}

class _PlaceMapScreenState extends State<PlaceMapScreen>
    with SingleTickerProviderStateMixin {
  // ---- map style ----
  /// Bright, detailed OpenStreetMap style (free, no API key).
  static const String _styleUrl = 'https://tiles.openfreemap.org/styles/liberty';

  // ---- camera tuning ----
  static const double _overviewZoom = 16.0;
  // Performance: the steeper the tilt, the more of the horizon is visible,
  // and the more distant 3D buildings MapLibre has to load and draw. Near
  // 60° it extrudes most of Boca Raton, which drops frames. 45° keeps the 3D
  // look with far fewer buildings on screen.
  static const double _overviewTilt = 45.0;
  /// Tilting further by hand eases back to this when you let go.
  static const double _maxTilt = 50.0;
  // Turn-by-turn camera, tuned to feel like Apple / Google Maps: course-up,
  // close-in street-level zoom, arrow in the lower part of the screen.
  // (Max map zoom is 20, see minMaxZoomPreference.)
  static const double _navZoom3D = 19.5;
  static const double _navZoom2D = 18.0;
  static const double _navTilt = 45.0;

  /// Arrow sits this far down the map (0 = top, 1 = bottom).
  static const double _navPuckY = 0.72;

  double get _navZoom => _is3D ? _navZoom3D : _navZoom2D;

  // ---- routing tuning ----
  static const double _offRouteMeters = 35.0;
  static const double _arrivalMeters = 10.0;
  static const double _maxGpsAccuracyForReroute = 30.0;
  static const Duration _rerouteCooldown = Duration(seconds: 6);

  /// GPS course is only trusted above this speed (slower, it wanders).
  static const double _minCourseSpeed = 3.0; // m/s, about 7 mph

  /// The arrow is drawn on the route only while you're heading along it:
  /// within this of the road's direction where you are (or just before or
  /// after, so following the route around a corner counts). Turning off it
  /// (~90°) or the other side of a divided road (~180°) doesn't.
  static const double _snapMaxHeadingDiff = 60.0;

  /// Like Google Maps, the arrow is put on the road only while driving the
  /// route: after moving faster than [_minCourseSpeed], and still through
  /// stops (red lights) for this long. Standing, walking or parked, it's
  /// always at your real GPS position.
  static const Duration _drivingSnapHold = Duration(seconds: 60);
  static const Duration _simTick = Duration(milliseconds: 50);
  static const double _simMetersPerTick = 0.447; // 20 mph at 50 ms ticks

  // ---- place geometry ----
  // The place's box: the map can't be panned outside it, and inside it
  // counts as "on campus" (at the place).
  Place get _place => widget.place;
  late final CameraTargetBounds _cameraBounds = CameraTargetBounds(
    LatLngBounds(southwest: _place.sw, northeast: _place.ne),
  );
  late final MinMaxZoomPreference _campusZoom =
      MinMaxZoomPreference(_place.minZoom, 20.0);
  // Dev mode: no campus box and no minimum zoom, to follow live GPS anywhere.
  static const MinMaxZoomPreference _freeRoamZoom =
      MinMaxZoomPreference(null, 20.0);

  bool _inCampus(LatLng p) => _place.contains(p);

  // ---- map source / layer ids ----
  static const String _srcRoute = 'sc-route';
  static const String _srcWalk = 'sc-walk';
  static const String _srcLots = 'sc-lots';
  static const String _srcBuildings = 'sc-buildings';
  static const String _srcPuck = 'sc-puck';
  static const String _srcSpots = 'sc-spots';
  static const String _layerBuildings3d = 'sc-buildings-3d';
  static const String _puckArrowImage = 'sc-puck-arrow';
  static const String _puckDotImage = 'sc-puck-dot';
  static const List<String> _fonts = ['Noto Sans Regular'];

  // Curb spaces (the place's [Place.spotRows]) are 3D blocks that are green
  // (open), red (occupied) or gray (offline).

  /// Height of the space blocks: low slabs, so they read as part of the lot.
  static const double _spotHeight = 0.6; // m
  static const double _spotTargetHeight = 1.5; // m

  /// The unit id sits this far from the space's centre toward its curb
  /// (spaces are 6.6 m deep), so the name marks the front of the space.
  static const double _spotLabelToCurb = 1.8; // m

  // ---- map ----
  MapLibreMapController? _map;
  bool _styleReady = false;
  bool _introPlayed = false;
  bool _is3D = true;
  late final _SourceSync _sync = _SourceSync(_sendSource);
  Offset? _pointerDownAt;

  /// Size of the map area (below the app bar), set by the LayoutBuilder.
  double _mapHeight = 0;
  double _mapWidth = 0;

  // ---- subscriptions ----
  StreamSubscription<geo.Position>? _positionSub;
  StreamSubscription<DatabaseEvent>? _unitsSub;
  StreamSubscription<DatabaseEvent>? _lotsSub;
  StreamSubscription<CompassEvent>? _compassSub;

  /// Whether the device compass gives real readings (null = not known yet).
  /// Without a compass sensor the plugin sends nothing, or on Android a
  /// constant 0° (north), which would pin the arrow pointing north.
  bool? _compassWorks;
  Timer? _compassCheckTimer;

  /// Which way the device points (compass, degrees) and how sure it is
  /// (± degrees, null = unknown): the facing cone on the location dot.
  double _compassHeading = 0;
  double? _compassAccuracy;
  Timer? _simTimer;

  // ---- smooth arrow + camera (live GPS and Simulate Run) ----
  // Positions arrive about once a second (GPS) or every 0.5 s (simulation).
  // The arrow glides from where it is to each new position. One loop, run
  // once per screen frame, moves the arrow and (in focus mode) puts the
  // camera exactly on it, facing one smoothed direction shared by both. So
  // the arrow stays pinned on screen, turns are fluid, and the two can never
  // drift apart or stutter against each other.
  static const double _glideSnapMeters = 100; // bigger jumps don't animate

  /// A glide lasts a bit longer than the gap between fixes, so the arrow is
  /// still moving when the next fix lands instead of stopping and starting.
  static const double _glideStretch = 1.2;

  /// How fast the shown direction follows a new one: about 63% of the way
  /// every this many seconds. Smooth turns; compass jitter and the route's
  /// corners are evened out.
  static const double _turnSmoothing = 0.3;

  /// The same for zoom and tilt (switching 2D/3D in focus mode).
  static const double _zoomSmoothing = 0.25;
  static const Duration _focusEntryTime = Duration(milliseconds: 800);

  /// The route line is redrawn (attached to the arrow) this often.
  static const Duration _routePushEvery = Duration(milliseconds: 100);
  static const Duration _revealFrame = Duration(milliseconds: 33);

  late final Ticker _frameTicker = createTicker(_onFrame);
  Duration? _lastFrameAt;
  bool _gliding = false;
  LatLng? _shownPos; // where the arrow is drawn; null = draw at _userPos
  LatLng? _glideFrom;
  LatLng? _glideTo;
  DateTime _glideStart = DateTime.fromMillisecondsSinceEpoch(0);
  Duration _glideDuration = Duration.zero;
  DateTime _lastFixAt = DateTime.fromMillisecondsSinceEpoch(0);
  DateTime _lastRoutePushAt = DateTime.fromMillisecondsSinceEpoch(0);
  // On the route the arrow glides along it (around corners, not across
  // them): distances from the start of _glideRoute.
  List<LatLng>? _glideRoute;
  double? _glideFromAlong;
  double? _glideToAlong;
  double? _shownAlong; // where _shownPos is on _glideRoute (null = unknown)

  /// The direction the arrow is drawn (and the focus camera faces), easing
  /// toward [_puckBearing]; and the cone's, easing toward the compass.
  double _shownBearing = 0;
  double _shownFacing = 0;

  // ---- focus-mode camera ----
  // Placed every frame (no native camera animation to fight with). Turning
  // focus mode on, it blends from where it was onto the moving arrow.
  bool _followReady = false;
  CameraPosition? _focusEntryFrom;
  DateTime _focusEntryAt = DateTime.fromMillisecondsSinceEpoch(0);
  double _followZoom = _navZoom3D;
  double _followTilt = _navTilt;
  CameraPosition? _lastSentCam;
  bool _camBusy = false;
  CameraPosition? _camPending;

  // ---- detecting the user moving the map in focus mode ----
  // Every camera the app sends is remembered for a moment. A camera report
  // that matches none of them means the user dragged, zoomed, rotated or
  // tilted the map, so focus mode turns off and the camera stays put.
  static const int _sentCamMemory = 30; // about half a second of frames
  final List<CameraPosition> _sentCams = [];

  /// Deliberate animations (intro, padding shift) pause the check.
  DateTime _camAnimUntil = DateTime.fromMillisecondsSinceEpoch(0);

  /// The "arrow low on screen" padding stays on after focus mode ends, so the
  /// view doesn't jump; it is removed right before the next app animation.
  bool _navPaddingOn = false;

  int _simTickCount = 0;

  /// Dev mode: last tapped coordinate (notifier = no full rebuild).
  final ValueNotifier<LatLng?> _devTap = ValueNotifier(null);

  // ---- search box ----
  final TextEditingController _searchCtrl = TextEditingController();
  final FocusNode _searchFocus = FocusNode();
  String _searchQuery = '';

  // ---- location ----
  LatLng? _userPos;
  double _heading = 0;

  /// Last GPS course while clearly moving (see [_minCourseSpeed]), and when.
  /// Slower (walking, standing), the compass sets the direction instead.
  double _gpsCourse = 0;
  DateTime _gpsCourseAt = DateTime.fromMillisecondsSinceEpoch(0);
  bool _isLocating = false;
  String _gpsStatus = 'Searching for GPS...';

  /// How accurate the last live fix was (m), shown in dev mode.
  double? _gpsAccuracy;
  final GpsSmoother _gpsSmoother = GpsSmoother();

  // ---- modes ----
  bool _navTracking = false;
  bool _devMode = false;

  /// The campus limits on the map (pan box, minimum zoom) are lifted. On
  /// with dev mode; when dev mode ends they come back once the view is back
  /// on campus (see [_restoreCampusLimits]).
  bool _freeRoam = false;

  /// Dev: when on, a map tap moves the location arrow there.
  bool _clickToMove = false;

  /// Last time a finger/mouse went down on one of our controls over the map.
  /// On web the map also receives that click, so map clicks right after it
  /// are ignored (no arrow move or building pick from pressing a button).
  DateTime _lastOverlayPressAt = DateTime.fromMillisecondsSinceEpoch(0);

  /// Wraps a control that sits on top of the map so presses on it never
  /// "click through" to the map underneath. On web the map is a separate
  /// browser element, so without PointerInterceptor it also receives the
  /// mouse: scrolling the suggestion list zoomed the map and a quick double
  /// click on the guidance card double-click-zoomed it, which (correctly,
  /// from the map's point of view) switched focus mode off. On phones it
  /// does nothing extra.
  Widget _tapShield(Widget child) => PointerInterceptor(
        child: Listener(
          onPointerDown: (_) => _lastOverlayPressAt = DateTime.now(),
          child: child,
        ),
      );
  bool _devLocationOverride = false;
  bool _isSimulating = false;

  // ---- routing ----
  PlaceBuilding? _selectedBuilding;
  PathResult? _walkResult;
  String? _routeLotId;

  /// The curb the current driving route ends at (null: the lot itself).
  String? _routeUnitId;
  List<LatLng> _fullRoute = const [];
  List<double> _routeSuffix = const [];
  List<LatLng> _displayRoute = const [];
  int _routeSeg = 0;
  double _routeRemaining = 0;

  /// While you're following the route: the point on it nearest to you,
  /// where the route line joins the road. Null when you're off the route.
  LatLng? _routeSnap;

  /// The live arrow is drawn on the road at [_routeSnap] (only while
  /// driving the route, see [_drivingSnapHold]).
  bool _arrowOnRoute = false;
  bool _arrived = false;
  int _routeRequestId = 0;
  bool _isRouting = false;
  DateTime _lastRouteAt = DateTime.fromMillisecondsSinceEpoch(0);

  Map<String, Map<String, dynamic>> _liveLots = {};

  /// Lot whose spot bubble is open over the map (tap a lot to show it).
  String? _openLotId;

  /// Where that lot's dot is on screen, in logical pixels from the map's
  /// top-left; the bubble is drawn just above it.
  Offset? _lotAnchor;
  bool _anchorBusy = false;
  bool _anchorDirty = false;

  bool get _isOnCampus => _userPos != null && _inCampus(_userPos!);

  /// Focus mode follows you on campus, or anywhere in dev mode.
  bool get _canFocus => _isOnCampus || _devMode;

  // ==========================================
  // LIFECYCLE
  // ==========================================

  @override
  void initState() {
    super.initState();
    _searchFocus.addListener(_onSearchFocusChanged);
    _startLiveLocationTracking();
    _startCompassTracking();
    _listenToFirebaseParking();
    final start = widget.initialBuilding;
    if (start != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _onBuildingSelected(start);
      });
    }
  }

  @override
  void dispose() {
    _frameTicker.dispose();
    _simTimer?.cancel();
    _walkRevealTimer?.cancel();
    _walkSimTimer?.cancel();
    _positionSub?.cancel();
    _compassSub?.cancel();
    _compassCheckTimer?.cancel();
    _unitsSub?.cancel();
    _lotsSub?.cancel();
    _devTap.dispose();
    _searchFocus.dispose();
    _searchCtrl.dispose();
    _styleReady = false;
    _map = null; // the MapLibreMap widget disposes its own controller
    super.dispose();
  }

  // ==========================================
  // MAP SETUP
  // ==========================================

  Future<void> _guard(Future<Object?> Function() f) async {
    try {
      await f();
    } catch (e) {
      debugPrint('[map] $e');
    }
  }

  Future<void> _sendSource(String id, Map<String, dynamic> data) async {
    final m = _map;
    if (m == null || !_styleReady || !mounted) return;
    await m.setGeoJsonSource(id, data);
  }

  /// Runs on first load AND again if Android recreates the map
  /// (a new style discards every source and layer we added).
  Future<void> _onStyleLoaded() async {
    final m = _map;
    if (m == null) return;
    _styleReady = false;
    await _setupStyle(m);
    if (!mounted || _map != m) return;
    _styleReady = true;
    _pushAll();

    if (!_introPlayed) {
      _introPlayed = true;
      _animateTo(
        CameraPosition(
          target: _place.center,
          zoom: _overviewZoom,
          bearing: 20,
          tilt: _is3D ? _overviewTilt : 0,
        ),
        const Duration(milliseconds: 2500),
      );
    }
  }

  Future<void> _setupStyle(MapLibreMapController m) async {
    Future<bool> safe(String what, Future<Object?> Function() f) async {
      try {
        await f();
        return true;
      } catch (e) {
        debugPrint('[map] $what failed: $e');
        return false;
      }
    }

    final empty = _fc(const <Map<String, dynamic>>[]);

    var layerIds = const <String>[];
    var sourceIds = const <String>[];
    await safe('read style', () async {
      layerIds = (await m.getLayerIds()).map((e) => e.toString()).toList();
      sourceIds = (await m.getSourceIds()).map((e) => e.toString()).toList();
      return null;
    });

    // Keep street / place names above our 3D buildings.
    String? firstLabel;
    for (final id in layerIds) {
      if (id.contains('label') || id.startsWith('place') || id.startsWith('poi')) {
        firstLabel = id;
        break;
      }
    }

    // Hide the style's own 3D buildings (we draw our own) and its POI
    // icons, so the only markers on the map are your campus nodes.
    for (final id in layerIds) {
      final isStyle3d = id.contains('building-3d') || id.contains('building_3d');
      final isPoi = id.startsWith('poi');
      if (isStyle3d || isPoi) {
        await safe('hide $id', () => m.setLayerVisibility(id, false));
      }
    }

    // ---- 3D buildings from OpenStreetMap (OpenMapTiles schema) ----
    var buildings3d = false;
    if (sourceIds.contains('openmaptiles')) {
      const height = ['coalesce', ['get', 'render_height'], 8];
      const base = ['coalesce', ['get', 'render_min_height'], 0];
      buildings3d = await safe(
        '3d buildings',
        () => m.addFillExtrusionLayer(
          'openmaptiles',
          _layerBuildings3d,
          const FillExtrusionLayerProperties(
            fillExtrusionColor: [
              'interpolate', ['linear'], height,
              0, '#EDE8DD',
              15, '#E0D9CB',
              40, '#D1C8B6',
              90, '#BFB5A1',
            ],
            // Buildings "grow" out of the ground as you zoom in. No 3D below
            // zoom 15, where it costs a lot and adds little.
            fillExtrusionHeight: [
              'interpolate', ['linear'], ['zoom'],
              15, 0,
              16, height,
            ],
            fillExtrusionBase: [
              'interpolate', ['linear'], ['zoom'],
              15, 0,
              16, base,
            ],
            fillExtrusionOpacity: 0.9,
          ),
          sourceLayer: 'building',
          minzoom: 15,
          belowLayerId: firstLabel,
          enableInteraction: false,
        ),
      );
    }

    // Soft sunlight so 3D buildings get shaded walls instead of flat color.
    await safe(
      'light',
      () => m.setLight(
        const LightProperties(
          anchor: 'map',
          position: [1.3, 210, 35], // radial, azimuth (from SSW), polar
          intensity: 0.4,
        ),
      ),
    );

    // ---- our GeoJSON sources (start empty, filled by _pushAll) ----
    for (final id in [
      _srcRoute,
      _srcWalk,
      _srcLots,
      _srcBuildings,
      _srcPuck,
      _srcSpots,
    ]) {
      await safe('source $id', () => m.addGeoJsonSource(id, empty));
    }

    // ---- curb parking spaces: 3D blocks in their live status colour ----
    await safe(
      'curb spaces',
      () => m.addFillExtrusionLayer(
        _srcSpots,
        'sc-spots-3d',
        const FillExtrusionLayerProperties(
          fillExtrusionColor: ['get', 'color'],
          // The curb you're being guided to stands taller than the rest.
          fillExtrusionHeight: [
            'case', ['==', ['get', 'target'], true],
            _spotTargetHeight, _spotHeight,
          ],
          fillExtrusionBase: 0,
          fillExtrusionOpacity: 0.95,
        ),
        filter: ['==', ['get', 'kind'], 'space'],
        minzoom: 16,
        belowLayerId: firstLabel,
        enableInteraction: false,
      ),
    );
    // Unit id at the curb end of each space, once zoomed in enough to fit.
    // It lies flat on the map with its top toward the curb (the front of
    // the space), like a marking painted for a driver pulling in, so which
    // end is the curb reads at a glance however the map is turned.
    await safe(
      'curb space labels',
      () => m.addSymbolLayer(
        _srcSpots,
        'sc-spots-label',
        SymbolLayerProperties(
          textField: ['get', 'id'],
          textFont: _fonts,
          textSize: ['case', ['==', ['get', 'target'], true], 12, 10],
          textColor: [
            'case', ['==', ['get', 'target'], true],
            _hex(kAccent), '#FFFFFF',
          ],
          textHaloColor: '#000000',
          textHaloWidth: 1.4,
          textRotate: ['get', 'rotate'],
          textRotationAlignment: 'map',
          textPitchAlignment: 'map',
          textAllowOverlap: true,
          textIgnorePlacement: true,
        ),
        filter: ['==', ['get', 'kind'], 'label'],
        minzoom: 18.5,
        enableInteraction: false,
      ),
    );

    // ---- route line: under the 3D buildings so they occlude it correctly ----
    final routeBelow = buildings3d ? _layerBuildings3d : firstLabel;
    await safe(
      'route casing',
      () => m.addLineLayer(
        _srcRoute,
        'sc-route-casing',
        const LineLayerProperties(
          lineColor: '#000000',
          lineWidth: 10.0,
          lineOpacity: 0.75,
          lineCap: 'round',
          lineJoin: 'round',
        ),
        belowLayerId: routeBelow,
        enableInteraction: false,
      ),
    );
    await safe(
      'route line',
      () => m.addLineLayer(
        _srcRoute,
        'sc-route-line',
        LineLayerProperties(
          lineColor: _hex(kAccent),
          lineWidth: 6.0,
          lineCap: 'round',
          lineJoin: 'round',
        ),
        belowLayerId: routeBelow,
        enableInteraction: false,
      ),
    );

    // ---- walking line (lot -> building), shown once you've parked ----
    // Footstep-style dark dots over a soft accent glow, the usual "walk this
    // part" look, clearly different from the solid driving route.
    await safe(
      'walk glow',
      () => m.addLineLayer(
        _srcWalk,
        'sc-walk-glow',
        LineLayerProperties(
          lineColor: _hex(kAccent),
          lineWidth: 11.0,
          lineOpacity: 0.35,
          lineBlur: 2.0,
          lineCap: 'round',
          lineJoin: 'round',
        ),
        belowLayerId: routeBelow,
        enableInteraction: false,
      ),
    );
    await safe(
      'walk dots',
      () => m.addLineLayer(
        _srcWalk,
        'sc-walk-dots',
        LineLayerProperties(
          lineColor: _hex(kOnAccent),
          lineWidth: 5.0,
          lineDasharray: const [0, 1.8], // zero-length dashes + round caps = dots
          lineCap: 'round',
          lineJoin: 'round',
        ),
        belowLayerId: routeBelow,
        enableInteraction: false,
      ),
    );

    // ---- building markers ----
    // ~60 buildings: dots stay small when zoomed out and grow as you zoom
    // in; code labels only appear once zoomed in, and labels that would
    // overlap are hidden. The selected building is always big and labelled.
    const isSelected = ['==', ['get', 'selected'], true];
    const notSelected = ['!=', ['get', 'selected'], true];
    await safe(
      'building dots',
      () => m.addCircleLayer(
        _srcBuildings,
        'sc-buildings-dot',
        CircleLayerProperties(
          circleRadius: [
            'interpolate', ['linear'], ['zoom'],
            15, ['case', isSelected, 7, 2.5],
            18, ['case', isSelected, 9, 5],
          ],
          circleColor: ['case', isSelected, _hex(kAccent), _hex(kDev)],
          circleStrokeColor: '#000000',
          circleStrokeWidth: [
            'interpolate', ['linear'], ['zoom'],
            15, ['case', isSelected, 2, 1],
            18, 2,
          ],
        ),
        enableInteraction: false,
      ),
    );
    await safe(
      'building labels',
      () => m.addSymbolLayer(
        _srcBuildings,
        'sc-buildings-label',
        SymbolLayerProperties(
          textField: ['get', 'code'],
          textFont: _fonts,
          textSize: 11,
          textColor: '#FFFFFF',
          textHaloColor: '#000000',
          textHaloWidth: 1.6,
          textAnchor: 'top',
          textOffset: [0, 0.9],
          textAllowOverlap: false, // hide labels that would collide
        ),
        filter: notSelected,
        minzoom: 16.3,
        enableInteraction: false,
      ),
    );
    await safe(
      'selected building label',
      () => m.addSymbolLayer(
        _srcBuildings,
        'sc-buildings-label-selected',
        SymbolLayerProperties(
          textField: ['get', 'code'],
          textFont: _fonts,
          textSize: 14,
          textColor: _hex(kAccent),
          textHaloColor: '#000000',
          textHaloWidth: 1.6,
          textAnchor: 'top',
          textOffset: [0, 0.9],
          textAllowOverlap: true,
          textIgnorePlacement: true,
        ),
        filter: isSelected,
        enableInteraction: false,
      ),
    );

    // ---- lot markers: status-coloured dot with the label underneath ----
    // Dot and label share the lot's live status colour (green / amber / red).
    // The recommended lot gets a bigger dot with an accent ring.
    const isBestLot = ['==', ['get', 'best'], true];
    await safe(
      'lot dots',
      () => m.addCircleLayer(
        _srcLots,
        'sc-lots-dot',
        CircleLayerProperties(
          circleRadius: ['case', isBestLot, 8, 6],
          circleColor: ['get', 'color'],
          circleStrokeColor: ['case', isBestLot, _hex(kAccent), '#000000'],
          circleStrokeWidth: ['case', isBestLot, 3, 2],
        ),
        enableInteraction: false,
      ),
    );
    // With ~50 FAU lots, labels that would overlap are hidden (like the
    // building labels); the recommended lot's label always shows.
    await safe(
      'lot labels',
      () => m.addSymbolLayer(
        _srcLots,
        'sc-lots-label',
        const SymbolLayerProperties(
          textField: ['get', 'label'],
          textFont: _fonts,
          textSize: 11,
          textColor: ['get', 'color'],
          textHaloColor: '#000000',
          textHaloWidth: 1.8,
          textJustify: 'center',
          textAnchor: 'top',
          textOffset: [0, 0.9],
          textAllowOverlap: false,
        ),
        filter: ['!=', ['get', 'best'], true],
        enableInteraction: false,
      ),
    );
    await safe(
      'best lot label',
      () => m.addSymbolLayer(
        _srcLots,
        'sc-lots-label-best',
        const SymbolLayerProperties(
          textField: ['get', 'label'],
          textFont: _fonts,
          textSize: 13,
          textColor: ['get', 'color'],
          textHaloColor: '#000000',
          textHaloWidth: 1.8,
          textJustify: 'center',
          textAnchor: 'top',
          textOffset: [0, 0.9],
          textAllowOverlap: true,
          textIgnorePlacement: true,
        ),
        filter: isBestLot,
        enableInteraction: false,
      ),
    );

    // ---- user puck: facing cone, flat glow, then the dot or arrow ----
    // All lie flat on the tilted map. The cone (compass only) is drawn
    // first so it fans out from under the dot.
    await safe('puck images', () async {
      await m.addImage(_puckArrowImage, await _puckArrowBytes);
      await m.addImage(_puckDotImage, await _puckDotBytes);
      for (final e in _coneBytes.entries) {
        await m.addImage(e.key, await e.value);
      }
      return null;
    });
    await safe(
      'puck cone',
      () => m.addSymbolLayer(
        _srcPuck,
        'sc-puck-cone',
        const SymbolLayerProperties(
          iconImage: ['get', 'cone'],
          iconSize: 0.5,
          iconRotate: ['get', 'facing'],
          iconRotationAlignment: 'map',
          iconPitchAlignment: 'map',
          iconAllowOverlap: true,
          iconIgnorePlacement: true,
        ),
        filter: ['has', 'cone'],
        enableInteraction: false,
      ),
    );
    await safe(
      'puck glow',
      () => m.addCircleLayer(
        _srcPuck,
        'sc-puck-glow',
        CircleLayerProperties(
          circleRadius: 22,
          circleColor: _hex(kAccent),
          circleOpacity: 0.22,
          circlePitchAlignment: 'map',
        ),
        enableInteraction: false,
      ),
    );
    await safe(
      'puck marker',
      () => m.addSymbolLayer(
        _srcPuck,
        'sc-puck-arrow',
        const SymbolLayerProperties(
          iconImage: ['get', 'icon'],
          iconSize: 0.5,
          iconRotate: ['get', 'bearing'],
          iconRotationAlignment: 'map',
          iconPitchAlignment: 'map',
          iconAllowOverlap: true,
          iconIgnorePlacement: true,
        ),
        enableInteraction: false,
      ),
    );
  }

  // ==========================================
  // MAP DATA PUSHES
  // ==========================================

  void _pushAll() {
    _walkShownFor = null; // a (re)loaded style starts with empty sources
    _pushOverlays();
    _pushRoute();
    _pushPuck();
  }

  void _pushOverlays() {
    _pushLots();
    _pushBuildings();
    _pushSpots();
  }

  /// Gray when offline (whatever else it reports) or not in the database,
  /// red when occupied, green when open.
  static Color _spotColor(Map<String, dynamic>? unit) {
    if (unit == null || unit['online'] != true) return kTextMuted;
    return unit['occupied'] == true ? kRed : kOpen;
  }

  void _pushSpots() {
    // Every unit's live state by id, whichever lot it reports.
    final units = <String, Map<String, dynamic>>{
      for (final lot in _liveLots.values)
        for (final u in lot['units'] as List<Map<String, dynamic>>)
          u['id'] as String: u,
    };
    final target = _walkResult?.unitId;
    _sync.push(
      _srcSpots,
      _fc([
        for (final s in _place.spotShapes) ...[
          {
            'type': 'Feature',
            'properties': {
              'kind': 'space',
              'color': _hex(_spotColor(units[s.unitId])),
              'target': s.unitId == target,
            },
            'geometry': {
              'type': 'Polygon',
              'coordinates': [
                [for (final p in s.ring) _coord(p)],
              ],
            },
          },
          _pointFeature(
            Geo.offset(s.center, s.curbBearing, _spotLabelToCurb),
            {
              'kind': 'label',
              'id': s.unitId,
              'target': s.unitId == target,
              'rotate': s.curbBearing,
            },
          ),
        ],
      ]),
    );
  }

  void _pushLots() {
    final bestId = _walkResult?.lotId;
    final labels = <Map<String, dynamic>>[];

    _liveLots.forEach((id, lot) {
      final isBest = id == bestId;
      final status = lot['status'] as String; // empty without sensors
      labels.add(_pointFeature(lot['position'] as LatLng, {
        'label': status.isEmpty ? '${lot['name']}' : '${lot['name']}\n$status',
        // Live status colour from _parseLots (green / amber / red).
        'color': _hex(lot['color'] as Color),
        'best': isBest,
      }));
    });

    _sync.push(_srcLots, _fc(labels));
  }

  void _pushBuildings() {
    final selectedId = _selectedBuilding?.id;
    _sync.push(
      _srcBuildings,
      _fc([
        for (final b in _place.buildings)
          _pointFeature(b.position, {
            'code': b.code,
            'selected': b.id == selectedId,
          }),
      ]),
    );
  }

  void _pushRoute() {
    _sync.push(
      _srcRoute,
      _fc(_displayRoute.length < 2
          ? const <Map<String, dynamic>>[]
          : [
              {
                'type': 'Feature',
                'properties': <String, dynamic>{},
                'geometry': {
                  'type': 'LineString',
                  'coordinates': [for (final p in _displayRoute) _coord(p)],
                },
              },
            ]),
    );
    _pushWalk();
  }

  // ---- walking line ----

  static const Duration _walkRevealTime = Duration(milliseconds: 700);
  Timer? _walkRevealTimer;
  String? _walkShownFor; // lot|building currently drawn (avoids re-animating)

  Map<String, dynamic> _lineFeature(List<LatLng> pts) => {
        'type': 'Feature',
        'properties': <String, dynamic>{},
        'geometry': {
          'type': 'LineString',
          'coordinates': [for (final p in pts) _coord(p)],
        },
      };

  /// The first [meters] of [pts] (the line "drawing itself" from the lot).
  static List<LatLng> _pathPrefix(List<LatLng> pts, double meters) {
    final out = <LatLng>[pts.first];
    var left = meters;
    for (var i = 0; i < pts.length - 1; i++) {
      final d = Geo.meters(pts[i], pts[i + 1]);
      if (d >= left) {
        out.add(Geo.lerp(pts[i], pts[i + 1], d == 0 ? 0 : left / d));
        return out;
      }
      left -= d;
      out.add(pts[i + 1]);
    }
    return out;
  }

  /// Shows the A* walking path from the lot to the building only after
  /// arriving at the lot; hidden the rest of the time. When it first appears
  /// it draws itself out from the lot toward the building.
  void _pushWalk() {
    final walk = _walkResult;
    final building = _selectedBuilding;
    final show = _arrived &&
        !_walkDone && // already walked to the building
        walk != null &&
        building != null &&
        walk.pathPoints.length >= 2;

    if (!show) {
      _walkPath = const [];
      if (_walkShownFor != null || _walkRevealTimer != null) {
        _walkRevealTimer?.cancel();
        _walkRevealTimer = null;
        _walkShownFor = null;
        _sync.push(_srcWalk, _fc(const <Map<String, dynamic>>[]));
      }
      return;
    }

    final key = '${walk.lotId}|${walk.unitId}|${building.id}';
    if (_walkShownFor == key) return; // already drawn (or drawing)
    _walkShownFor = key;
    // Start of the walk: lot -> building.
    if (mounted) setState(() => _setWalkPath(walk.pathPoints));
    _revealWalk(_walkPath);
  }

  /// Draws [pts] as the walking line, "drawing itself" from its start.
  void _revealWalk(List<LatLng> pts) {
    _walkRevealTimer?.cancel();
    _walkRevealTimer = null;
    if (pts.length < 2) return;
    if (reduceMotion(context)) {
      _sync.push(_srcWalk, _fc([_lineFeature(pts)]));
      return;
    }
    final total = Geo.pathLength(pts);
    final start = DateTime.now();
    _walkRevealTimer = Timer.periodic(_revealFrame, (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      final t = (DateTime.now().difference(start).inMilliseconds /
              _walkRevealTime.inMilliseconds)
          .clamp(0.0, 1.0);
      final eased = kEaseOut.transform(t);
      final part = t >= 1 ? pts : _pathPrefix(pts, total * eased);
      if (part.length >= 2) _sync.push(_srcWalk, _fc([_lineFeature(part)]));
      if (t >= 1) {
        timer.cancel();
        _walkRevealTimer = null;
      }
    });
  }

  void _pushPuck() {
    _wake(); // the arrow and cone ease into their (maybe new) directions
    final p = _shownPos ?? _userPos;
    if (p == null) {
      _sync.push(_srcPuck, _fc(const <Map<String, dynamic>>[]));
      return;
    }
    // Driving a route: the navigation arrow, like Google/Apple Maps. The
    // rest of the time: a dot, plus a cone showing which way the device
    // faces when it has a compass.
    final arrow = _drivingRoute;
    _sync.push(
      _srcPuck,
      _fc([
        _pointFeature(p, {
          'icon': arrow ? _puckArrowImage : _puckDotImage,
          'bearing': _shownBearing,
          if (!arrow && _compassWorks == true) ...{
            'cone': _coneImage(),
            'facing': _shownFacing,
          },
        }),
      ]),
    );
  }

  /// Driving along a route right now (or simulating it).
  bool get _drivingRoute =>
      _isSimulating ||
      (_fullRoute.length >= 2 &&
          !_arrived &&
          DateTime.now().difference(_gpsCourseAt) < _drivingSnapHold);

  /// Cone width from the compass accuracy: narrow when it's sure.
  String _coneImage() {
    final acc = _compassAccuracy;
    if (acc == null) return 'sc-cone-mid';
    if (acc <= 20) return 'sc-cone-narrow';
    if (acc <= 35) return 'sc-cone-mid';
    return 'sc-cone-wide';
  }

  // ==========================================
  // CAMERA
  // ==========================================

  void _animateTo(CameraPosition p, Duration d) {
    final m = _map;
    if (m == null) return;
    // Outside focus mode, drop the leftover "arrow low" padding first; the
    // animation that follows hides the shift.
    if (!_navTracking) _clearNavPadding();
    // Don't mistake our own animation for the user moving the map.
    _camAnimUntil = DateTime.now().add(d + const Duration(milliseconds: 150));
    _guard(() => m.animateCamera(CameraUpdate.newCameraPosition(p), duration: d));
  }

  /// Called for every camera change. In focus mode, a camera that isn't where
  /// the app put it means the user dragged, zoomed, rotated or tilted the map,
  /// so focus mode switches off and leaves the camera where they put it.
  /// When the camera comes to rest after a gesture, ease any tilt steeper
  /// than [_maxTilt] back to it (the plugin has no max-pitch setting), so the
  /// map never sits at a horizon view that drops frames.
  void _onCameraIdle() {
    if (_openLotId != null) _updateLotAnchor(); // settle the lot bubble
    final m = _map;
    final cam = m?.cameraPosition;
    if (m == null || cam == null || !_styleReady) return;
    if (DateTime.now().isBefore(_camAnimUntil)) return;
    if (cam.tilt > _maxTilt + 0.5) {
      _guard(() => m.animateCamera(
            CameraUpdate.tiltTo(_maxTilt),
            duration: const Duration(milliseconds: 350),
          ));
    }
  }

  /// Camera reports in a row that disagree with where the app put the camera.
  int _camOffCount = 0;

  void _onCameraMove(CameraPosition cam) {
    // Keep the lot bubble on top of its dot while the map moves.
    if (_openLotId != null) _updateLotAnchor();
    if (!_navTracking || _sentCams.isEmpty) return;
    if (DateTime.now().isBefore(_camAnimUntil)) {
      _camOffCount = 0;
      return;
    }
    // The app changes zoom and tilt only in its own (remembered) steps, so
    // a zoom or tilt that none of them had is the user, straight away
    // (catches the very first frame of a mouse-wheel zoom).
    final zoomTiltOurs = _sentCams.any((c) =>
        (c.zoom - cam.zoom).abs() <= 0.02 && (c.tilt - cam.tilt).abs() <= 0.5);
    if (!zoomTiltOurs) {
      _setNavTracking(false, userGesture: true);
      return;
    }
    final ours = _sentCams.any((c) =>
        Geo.meters(c.target, cam.target) <= 2.0 &&
        Geo.shortestAngle(c.bearing, cam.bearing).abs() <= 3);
    if (ours) {
      _camOffCount = 0;
      return;
    }
    // A real drag sends a stream of camera reports, so needing two in a row
    // still reacts instantly but ignores a single stray report.
    if (++_camOffCount >= 2) {
      _camOffCount = 0;
      _setNavTracking(false, userGesture: true);
    }
  }

  /// Shifts the map's focal point down so the arrow sits at [_navPuckY].
  /// Applied instantly (not animated): an animated padding change is
  /// cancelled by the camera move that follows it, which is why the arrow
  /// used to stay in the middle of the screen.
  Future<void> _applyNavPadding(MapLibreMapController m) async {
    final h = _mapHeight > 0 ? _mapHeight : MediaQuery.of(context).size.height;
    // Centre of the padded viewport = (top + h) / 2 = h * _navPuckY.
    final top = h * (2 * _navPuckY - 1);
    _navPaddingOn = true;
    try {
      await m.setPadding(top: top);
    } catch (e) {
      debugPrint('[map] $e');
    }
  }

  /// Removes the focus-mode padding (no-op if it is already off).
  void _clearNavPadding() {
    final m = _map;
    if (m == null || !_navPaddingOn) return;
    _navPaddingOn = false;
    _guard(() => m.setPadding());
  }

  /// Turns focus mode on or off.
  ///
  /// Turning it off never moves the camera: it stays at the same place, zoom
  /// and angle and simply stops following the arrow (so it never fights a
  /// gesture that turned it off). Turning it on, the camera blends from
  /// where it is onto the arrow, which may be moving, over [_focusEntryTime].
  Future<void> _setNavTracking(bool on, {bool userGesture = false}) async {
    final m = _map;
    if (_navTracking == on) return;
    setState(() => _navTracking = on);
    if (!on) {
      _followReady = false;
      _focusEntryFrom = null;
      _camPending = null;
      return;
    }
    if (m == null) return;

    // The padding shift below also reports a camera move; ignore it.
    _camAnimUntil = DateTime.now().add(const Duration(milliseconds: 400));
    _sentCams.clear();
    _lastSentCam = null;
    await _applyNavPadding(m);
    if (!mounted || !_navTracking) return;
    _followZoom = _navZoom;
    _followTilt = _is3D ? _navTilt : 0;
    _focusEntryFrom = m.cameraPosition;
    _focusEntryAt = DateTime.now();
    _followReady = true;
    _wake();
  }

  void _toggle3D() {
    final m = _map;
    setState(() => _is3D = !_is3D);
    if (m == null) return;
    if (_navTracking) {
      // Focus mode: the camera eases to the new zoom and tilt every frame
      // while it keeps following the arrow.
      _wake();
      return;
    }
    final tilt = _is3D ? _overviewTilt : 0.0;
    _guard(() => m.animateCamera(
          CameraUpdate.tiltTo(tilt),
          duration: const Duration(milliseconds: 700),
        ));
  }

  void _resetView() {
    _clearDestination();
    if (_navTracking) _setNavTracking(false);
    _animateTo(
      CameraPosition(
        target: _place.center,
        zoom: _overviewZoom,
        bearing: 0,
        tilt: _is3D ? _overviewTilt : 0,
      ),
      const Duration(milliseconds: 1000),
    );
  }

  // ==========================================
  // SENSORS
  // ==========================================

  void _startCompassTracking() {
    // A real compass always wobbles a little, so no reading other than
    // exactly 0° within a few seconds means there's no compass sensor.
    _compassCheckTimer = Timer(const Duration(seconds: 5), () {
      if (mounted && _compassWorks == null) {
        setState(() => _compassWorks = false);
      }
    });
    _compassSub = FlutterCompass.events?.listen((event) {
      final reading = event.heading;
      if (!mounted || reading == null) return;
      if (reading != 0 && _compassWorks != true) {
        _shownFacing = reading % 360.0; // the cone starts out pointing right
        setState(() => _compassWorks = true);
      }
      // Exactly 0° before any real reading: no sensor, don't point north.
      if (_compassWorks != true) return;

      // `heading` is where the top of the device points. (On Android the
      // plugin never fills in headingForCameraMode and sends 0, which
      // pinned the arrow to north; `heading` already allows for how the
      // device is tilted.)
      final h = reading % 360.0;
      _compassAccuracy = event.accuracy;

      // The facing cone always shows which way the device really points
      // (the frame loop turns it there smoothly).
      if (Geo.shortestAngle(_compassHeading, h).abs() >= 1.5) {
        _compassHeading = h;
        if (_devMode) {
          setState(() {}); // the dev readout shows the compass value
        }
        _wake();
      }

      // While the position is dev-controlled (Simulate Run/Walk, tap-move,
      // teleport) the direction comes from that movement. The device compass
      // must not steer it: on a computer it often reports 0° (north), which
      // fought the walk's direction and made the arrow/camera flip back and
      // forth.
      if (_isSimulating || _isWalkSim || _devLocationOverride) return;
      if (DateTime.now().difference(_gpsCourseAt) <
          const Duration(seconds: 3)) {
        return; // GPS course wins while driving
      }
      if (Geo.shortestAngle(_heading, h).abs() < 2.0) return;

      // The arrow (and in focus mode the camera) turns toward it smoothly in
      // the frame loop; no camera animation is restarted per reading.
      setState(() => _heading = h);
      _wake();
    });
  }

  Future<void> _startLiveLocationTracking() async {
    setState(() {
      _isLocating = true;
      _gpsStatus = 'Requesting GPS permissions...';
    });

    void fail(String msg) {
      if (!mounted) return;
      setState(() {
        _isLocating = false;
        _gpsStatus = msg;
      });
    }

    try {
      if (!await geo.Geolocator.isLocationServiceEnabled()) {
        return fail('Location services disabled.');
      }
      var permission = await geo.Geolocator.checkPermission();
      if (permission == geo.LocationPermission.denied) {
        permission = await geo.Geolocator.requestPermission();
        if (permission == geo.LocationPermission.denied) {
          return fail('GPS permission denied.');
        }
      }
      if (permission == geo.LocationPermission.deniedForever) {
        return fail('GPS permanently denied.');
      }

      final initial = await geo.Geolocator.getCurrentPosition(
        locationSettings: const geo.LocationSettings(accuracy: geo.LocationAccuracy.high),
      );
      if (!mounted) return;
      _handlePosition(initial);
      if (_selectedBuilding != null && _fullRoute.isEmpty) {
        _updateNavigationRoute();
      }

      _positionSub = geo.Geolocator.getPositionStream(
        locationSettings: _streamSettings(),
      ).listen(
        _handlePosition,
        onError: (Object e) => fail('GPS stream error: $e'),
      );
    } catch (e) {
      fail('Error reading GPS: $e');
    }
  }

  /// Where the arrow should glide to for a new fix (and its distance along
  /// the route when it's on the road). The glide takes about as long as the
  /// gap between fixes, so aiming at the fix itself always showed where you
  /// were a second ago. Moving, it aims at where you'll be by the time it
  /// gets there (your speed and direction, along the road when driving the
  /// route), like Google Maps; standing still, at the fix itself.
  (LatLng, double?) _leadTarget(geo.Position p) {
    final pos = _userPos!;
    final along = _arrowOnRoute ? _snapAlong : null;
    final moving = p.speed >= GpsSmoother._minMovingSpeed && p.heading >= 0;
    if (!moving) return (pos, along);

    // Where you'll be when the glide ends, capped so a burst of speed or a
    // long gap can't throw the arrow far ahead.
    final glide = _nextGlideDuration();
    final ahead = math.min(p.speed * glide.inMilliseconds / 1000, 40.0);

    if (along != null) {
      final s = math.min(along + ahead, _routeSuffix.first);
      return (Geo.pointAlong(_fullRoute, _routeSuffix, s).point, s);
    }
    return (Geo.offset(pos, p.heading, ahead), null);
  }

  /// Live GPS stream settings. Without an interval, Android delivers a fix
  /// only every 5 s (the plugin's default): 100 m apart at 45 mph, so the
  /// arrow lagged far behind the car and jumped. Ask for them as often as
  /// the phone can deliver.
  /// No minimum distance: at walking pace a 2 m minimum meant a fix only
  /// every ~1.5 s (GpsSmoother keeps standing-still jitter off the map).
  static geo.LocationSettings _streamSettings() {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return geo.AndroidSettings(
        accuracy: geo.LocationAccuracy.bestForNavigation,
        distanceFilter: 0,
        // As often as the phone can; most GPS chips give one a second.
        intervalDuration: const Duration(milliseconds: 500),
      );
    }
    return const geo.LocationSettings(
      accuracy: geo.LocationAccuracy.bestForNavigation,
      distanceFilter: 0,
    );
  }

  void _handlePosition(geo.Position p) {
    if (!mounted) return;
    if (_isSimulating || _devLocationOverride) return;

    // Weighted by the fix's accuracy, so a poor fix (indoors, between
    // buildings) doesn't throw the arrow around.
    final loc = _gpsSmoother.add(
      LatLng(p.latitude, p.longitude),
      accuracy: p.accuracy,
      speed: p.speed,
      heading: p.heading,
      at: DateTime.now(),
    );
    final onCampus = _inCampus(loc);
    // Direction of travel from GPS only at driving speed; walking or
    // standing, the compass shows which way you face (like Google Maps).
    final steadyCourse = p.speed >= _minCourseSpeed && p.heading >= 0;
    // No compass on this device: walking, the direction you're moving is
    // the best guess at which way you face.
    final walkingCourse = _compassWorks == false &&
        p.speed >= GpsSmoother._minMovingSpeed &&
        p.heading >= 0;
    var progress = _Progress.none;
    final wasTracking = _navTracking;

    setState(() {
      _isLocating = false;
      _gpsAccuracy = p.accuracy > 0 ? p.accuracy : null;
      _gpsStatus =
          'Live GPS: ${p.latitude.toStringAsFixed(4)}, ${p.longitude.toStringAsFixed(4)}';
      if (steadyCourse || walkingCourse) _heading = p.heading;
      if (steadyCourse) {
        _gpsCourse = p.heading;
        _gpsCourseAt = DateTime.now();
      }
      progress = _updateRouteProgress(
        loc,
        course: steadyCourse ? p.heading : null,
      );
      // Driving the route: the arrow sits on the road (phone GPS is a few
      // meters off, your lane plus GPS error). Otherwise it's exactly where
      // GPS says you are, e.g. at home after picking a building.
      _arrowOnRoute = _routeSnap != null &&
          DateTime.now().difference(_gpsCourseAt) < _drivingSnapHold;
      _userPos = _arrowOnRoute ? _routeSnap! : loc;
    });

    // Leaving campus ends focus mode (dev mode keeps following you).
    if (wasTracking && !onCampus && !_devMode) {
      _setNavTracking(false);
    }
    // Moves the arrow (and nav camera) smoothly to the new position; on the
    // road it follows the road around corners.
    final (target, targetAlong) = _leadTarget(p);
    _startGlide(target, along: targetAlong);

    if (progress == _Progress.arrived) _onArrived();
    // Parked and walking: follow the walking line (and reroute if needed).
    if (_arrived) _trackWalk(loc, p.accuracy);
    if (progress == _Progress.offRoute &&
        p.accuracy <= _maxGpsAccuracyForReroute) {
      _maybeReroute();
    }
  }

  /// Starts (or retargets) the arrow glide toward a new position (a GPS fix,
  /// or the next simulated position). In focus mode the camera eases along
  /// with it over the same time. [along] is the target's distance along the
  /// driving route when it's on the route; the arrow then follows the road
  /// around corners instead of cutting straight across them.
  void _startGlide(LatLng target, {double? along}) {
    final from = _shownPos ?? _userPos;
    final duration = _nextGlideDuration();
    _lastFixAt = DateTime.now();

    // First fix, or a jump too big to be driving: just place the arrow
    // (and draw it there, so the next position glides on from it). The
    // focus camera follows it on the next frame.
    if (from == null || Geo.meters(from, target) > _glideSnapMeters) {
      _stopGlide();
      _shownPos = target;
      _shownAlong = along;
      _glideRoute = _fullRoute;
      _shownBearing = _puckBearing(); // no spinning round after a jump
      _pushPuck();
      _pushRoute();
      return;
    }

    // Where the drawn arrow is along the route, if known. (Nothing drawn
    // yet: it's at _userPos, which may not be [target] when aiming ahead,
    // so that first glide goes straight.)
    final fromAlong = _shownPos != null && identical(_glideRoute, _fullRoute)
        ? _shownAlong
        : null;
    _glideBetween(
      from,
      target,
      duration,
      fromAlong: fromAlong,
      toAlong: along,
    );
  }

  /// How long the next glide takes: a bit longer than the gap since the
  /// last fix ([_glideStretch]), so the arrow never stops between fixes.
  Duration _nextGlideDuration() {
    final gap = DateTime.now().difference(_lastFixAt).inMilliseconds;
    final ms = (gap * _glideStretch).round().clamp(300, 1800);
    return Duration(milliseconds: ms);
  }

  /// Glides the arrow from [from] to [to] over [d]: along the current route
  /// when both ends' distances along it are known, otherwise straight.
  void _glideBetween(
    LatLng from,
    LatLng to,
    Duration d, {
    double? fromAlong,
    double? toAlong,
  }) {
    _glideFrom = from;
    _glideTo = to;
    _glideRoute = _fullRoute;
    _glideFromAlong = fromAlong;
    _glideToAlong = toAlong;
    _glideStart = DateTime.now();
    _glideDuration = d;
    _gliding = true;
    _wake();
  }

  /// One frame of the arrow's glide (run by the frame loop).
  void _glideStep() {
    final from = _glideFrom;
    final to = _glideTo;
    if (from == null || to == null) {
      _gliding = false;
      return;
    }
    final elapsed = DateTime.now().difference(_glideStart).inMilliseconds;
    final t = (elapsed / _glideDuration.inMilliseconds).clamp(0.0, 1.0);

    // Along the road when both ends are on the route (and it hasn't been
    // replaced since); otherwise in a straight line.
    final fa = _glideFromAlong;
    final ta = _glideToAlong;
    final sameRoute =
        identical(_glideRoute, _fullRoute) && _fullRoute.length >= 2;
    final LatLng pos;
    int? seg;
    if (sameRoute && fa != null && ta != null) {
      final s = fa + (ta - fa) * t;
      final at = Geo.pointAlong(_fullRoute, _routeSuffix, s);
      pos = at.point;
      seg = at.seg;
      _shownAlong = s;
    } else {
      pos = Geo.lerp(from, to, t);
      _shownAlong = (t >= 1 && sameRoute) ? ta : null;
    }
    _shownPos = pos;
    if (t >= 1) _gliding = false;
    _pushPuck();

    // The lines follow the arrow about 10 times a second (rebuilt only
    // then, not every frame).
    final now = DateTime.now();
    if (t < 1 && now.difference(_lastRoutePushAt) < _routePushEvery) return;
    _lastRoutePushAt = now;
    // The route line starts at the arrow while you're on the route (arrow
    // -> nearest point of the road -> on to the lot). Off it, the line stays
    // where you left it until the reroute, instead of a diagonal from the
    // arrow to a point of the old route.
    if (_routeSnap != null && _displayRoute.length >= 2) {
      _displayRoute = seg != null
          ? [pos, ..._fullRoute.sublist(seg + 1)]
          : [pos, ..._displayRoute.skip(1)];
      _pushRoute();
    }
    if (_walkActive) _drawWalkLine(pos);
  }

  /// Cancels any glide and draws the arrow at the real position again.
  void _stopGlide() {
    _gliding = false;
    _glideFrom = null;
    _glideTo = null;
    _glideFromAlong = null;
    _glideToAlong = null;
    _shownPos = null;
    _shownAlong = null;
  }

  // ---- frame loop ----

  /// Starts the frame loop if it isn't running (it stops itself when idle).
  void _wake() {
    if (mounted && !_frameTicker.isActive) {
      _lastFrameAt = null;
      _frameTicker.start();
    }
  }

  /// Runs once per screen frame while anything moves or turns, and all the
  /// time in focus mode: turns the arrow and the cone, glides the arrow,
  /// and puts the focus camera on it.
  void _onFrame(Duration elapsed) {
    if (!mounted) return;
    final last = _lastFrameAt;
    _lastFrameAt = elapsed;
    final dt = last == null ? 1 / 60 : (elapsed - last).inMicroseconds / 1e6;

    final bearing =
        _approachAngle(_shownBearing, _puckBearing(), dt, _turnSmoothing);
    final facing =
        _approachAngle(_shownFacing, _compassHeading, dt, _turnSmoothing);
    final turning = bearing != _shownBearing || facing != _shownFacing;
    _shownBearing = bearing;
    _shownFacing = facing;

    final gliding = _gliding;
    if (gliding) {
      _glideStep(); // also draws the arrow
    } else if (turning) {
      _pushPuck();
    }
    if (_navTracking) _followCamera(dt);
    if (!gliding && !turning && !_navTracking) _frameTicker.stop();
  }

  /// Moves angle [from] toward [to] the shortest way round, about 63% of the
  /// way every [tau] seconds; lands exactly on [to] once within 0.1°.
  static double _approachAngle(double from, double to, double dt, double tau) {
    final d = Geo.shortestAngle(from, to);
    if (d.abs() < 0.1) return to % 360;
    return (from + d * (1 - math.exp(-dt / tau))) % 360;
  }

  /// The same for a plain number (zoom, tilt).
  static double _approach(double from, double to, double dt, double tau) {
    final d = to - from;
    if (d.abs() < 0.001) return to;
    return from + d * (1 - math.exp(-dt / tau));
  }

  /// Focus mode, every frame: the camera exactly on the arrow, facing the
  /// arrow's (smoothed) direction, so the arrow stays pinned on screen and
  /// points straight up. Zoom and tilt ease to their targets (2D/3D switch).
  /// For [_focusEntryTime] after focus mode is turned on, the camera blends
  /// from where it was onto the arrow, which may be moving.
  void _followCamera(double dt) {
    final pos = _shownPos ?? _userPos;
    if (!_followReady || pos == null || !_styleReady) return;

    _followZoom = _approach(_followZoom, _navZoom, dt, _zoomSmoothing);
    _followTilt =
        _approach(_followTilt, _is3D ? _navTilt : 0.0, dt, _zoomSmoothing);
    var cam = CameraPosition(
      target: pos,
      zoom: _followZoom,
      bearing: _shownBearing,
      tilt: _followTilt,
    );

    final from = _focusEntryFrom;
    if (from != null) {
      final raw = DateTime.now().difference(_focusEntryAt).inMicroseconds /
          _focusEntryTime.inMicroseconds;
      if (raw >= 1) {
        _focusEntryFrom = null;
      } else {
        final e = Curves.easeInOutCubic.transform(raw);
        cam = CameraPosition(
          target: Geo.lerp(from.target, cam.target, e),
          zoom: from.zoom + (cam.zoom - from.zoom) * e,
          bearing: (from.bearing +
                  Geo.shortestAngle(from.bearing, cam.bearing) * e) %
              360,
          tilt: from.tilt + (cam.tilt - from.tilt) * e,
        );
      }
    }
    _sendCamera(cam);
  }

  /// Sends a focus-mode camera position, remembering it for the gesture
  /// check. One move is in flight at a time; while it is, newer positions
  /// replace each other, so the map never falls behind.
  void _sendCamera(CameraPosition cam) {
    final last = _lastSentCam;
    if (last != null &&
        Geo.meters(last.target, cam.target) < 0.01 &&
        Geo.shortestAngle(last.bearing, cam.bearing).abs() < 0.01 &&
        (last.zoom - cam.zoom).abs() < 0.0005 &&
        (last.tilt - cam.tilt).abs() < 0.01) {
      return; // nothing moved
    }
    _lastSentCam = cam;
    _sentCams.add(cam);
    if (_sentCams.length > _sentCamMemory) _sentCams.removeAt(0);
    if (_camBusy) {
      _camPending = cam;
      return;
    }
    _moveCamera(cam);
  }

  Future<void> _moveCamera(CameraPosition cam) async {
    final m = _map;
    if (m == null) return;
    _camBusy = true;
    try {
      await m.moveCamera(CameraUpdate.newCameraPosition(cam));
    } catch (e) {
      debugPrint('[map] $e');
    } finally {
      _camBusy = false;
    }
    final next = _camPending;
    _camPending = null;
    if (next != null && _navTracking && mounted) _moveCamera(next);
  }

  Future<void> _resyncRealGps() async {
    try {
      final p = await geo.Geolocator.getCurrentPosition(
        locationSettings: const geo.LocationSettings(
          accuracy: geo.LocationAccuracy.high,
          timeLimit: Duration(seconds: 5),
        ),
      );
      _handlePosition(p);
      if (_selectedBuilding != null) _updateNavigationRoute();
    } catch (_) {}
  }

  Future<LatLng?> _quickFix() async {
    try {
      final p = await geo.Geolocator.getCurrentPosition(
        locationSettings: const geo.LocationSettings(
          accuracy: geo.LocationAccuracy.medium,
          timeLimit: Duration(seconds: 3),
        ),
      );
      return LatLng(p.latitude, p.longitude);
    } catch (_) {
      return null;
    }
  }

  // ==========================================
  // LIVE PARKING DATA
  // ==========================================

  // The lot data itself is worked out by functions shared with the
  // assistant (see LIVE PARKING DATA above the map screen).
  Map<String, Map<String, dynamic>> _parseLots(
    Object? rawLotsValue,
    Object? rawUnitsValue,
  ) =>
      parseLiveLots(_place, rawLotsValue, rawUnitsValue);

  Map<String, Map<String, dynamic>> _staticLots() => staticLots(_place);

  static String? _freeText(Map<String, dynamic> lot) => lotFreeText(lot);

  // Latest raw `lots/` and `units/` snapshots, and whether each has arrived.
  Object? _rawLots;
  Object? _rawUnits;
  bool _gotLots = false;
  bool _gotUnits = false;

  /// Live curb data: every unit in `units/` (each names its lot) and the
  /// lot names in `lots/`. Recomputed whenever either one changes.
  void _listenToFirebaseParking() {
    if (!_place.liveParking) {
      _liveLots = _staticLots(); // nothing live to listen to
      return;
    }
    final db = FirebaseDatabase.instance;
    _unitsSub = db.ref('units').onValue.listen((event) {
      _rawUnits = event.snapshot.value;
      _gotUnits = true;
      _onParkingData();
    });
    _lotsSub = db.ref('lots').onValue.listen((event) {
      _rawLots = event.snapshot.value;
      _gotLots = true;
      _onParkingData();
    });
  }

  void _onParkingData() {
    // Wait for both, so a lot never flashes as empty before its units load.
    if (!mounted || !_gotUnits || !_gotLots) return;
    final lots = _parseLots(_rawLots, _rawUnits);
    setState(() => _liveLots = lots);

    final building = _selectedBuilding;
    // Parked, or nearly at the curb: keep it. A curb that fills up now is
    // almost certainly you pulling into it.
    if (building == null || _arrived || _closeToTargetCurb) {
      _pushOverlays();
      return;
    }

    final best = _bestParking(building);

    // Only hit OSRM when the place to park actually changes.
    if (best?.lotId != _routeLotId || best?.unitId != _routeUnitId) {
      _updateNavigationRoute();
    } else if (_fullRoute.isEmpty && !_isRouting) {
      _updateNavigationRoute();
    } else if (best != null) {
      setState(() => _walkResult = best);
    }
    _pushOverlays();
  }

  /// Within this of the target curb, it is kept even if it turns occupied.
  static const double _keepCurbMeters = 40;

  bool get _closeToTargetCurb =>
      _routeUnitId != null &&
      _fullRoute.length >= 2 &&
      _routeRemaining <= _keepCurbMeters;

  /// Where to park for [building] (see [bestParkingFor]).
  PathResult? _bestParking(PlaceBuilding building) =>
      bestParkingFor(_place, building, _liveLots);

  // ==========================================
  // ROUTING
  // ==========================================

  static List<double> _suffixLengths(List<LatLng> r) {
    final s = List<double>.filled(r.length, 0.0);
    for (var i = r.length - 2; i >= 0; i--) {
      s[i] = s[i + 1] + Geo.meters(r[i], r[i + 1]);
    }
    return s;
  }

  Future<void> _updateNavigationRoute() async {
    final building = _selectedBuilding;
    if (building == null || _liveLots.isEmpty) return;

    final reqId = ++_routeRequestId;
    final best = _bestParking(building);

    if (best == null) {
      setState(() {
        _walkResult = null;
        _routeLotId = null;
        _routeUnitId = null;
        _isRouting = false;
        _clearDrivingRoute();
      });
      _pushOverlays();
      _pushRoute();
      return;
    }

    // A curb is driven into from its open end: the road route goes to the
    // lane behind its row, and the drive-in path finishes the route.
    final approach = best.unitId == null ? null : _place.spotApproach[best.unitId];
    final dest = approach?.first ?? best.parkAt;
    setState(() {
      _walkResult = best;
      _isRouting = true;
    });
    _pushOverlays();
    _lastRouteAt = DateTime.now();

    final start = _userPos ?? await _quickFix() ?? _place.entrance;
    if (!mounted || reqId != _routeRequestId) return;

    var road = await RealRoadRouter.getRoadRoute(
      start: start,
      destination: dest,
      startHeading: _routeStartHeading(),
    );
    if (!mounted || reqId != _routeRequestId) return;
    if (approach != null) {
      road = [
        ...road,
        if (Geo.meters(road.last, approach.first) > 1) approach.first,
        ...approach.skip(1),
      ];
    }

    setState(() {
      _isRouting = false;
      _routeLotId = best.lotId;
      _routeUnitId = best.unitId;
      _fullRoute = road;
      _routeSuffix = _suffixLengths(road);
      _routeSeg = 0;
      _routeSnap = null;
      _arrived = false;
      _walkDone = false;
      _displayRoute = List<LatLng>.of(road);
      _routeRemaining = _routeSuffix.first;
    });

    // Match where you are to the new route right away (which way the arrow
    // points; in focus mode the camera turns with it, smoothly).
    final pos = _userPos;
    var progress = _Progress.none;
    if (pos != null) setState(() => progress = _updateRouteProgress(pos));
    _pushRoute();
    _pushPuck();
    if (progress == _Progress.arrived) _onArrived();
  }

  /// The car's direction of travel for a route request: a GPS course from
  /// the last few seconds while clearly moving, otherwise null.
  double? _routeStartHeading() {
    if (_devLocationOverride) return null;
    final fresh =
        DateTime.now().difference(_gpsCourseAt) < const Duration(seconds: 3);
    return fresh ? _gpsCourse : null;
  }

  void _maybeReroute() {
    if (_isRouting || _selectedBuilding == null) return;
    if (DateTime.now().difference(_lastRouteAt) < _rerouteCooldown) return;
    _updateNavigationRoute();
  }

  /// Must be called inside setState.
  void _clearDrivingRoute() {
    _fullRoute = const [];
    _routeSuffix = const [];
    _displayRoute = const [];
    _routeSeg = 0;
    _routeRemaining = 0;
    _routeSnap = null;
    _arrowOnRoute = false;
    _arrived = false;
    _walkDone = false;
  }

  _RouteProjection _project(LatLng p, int from, int to) {
    var best = _RouteProjection(from, _fullRoute[from], double.infinity);
    for (var i = from; i <= to; i++) {
      final a = _fullRoute[i];
      final b = _fullRoute[i + 1];
      final q = Geo.lerp(a, b, Geo.projectT(p, a, b));
      final d = Geo.meters(p, q);
      if (d < best.dist) best = _RouteProjection(i, q, d);
    }
    return best;
  }

  /// Mutates state only — call inside setState.
  ///
  /// Matches [pos] to the route (progress, arrival, leaving it). It never
  /// moves the arrow. While you're on the route, [_routeSnap] is the nearest
  /// point of it, where the route line joins the road. [course] (the GPS
  /// course, when moving fast enough to trust it) must roughly agree with
  /// the road's direction; on the other side of a divided road the arrow
  /// keeps its own direction instead of the route's.
  _Progress _updateRouteProgress(LatLng pos, {double? course}) {
    _routeSnap = null;
    final route = _fullRoute;
    if (route.length < 2 || _arrived) return _Progress.none;

    final proj = _project(
      pos,
      math.max(0, _routeSeg - 2),
      math.min(route.length - 2, _routeSeg + 25),
    );
    if (proj.dist > _offRouteMeters) return _Progress.offRoute;

    _routeSeg = proj.seg;
    _routeRemaining =
        Geo.meters(proj.point, route[proj.seg + 1]) + _routeSuffix[proj.seg + 1];

    if (_routeRemaining <= _arrivalMeters) {
      _arrived = true;
      _displayRoute = const [];
      return _Progress.arrived;
    }
    // The line goes from you to the nearest point of the road, then along
    // it (not straight from you to the next bend of the route, which drew
    // a diagonal across the map).
    _displayRoute = [pos, proj.point, ...route.sublist(proj.seg + 1)];

    bool alongSegment(int i) {
      if (i < 0 || i > route.length - 2) return false;
      final a = route[i];
      final b = route[i + 1];
      return Geo.meters(a, b) < 1 || // too short to have a direction
          Geo.shortestAngle(course!, Geo.bearing(a, b)).abs() <=
              _snapMaxHeadingDiff;
    }

    final headingOk = course == null ||
        alongSegment(proj.seg) ||
        alongSegment(proj.seg - 1) ||
        alongSegment(proj.seg + 1);
    if (headingOk) _routeSnap = proj.point;
    return _Progress.onRoute;
  }

  /// How far along the route the arrow is when it's drawn on it.
  double? get _snapAlong =>
      _routeSnap == null ? null : _routeSuffix.first - _routeRemaining;

  void _onArrived() {
    if (!mounted) return;
    // Parked: clear the finished driving line and show the walk to the
    // building (_pushRoute also pushes the walking line).
    _pushRoute();
    final lotName = _liveLots[_routeLotId]?['name'] ?? 'the lot';
    final place = _routeUnitId != null ? '$_routeUnitId in $lotName' : lotName;
    final walk = _walkResult;
    final building = _selectedBuilding;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          walk != null && building != null
              ? 'Arrived at $place. About ${formatDistance(walk.totalDistanceMeters)} walk to ${building.code}.'
              : 'Arrived at $place.',
        ),
      ),
    );
  }

  void _onBuildingSelected(PlaceBuilding building) {
    _stopSimulation();
    _searchCtrl.text = building.name; // also covers picks made by map tap
    setState(() {
      _selectedBuilding = building;
      _routeLotId = null;
      _routeUnitId = null;
      _clearDrivingRoute();
      _walkResult = _bestParking(building);
    });
    _pushOverlays();
    _pushRoute();
    _updateNavigationRoute();

    final m = _map;
    if (m == null || _navTracking) return; // already following you
    // Picking a destination starts guidance from where you are: the camera
    // goes to your live position in focus mode (the route appears as soon
    // as it's calculated).
    if (_userPos != null && _canFocus) {
      _setNavTracking(true);
      return;
    }
    // Nothing to follow here (no GPS fix yet, or off campus outside dev
    // mode, where the map can't go): show the destination instead.
    _clearNavPadding();
    _guard(() => m.animateCamera(
          CameraUpdate.newLatLngZoom(building.position, 17.0),
          duration: const Duration(milliseconds: 900),
        ));
  }

  void _clearDestination() {
    _stopSimulation();
    _routeRequestId++; // cancel any in-flight route request
    _searchCtrl.clear();
    setState(() {
      _selectedBuilding = null;
      _walkResult = null;
      _routeLotId = null;
      _routeUnitId = null;
      _isRouting = false;
      _clearDrivingRoute();
    });
    _pushOverlays();
    _pushRoute();
    _pushPuck();
  }

  // ==========================================
  // MAP TAPS
  // ==========================================

  void _onMapClick(math.Point<double> point, LatLng latLng) {
    // A press on one of our buttons/cards also reaches the map on web;
    // ignore that echo so buttons never move the arrow or pick a building.
    if (DateTime.now().difference(_lastOverlayPressAt) <
        const Duration(milliseconds: 600)) {
      return;
    }
    if (_devMode) _devTap.value = latLng;

    // Dev mode: a tap anywhere just moves the arrow there. Routes, the
    // walking line and the destination are left untouched.
    if (_devMode && _clickToMove) {
      _devMoveTo(latLng);
      return;
    }

    // With ~60 buildings close together, a tap picks whichever building or
    // lot is actually nearest (lots first on a tie), within reach.
    PlaceBuilding? nearest;
    var nearestDist = 35.0; // meters
    for (final b in _place.buildings) {
      final d = Geo.meters(latLng, b.position);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = b;
      }
    }

    String? nearestLot;
    var lotDist = 40.0; // meters
    _liveLots.forEach((id, lot) {
      final d = Geo.meters(latLng, lot['position'] as LatLng);
      if (d < lotDist) {
        lotDist = d;
        nearestLot = id;
      }
    });

    if (nearestLot != null && (nearest == null || lotDist <= nearestDist)) {
      if (nearestLot != _openLotId) {
        // Hidden until the new dot's screen position comes back.
        setState(() {
          _openLotId = nearestLot;
          _lotAnchor = null;
        });
      }
      _updateLotAnchor();
      return;
    }
    // Tapping anywhere else closes the lot bubble.
    if (_openLotId != null) setState(() => _openLotId = null);
    if (nearest != null) _onBuildingSelected(nearest);
  }

  // ==========================================
  // DEVELOPER TOOLS
  // ==========================================

  void _teleportToCampus() {
    _stopSimulation();
    _stopGlide();
    var target = _place.entrance;
    for (final p in _fullRoute) {
      if (_inCampus(p)) {
        target = p;
        break;
      }
    }
    setState(() {
      _devLocationOverride = true;
      _userPos = target;
      _gpsStatus = 'Teleported to ${_place.nickname} (dev)';
    });
    _pushPuck();
    final m = _map;
    if (m != null) {
      if (_navTracking) _setNavTracking(false);
      _clearNavPadding();
      _guard(() => m.animateCamera(
            CameraUpdate.newLatLngZoom(target, 17.5),
            duration: const Duration(milliseconds: 1200),
          ));
    }
    _updateNavigationRoute();
  }

  void _toggleSimulation() {
    if (_isSimulating) {
      _stopSimulation();
      return;
    }
    if (_fullRoute.length < 2 || _arrived) return;

    final proj =
        _project(_userPos ?? _fullRoute.first, 0, _fullRoute.length - 2);
    final onRoute = proj.dist <= _offRouteMeters;

    _simTickCount = 0;
    _stopGlide();
    setState(() {
      _isSimulating = true;
      _devLocationOverride = true;
      _userPos = onRoute ? proj.point : _fullRoute.first;
      _routeSeg = onRoute ? proj.seg : 0;
      _routeSnap = _userPos;
    });
    _simTimer = Timer.periodic(_simTick, (_) => _simStep());
  }

  void _simStep() {
    if (!mounted) return;
    final route = _fullRoute;
    if (route.length < 2) {
      _stopSimulation();
      return;
    }

    var cur = _userPos ?? route.first;
    var seg = _routeSeg;
    var budget = _simMetersPerTick;

    while (seg < route.length - 1) {
      final next = route[seg + 1];
      final d = Geo.meters(cur, next);
      if (d > budget) {
        cur = Geo.lerp(cur, next, budget / d);
        break;
      }
      budget -= d;
      cur = next;
      seg++;
    }

    if (seg >= route.length - 1) {
      _stopSimulation();
      _stopGlide(); // put the arrow exactly on the end of the route
      setState(() {
        _userPos = route.last;
        _arrived = true;
        _routeSnap = null;
        _displayRoute = const [];
        _routeRemaining = 0;
        _gpsStatus = 'Simulation finished';
      });
      _pushPuck();
      _pushRoute();
      _onArrived();
      return;
    }

    final bearing = Geo.bearing(cur, route[seg + 1]);
    _simTickCount++;

    // Per-tick state is updated WITHOUT setState; Flutter widgets only
    // refresh a few times a second.
    _userPos = cur;
    _routeSnap = cur; // the simulated car is always on the route
    _routeSeg = seg;
    _heading = bearing;
    _displayRoute = [cur, ...route.sublist(seg + 1)];
    _routeRemaining = Geo.meters(cur, route[seg + 1]) + _routeSuffix[seg + 1];

    if (_simTickCount % 5 == 0) {
      setState(() => _gpsStatus = 'Simulating 20 mph (${bearing.round()}°)');
    }

    // Feed the simulated car through the same glide as live GPS (a "fix"
    // every 0.5 s): the arrow, the route line and the focus-mode camera all
    // move exactly as they do when driving for real.
    if (_simTickCount % 10 == 1) _startGlide(cur, along: _snapAlong);
  }

  void _stopSimulation() {
    _stopWalkSimulation(); // anything that stops the drive stops a walk too
    _simTimer?.cancel();
    _simTimer = null;
    if (mounted && _isSimulating) {
      setState(() => _isSimulating = false);
      _pushRoute();
    }
  }

  // ==========================================
  // WALKING (lot -> building, after parking)
  // ==========================================
  // Works like the driving route: your position is matched to the walking
  // line, the line shrinks behind you, and if you head off another way the
  // line is recalculated (A*) from where you are. Live GPS and the dev
  // "Simulate Walk" both go through this.

  /// Off the walking line by more than this (for [_walkOffFixesToReroute]
  /// fixes in a row) means you took another way. Phone GPS between buildings
  /// often drifts 5–15 m, so a single stray fix doesn't trigger a reroute.
  static const double _walkOffRouteMeters = 20;
  static const int _walkOffFixesToReroute = 2;
  static const Duration _walkRerouteCooldown = Duration(seconds: 4);

  /// "You've arrived" when this little of the path is left, or when this
  /// close to the building's centre (big buildings: you reach a door first).
  static const double _walkArriveRemaining = 15;
  static const double _walkArriveNearBuilding = 25;

  /// The walking path being followed right now (replaced on reroute).
  List<LatLng> _walkPath = const [];
  List<double> _walkSuffix = const [];
  int _walkPathSeg = 0;
  int _walkOffCount = 0;
  DateTime _lastWalkRerouteAt = DateTime.fromMillisecondsSinceEpoch(0);
  bool _walkDone = false; // reached the building
  double _walkRemaining = 0;

  /// Parked, line showing, building not reached yet.
  bool get _walkActive => _arrived && !_walkDone && _walkPath.length >= 2;

  /// Must be called inside setState (or before a rebuild).
  void _setWalkPath(List<LatLng> pts) {
    _walkPath = pts;
    _walkSuffix = _suffixLengths(pts);
    _walkPathSeg = 0;
    _walkOffCount = 0;
    _walkRemaining = _walkSuffix.isEmpty ? 0 : _walkSuffix.first;
  }

  /// Nearest point on [path] (searching segments [from]..[to]) to [p].
  static _RouteProjection _projectOnPath(
    List<LatLng> path,
    LatLng p,
    int from,
    int to,
  ) {
    var best = _RouteProjection(from, path[from], double.infinity);
    for (var i = from; i <= to; i++) {
      final a = path[i];
      final b = path[i + 1];
      final q = Geo.lerp(a, b, Geo.projectT(p, a, b));
      final d = Geo.meters(p, q);
      if (d < best.dist) best = _RouteProjection(i, q, d);
    }
    return best;
  }

  /// Redraws the walking line from [from] (the arrow) to the building.
  void _drawWalkLine(LatLng from) {
    if (!_walkActive || _walkRevealTimer != null) return;
    _sync.push(
      _srcWalk,
      _fc([
        _lineFeature([from, ..._walkPath.sublist(_walkPathSeg + 1)]),
      ]),
    );
  }

  /// Live GPS while walking: progress along the line, reroute if you leave
  /// it, and "arrived" when you reach the building. [immediate] (dev-mode
  /// tap moves) reroutes on the first off-line position, without waiting.
  void _trackWalk(LatLng pos, double accuracy, {bool immediate = false}) {
    final building = _selectedBuilding;
    if (!_walkActive || building == null || _isWalkSim) return;

    final proj = _projectOnPath(_walkPath, pos, 0, _walkPath.length - 2);
    if (proj.dist > _walkOffRouteMeters) {
      if (immediate) {
        _rerouteWalk(pos);
        return;
      }
      if (accuracy > _maxGpsAccuracyForReroute) return; // fix too fuzzy
      _walkOffCount++;
      if (_walkOffCount >= _walkOffFixesToReroute &&
          DateTime.now().difference(_lastWalkRerouteAt) >
              _walkRerouteCooldown) {
        _rerouteWalk(pos);
      }
      return;
    }

    _walkOffCount = 0;
    setState(() {
      _walkPathSeg = proj.seg;
      _walkRemaining = Geo.meters(proj.point, _walkPath[proj.seg + 1]) +
          _walkSuffix[proj.seg + 1];
    });
    if (_walkRemaining <= _walkArriveRemaining ||
        Geo.meters(pos, building.position) <= _walkArriveNearBuilding) {
      _finishWalk();
    }
  }

  /// You went another way: new A* walk from where you are to the building.
  void _rerouteWalk(LatLng from) {
    final building = _selectedBuilding;
    if (building == null || !_arrived || _walkDone) return;
    _lastWalkRerouteAt = DateTime.now();
    final path = _place.pathfinder.findPath(from, building.position);
    if (path.length < 2) return;
    setState(() => _setWalkPath(path));
    _revealWalk(path); // the new line draws itself out from you
  }

  /// Reached the building: hide the line and say so. [end] places the arrow
  /// exactly at the end (simulation only; real GPS keeps its own position).
  void _finishWalk({LatLng? end}) {
    _stopWalkSimulation();
    if (end != null) _stopGlide();
    final building = _selectedBuilding;
    setState(() {
      if (end != null) {
        _userPos = end;
        _gpsStatus = 'Walk finished';
      }
      _walkDone = true;
      _walkRemaining = 0;
    });
    _pushPuck();
    _pushWalk(); // hides the line now that you're there
    if (building != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("You've arrived at ${building.name}.")),
      );
    }
  }

  /// Dev mode: move the location arrow to [p] (a tapped point) and treat it
  /// like a real GPS reading there, so routing can be tested:
  ///  * driving, on the route  -> the route trims to start at the arrow
  ///  * driving, off the route -> the driving route reroutes from there
  ///  * at the lot             -> arrival (walking line appears)
  ///  * walking, off the line  -> the walking line reroutes from there
  ///  * near the building      -> "You've arrived"
  /// Dev moves reroute straight away (no 2-reading wait or cooldown, which
  /// only exist to filter real GPS drift). The destination is never changed.
  /// Running simulations stop so the arrow stays where it was put; real GPS
  /// stays ignored until dev mode is switched off.
  void _devMoveTo(LatLng p) {
    _stopSimulation(); // also stops a simulated walk
    final from = _shownPos ?? _userPos;
    _stopGlide();
    setState(() {
      _devLocationOverride = true;
      _userPos = p;
      if (from != null && Geo.meters(from, p) > 1) {
        _heading = Geo.bearing(from, p); // face the way it moved
      }
      _gpsStatus = 'Dev location (tap the map to move)';
    });

    _applyDevFix(p);

    // Quick glide from where the arrow was; the lines (and in focus mode the
    // camera) follow the arrow the same way they do for real GPS.
    const moveTime = Duration(milliseconds: 450);
    if (from == null || reduceMotion(context)) {
      _pushPuck();
    } else {
      _shownPos = from;
      _glideBetween(from, p, moveTime);
    }
  }

  /// Runs a dev-moved position through the same route logic as a GPS fix.
  void _applyDevFix(LatLng p) {
    // Driving: progress along the route, arrival, or leaving it.
    var progress = _Progress.none;
    setState(() {
      progress = _updateRouteProgress(p);
      _arrowOnRoute = false; // a dev move is placed exactly where tapped
    });
    _pushRoute();
    if (progress == _Progress.arrived) {
      _onArrived();
    } else if (progress == _Progress.offRoute &&
        !_isRouting &&
        _selectedBuilding != null) {
      _updateNavigationRoute(); // reroute the drive from the arrow, now
    }

    // Walking (after parking): progress, reroute or arrival.
    if (_arrived) _trackWalk(p, 0, immediate: true);
  }

  // ---- DEV: simulated walk ----

  /// Average adult walking pace: 1.4 m/s (about 5 km/h / 3.1 mph).
  static const double _walkSpeedMps = 1.4;

  /// Dev speed-up for the walk: real walking barely moves on screen (about
  /// 7 px/s even fully zoomed in), so it can run faster for testing.
  static const List<int> _walkSpeedSteps = [1, 3, 8];
  int _walkSpeedIndex = 1; // start at 3x so the movement is easy to see
  int get _walkSpeedMult => _walkSpeedSteps[_walkSpeedIndex];

  void _cycleWalkSpeed() {
    setState(() {
      _walkSpeedIndex = (_walkSpeedIndex + 1) % _walkSpeedSteps.length;
      if (_isWalkSim) _gpsStatus = 'Simulating walk ($_walkSpeedMult×)';
    });
  }

  Timer? _walkSimTimer;
  bool _isWalkSim = false;
  int _walkTick = 0;

  /// Walks the arrow along the current walking path at a normal pace,
  /// through the same glide as GPS, so the focus-mode camera follows.
  /// Resumes from where the arrow is; if it's off the path, the walk is
  /// rerouted from there first.
  void _toggleWalkSimulation() {
    if (_isWalkSim) {
      _stopWalkSimulation();
      return;
    }
    if (!_walkActive) return;

    var start = _walkPath.first;
    final here = _userPos;
    if (here != null) {
      final proj = _projectOnPath(_walkPath, here, 0, _walkPath.length - 2);
      if (proj.dist > _walkOffRouteMeters) {
        _rerouteWalk(here); // start the walk from where you actually are
        start = _walkPath.first;
      } else {
        _walkPathSeg = proj.seg;
        start = proj.point;
      }
    }

    _stopGlide();
    _walkTick = 0;
    setState(() {
      _isWalkSim = true;
      _devLocationOverride = true; // ignore real GPS while walking
      _userPos = start;
      _heading = Geo.bearing(start, _walkPath[_walkPathSeg + 1]);
      _gpsStatus = 'Simulating walk ($_walkSpeedMult×)';
    });
    _pushPuck();
    _walkSimTimer = Timer.periodic(_simTick, (_) => _walkStep());
  }

  void _walkStep() {
    final pts = _walkPath;
    if (!mounted || !_walkActive) {
      _stopWalkSimulation();
      return;
    }
    var cur = _userPos ?? pts.first;
    var seg = _walkPathSeg;
    var budget =
        _walkSpeedMps * _walkSpeedMult * _simTick.inMilliseconds / 1000;

    while (seg < pts.length - 1) {
      final next = pts[seg + 1];
      final d = Geo.meters(cur, next);
      if (d > budget) {
        cur = Geo.lerp(cur, next, budget / d);
        break;
      }
      budget -= d;
      cur = next;
      seg++;
    }

    if (seg >= pts.length - 1) {
      _finishWalk(end: pts.last);
      return;
    }

    _walkTick++;
    _userPos = cur;
    _walkPathSeg = seg;
    final next = pts[seg + 1];
    // Face the way you're walking (skip tiny bits of path that jitter).
    if (Geo.meters(cur, next) > 0.3) _heading = Geo.bearing(cur, next);
    _walkRemaining = Geo.meters(cur, next) + _walkSuffix[seg + 1];

    // A "fix" every 0.5 s through the glide: smooth arrow + camera, and the
    // glide keeps the line attached to the arrow.
    if (_walkTick % 10 == 1) _startGlide(cur);
    if (_walkTick % 5 == 0) setState(() {}); // refresh the countdown
  }

  void _stopWalkSimulation() {
    _walkSimTimer?.cancel();
    _walkSimTimer = null;
    if (mounted && _isWalkSim) setState(() => _isWalkSim = false);
  }

  void _toggleDevMode() {
    final turningOff = _devMode;
    setState(() {
      _devMode = !_devMode;
      if (turningOff) _clickToMove = false; // always starts off
      if (!turningOff) _freeRoam = true; // roam anywhere, follow live GPS
    });
    if (turningOff) {
      _stopSimulation();
      _devTap.value = null;
      if (_devLocationOverride) {
        _devLocationOverride = false;
        _resyncRealGps();
      }
      _restoreCampusLimits();
    }
  }

  /// Dev mode ended: puts the campus limits back. Focus mode ends if you're
  /// off campus, and if the view is off campus (or zoomed out past the
  /// limit) it flies back first, so the limits never snap the map.
  void _restoreCampusLimits() {
    if (!_freeRoam) return;
    if (_navTracking && !_isOnCampus) _setNavTracking(false);

    final cam = _map?.cameraPosition;
    final viewOnCampus = cam == null ||
        (_inCampus(cam.target) && cam.zoom >= _place.minZoom);
    if (viewOnCampus) {
      setState(() => _freeRoam = false);
      return;
    }

    const flyBack = Duration(milliseconds: 1200);
    _animateTo(
      CameraPosition(
        target: _place.center,
        zoom: _overviewZoom,
        bearing: 0,
        tilt: _is3D ? _overviewTilt : 0,
      ),
      flyBack,
    );
    Future.delayed(flyBack, () {
      // Still out of dev mode (it may have been switched back on).
      if (mounted && !_devMode) setState(() => _freeRoam = false);
    });
  }

  // ==========================================
  // UI
  // ==========================================

  double _puckBearing() {
    // Arrow on the road: point along it (steadier than GPS course).
    // Otherwise _heading: the compass, or GPS course when moving fast.
    if ((_isSimulating || _arrowOnRoute) &&
        _routeSnap != null &&
        _displayRoute.length >= 2 &&
        _routeSeg < _fullRoute.length - 1) {
      return Geo.bearing(_fullRoute[_routeSeg], _fullRoute[_routeSeg + 1]);
    }
    return _heading;
  }

  // ---- destination search ----

  /// The suggestion panel is tall enough for this many rows; any more are
  /// reached by scrolling inside the panel.
  static const int _maxVisibleSuggestions = 5;
  static const double _suggestionRowHeight = 58;

  /// Every building in random order, shown while the box is empty
  /// (reshuffled each time the search opens).
  List<PlaceBuilding> _randomPicks = const [];
  DateTime _searchOpenedAt = DateTime.fromMillisecondsSinceEpoch(0);

  void _onSearchFocusChanged() {
    if (!mounted) return;
    setState(() {
      if (_searchFocus.hasFocus) {
        _searchOpenedAt = DateTime.now();
        _randomPicks = List<PlaceBuilding>.of(_place.buildings)..shuffle();
        // Search what the box shows: with a destination picked that's its
        // name, so the list is just that building. The name is selected, so
        // typing replaces it (and the clear button empties it to browse).
        _searchQuery = _searchCtrl.text;
        _searchCtrl.selection = TextSelection(
          baseOffset: 0,
          extentOffset: _searchCtrl.text.length,
        );
      } else {
        // Closing the list puts the current destination's name back.
        _searchCtrl.text = _selectedBuilding?.name ?? '';
        _searchQuery = '';
      }
    });
  }

  void _pickSuggestion(PlaceBuilding building) {
    _onBuildingSelected(building); // first, so unfocus shows the new name
    _searchFocus.unfocus();
  }

  @override
  Widget build(BuildContext context) {
    final onCampus = _isOnCampus;
    final navActive = _navTracking && _canFocus;
    final bottomInset = MediaQuery.of(context).padding.bottom;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_place.mapTitle),
            Text(
              navActive
                  ? 'Navigation Mode Active (${_heading.round()}°)'
                  : (_devMode ? 'Dev Mode Active' : _place.areaName),
              style: GoogleFonts.archivo(
                fontSize: 12.5,
                color: navActive ? kAccent : (_devMode ? kDev : kTextMuted),
                fontWeight: (navActive || _devMode)
                    ? FontWeight.w600
                    : FontWeight.normal,
              ),
            ),
          ],
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          IconButton(
            icon: Icon(
              _devMode ? Icons.developer_mode : Icons.developer_mode_outlined,
              color: _devMode ? kDev : kTextMuted,
            ),
            tooltip: _devMode ? 'Disable Developer Mode' : 'Enable Developer Mode',
            onPressed: _toggleDevMode,
          ),
          IconButton(
            icon: Icon(
              _is3D ? Icons.view_in_ar : Icons.map_outlined,
              color: _is3D ? kAccent : kTextMuted,
            ),
            tooltip: _is3D ? 'Switch to 2D view' : 'Switch to 3D view',
            onPressed: _toggle3D,
          ),
          if (_canFocus)
            IconButton(
              icon: _isLocating
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: kText,
                      ),
                    )
                  : Icon(
                      _navTracking ? Icons.navigation : Icons.my_location,
                      color: _navTracking ? kAccent : kText,
                    ),
              tooltip: _navTracking
                  ? 'Disable Navigation Focus'
                  : 'Follow GPS Live (Turn-by-Turn Mode)',
              onPressed: _userPos == null
                  ? null
                  : () => _setNavTracking(!_navTracking),
            ),
          IconButton(
            icon: const Icon(Icons.center_focus_strong),
            tooltip: 'Reset Map View',
            onPressed: _resetView,
          ),
        ],
      ),
      body: Stack(
        children: [
          Positioned.fill(
            child: LayoutBuilder(
              builder: (context, constraints) {
                _mapHeight = constraints.maxHeight;
                _mapWidth = constraints.maxWidth;
                return _buildMap();
              },
            ),
          ),
          if (_devMode) _buildDevTapBadge(),
          if (_devMode)
            _buildDevControls(onCampus, bottomInset),
          _buildLotPopup(),
          _buildAttribution(bottomInset),
          _buildGuidanceCard(onCampus, bottomInset),
          // Last, so the suggestion list draws above the other overlays.
          _buildSearchHeader(),
        ],
      ),
    );
  }

  Widget _buildMap() {
    // Listener sees raw touches before the native map does, so a drag
    // cancels follow-mode just like Google Maps. (Mouse-wheel zoom and web,
    // where the map gets the events first, are caught by _onCameraMove.)
    return Listener(
      onPointerDown: (e) {
        _pointerDownAt = e.position;
        _searchFocus.unfocus(); // touching the map closes the suggestions
      },
      onPointerMove: (e) {
        final start = _pointerDownAt;
        if (_navTracking &&
            start != null &&
            (e.position - start).distance > 12) {
          _pointerDownAt = null;
          _setNavTracking(false, userGesture: true);
        }
      },
      onPointerUp: (_) => _pointerDownAt = null,
      onPointerCancel: (_) => _pointerDownAt = null,
      // Mouse wheel or trackpad zoom: the user is taking the camera over.
      onPointerSignal: (_) {
        if (_navTracking) _setNavTracking(false, userGesture: true);
      },
      onPointerPanZoomStart: (_) {
        if (_navTracking) _setNavTracking(false, userGesture: true);
      },
      child: MapLibreMap(
        styleString: _styleUrl,
        initialCameraPosition: CameraPosition(
          target: _place.center,
          zoom: 15.0,
        ),
        onMapCreated: (controller) => _map = controller,
        onStyleLoadedCallback: _onStyleLoaded,
        onMapClick: _onMapClick,
        cameraTargetBounds:
            _freeRoam ? CameraTargetBounds.unbounded : _cameraBounds,
        minMaxZoomPreference: _freeRoam ? _freeRoamZoom : _campusZoom,
        compassEnabled: false,
        rotateGesturesEnabled: true,
        tiltGesturesEnabled: true,
        myLocationEnabled: false,
        trackCameraPosition: true, // needed for onCameraMove
        onCameraMove: _onCameraMove,
        onCameraIdle: _onCameraIdle,
      ),
    );
  }

  /// Google-style search: focusing shows every building (random order while
  /// the box is empty, matches once you type) in a panel that fits
  /// [_maxVisibleSuggestions] rows and scrolls for the rest.
  Widget _buildSearchHeader() {
    final selected = _selectedBuilding;
    final focused = _searchFocus.hasFocus;
    final hasText = _searchCtrl.text.isNotEmpty;

    // Nothing typed: the current destination first, then the shuffle.
    // Typing: the best matches first (see [rankBuildingMatches]).
    final List<PlaceBuilding> suggestions = _searchQuery.trim().isEmpty
        ? [
            ?selected,
            for (final b in _randomPicks)
              if (b.id != selected?.id) b,
          ]
        : rankBuildingMatches(_place.buildings, _searchQuery);
    final scrolls = suggestions.length > _maxVisibleSuggestions;
    final active = focused || selected != null;
    const hint = 'Search for destination...';
    const fieldStyle = TextStyle(
      color: kText,
      fontSize: 14,
      fontWeight: FontWeight.w600,
    );
    const hintStyle = TextStyle(color: kTextMuted, fontSize: 14);
    // Fixed icon boxes, so the label drawn over the field lines up with the
    // field's own text.
    const iconBox = BoxConstraints.tightFor(width: 48, height: 48);

    const shadow = [
      // Light shadow only so the panel separates from the bright map.
      BoxShadow(color: Colors.black38, blurRadius: 6, offset: Offset(0, 2)),
    ];

    return Positioned(
      top: 16,
      left: 16,
      right: 16,
      // On web/desktop a TextField unfocuses on any mouse-down outside it,
      // which removed the list before a suggestion's tap could land. The tap
      // region makes the list count as part of the field.
      child: _tapShield(TextFieldTapRegion(
        // Slides down into place when the map opens.
        child: FadeSlideIn(
        offsetY: -14,
        child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Border and icon colours ease between idle and active.
          AnimatedContainer(
            duration: kMotion,
            curve: kEaseOut,
            decoration: BoxDecoration(
              color: kCard,
              borderRadius: BorderRadius.circular(kRadius),
              border: Border.all(color: active ? kAccent : kDivider),
              boxShadow: shadow,
            ),
            child: Stack(
              children: [
                TextField(
                  controller: _searchCtrl,
                  focusNode: _searchFocus,
                  cursorColor: kAccent,
                  textAlignVertical: TextAlignVertical.center,
                  textInputAction: TextInputAction.search,
                  // Not typing, the field's own text is hidden and the
                  // label on top shows it instead (see below).
                  style: fieldStyle.copyWith(
                    color: focused ? kText : Colors.transparent,
                  ),
                  onChanged: (v) => setState(() => _searchQuery = v),
                  onSubmitted: (_) {
                    if (suggestions.isNotEmpty) {
                      _pickSuggestion(suggestions.first);
                    }
                  },
                  decoration: InputDecoration(
                    border: InputBorder.none,
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(vertical: 15),
                    hintText: focused ? hint : null,
                    hintStyle: hintStyle,
                    prefixIcon: TweenAnimationBuilder<Color?>(
                      tween: ColorTween(end: active ? kAccent : kTextMuted),
                      duration: kMotion,
                      curve: kEaseOut,
                      builder: (_, color, _) =>
                          Icon(Icons.search, color: color),
                    ),
                    prefixIconConstraints: iconBox,
                    // Always there (empty when there's nothing to clear), so
                    // the clear button can pop in and out without the text
                    // width jumping.
                    suffixIcon: AnimatedSwitcher(
                      duration: kMotion,
                      transitionBuilder: (child, anim) => FadeTransition(
                        opacity: anim,
                        child: ScaleTransition(
                          scale: Tween(begin: 0.6, end: 1.0).animate(
                            CurvedAnimation(parent: anim, curve: kEaseOut),
                          ),
                          child: child,
                        ),
                      ),
                      child: (hasText || selected != null)
                          ? IconButton(
                              key: const ValueKey('clear'),
                              icon: const Icon(Icons.cancel, size: 20),
                              color: kTextMuted,
                              tooltip: 'Clear',
                              onPressed: () {
                                _searchCtrl.clear();
                                setState(() => _searchQuery = '');
                                if (selected != null) _clearDestination();
                              },
                            )
                          : const SizedBox(key: ValueKey('no-clear')),
                    ),
                    suffixIconConstraints: iconBox,
                  ),
                ),
                // Not typing: the destination's name (or the hint), which
                // fades and slides when a building is picked, changed or
                // cleared instead of jumping. It fades away as you start
                // typing, leaving the field's own text.
                Positioned.fill(
                  left: iconBox.maxWidth,
                  right: iconBox.maxWidth,
                  child: IgnorePointer(
                    child: AnimatedOpacity(
                      opacity: focused ? 0 : 1,
                      duration: kMotionFast,
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: AnimatedText(
                          selected?.name ?? hint,
                          style: selected != null ? fieldStyle : hintStyle,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          // The suggestion panel unfolds from under the search bar and folds
          // away again; its rows rise in one after another.
          AnimatedSwitcher(
            duration: kMotion,
            switchInCurve: kEaseOut,
            switchOutCurve: Curves.easeInCubic,
            transitionBuilder: (child, anim) => FadeTransition(
              opacity: anim,
              child: SizeTransition(
                sizeFactor: anim,
                alignment: Alignment.topCenter,
                child: child,
              ),
            ),
            child: !focused
                ? const SizedBox(key: ValueKey('closed'), width: double.infinity)
                : Container(
                    key: const ValueKey('open'),
                    margin: const EdgeInsets.only(top: 6),
                    decoration: BoxDecoration(
                      color: kCard,
                      borderRadius: BorderRadius.circular(kRadius),
                      border: Border.all(color: kDivider),
                      boxShadow: shadow,
                    ),
                    clipBehavior: Clip.antiAlias,
                    // As you type, rows that stop matching fold away and new
                    // matches grow in, the panel resizing smoothly; scrolling,
                    // rows recede under the edges.
                    child: AnimatedSize(
                      duration: kMotion,
                      curve: kEaseOut,
                      alignment: Alignment.topCenter,
                      // At most 5 rows tall; more scroll smoothly inside.
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(
                          maxHeight: _suggestionRowHeight *
                                  _maxVisibleSuggestions +
                              _maxVisibleSuggestions,
                        ),
                        child: AnimatedRowList(
                          shrinkWrap: true,
                          physics: scrolls
                              ? kScrollPhysics
                              : const NeverScrollableScrollPhysics(),
                          openedAt: _searchOpenedAt,
                          divided: true,
                          springy: true,
                          entranceOffset: -8,
                          entranceDuration: kMotion,
                          // Back to the top as you type: best match in view.
                          scrollToTopOn: _searchQuery.trim(),
                          fade: scrolls ? 14 : 0,
                          alwaysShowThumb: scrolls,
                          isEmpty: suggestions.isEmpty,
                          empty: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Text(
                              'No buildings match "${_searchQuery.trim()}".',
                              style: const TextStyle(
                                color: kTextMuted,
                                fontSize: 13,
                              ),
                            ),
                          ),
                          children: [
                            // Built only once on screen: each row works out
                            // its best lot, which is too slow for all ~60 at
                            // once.
                            for (final s in suggestions)
                              Builder(
                                key: ValueKey('sug-${s.id}'),
                                builder: (_) => _buildSuggestionRow(s),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
          ),
        ],
      ),
      ),
      )),
    );
  }

  Widget _buildSuggestionRow(PlaceBuilding bldg) {
    final best = _bestParking(bldg);
    final lot = best != null ? _liveLots[best.lotId] : null;
    final free = lot == null ? null : _freeText(lot);
    final current = bldg.id == _selectedBuilding?.id;

    return InkWell(
      onTap: () => _pickSuggestion(bldg),
      // Fixed height so the panel can size itself to exactly 5 rows.
      child: Container(
        height: _suggestionRowHeight,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: kNavBg,
                borderRadius: BorderRadius.circular(kRadius),
              ),
              child: Text(bldg.code, style: mono(fontSize: 11.5, color: kAccent)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    bldg.name,
                    style: const TextStyle(
                      color: kText,
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    lot != null
                        ? '${best!.unitId != null ? 'Park at ${best.unitId}, ${lot['name']}' : 'Best lot: ${lot['name']}'} (${[?free, '${formatDistance(best.totalDistanceMeters)} walk'].join(', ')})'
                        : (_liveLots.isEmpty
                            ? 'Loading parking data...'
                            : 'All nearby lots full'),
                    style: const TextStyle(color: kTextMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
            // The destination you have now (listed first).
            if (current) ...[
              const SizedBox(width: 8),
              const Icon(Icons.check_circle, color: kAccent, size: 18),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildDevTapBadge() {
    return Positioned(
      top: 80,
      left: 20,
      right: 20,
      child: Center(
        child: ValueListenableBuilder<LatLng?>(
          valueListenable: _devTap,
          builder: (context, tap, _) {
            return _tapShield(GestureDetector(
              onTap: () {
                if (tap == null) return;
                final str =
                    'LatLng(${tap.latitude.toStringAsFixed(6)}, ${tap.longitude.toStringAsFixed(6)})';
                Clipboard.setData(ClipboardData(text: str));
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('Copied to clipboard: $str'),
                    duration: const Duration(seconds: 2),
                  ),
                );
              },
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xEE0B1A24),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: kDev, width: 1.5),
                  boxShadow: const [
                    BoxShadow(color: Colors.black87, blurRadius: 8),
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.gps_fixed, color: kDev, size: 16),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        tap != null
                            ? 'Tapped: ${tap.latitude.toStringAsFixed(6)}, ${tap.longitude.toStringAsFixed(6)} (tap to copy)'
                            : 'Tap the map to read coordinates',
                        style: const TextStyle(
                          color: kDev,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ));
          },
        ),
      ),
    );
  }

  static Widget _popTransition(Widget child, Animation<double> anim) =>
      FadeTransition(
        opacity: anim,
        child: ScaleTransition(
          scale: Tween(begin: 0.85, end: 1.0)
              .animate(CurvedAnimation(parent: anim, curve: kEaseOut)),
          alignment: Alignment.centerRight,
          child: child,
        ),
      );

  Widget _buildDevControls(bool onCampus, double bottomInset) {
    final canSimulate = onCampus && _fullRoute.length >= 2 && !_arrived;
    // Parked, walking line showing, and not yet walked to the building.
    final canWalk = _walkActive && !_isSimulating;
    return Positioned(
      right: 20,
      bottom: 105 + bottomInset,
      child: _tapShield(Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // Blue toggle: tap-to-move the location arrow only while ON.
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: PressScale(
              child: AnimatedContainer(
                duration: kMotion,
                curve: kEaseOut,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(kRadius),
                  boxShadow: [
                    BoxShadow(
                      color: kDevBlue.withValues(alpha: _clickToMove ? 0.45 : 0),
                      blurRadius: 14,
                    ),
                  ],
                ),
                child: ElevatedButton.icon(
                  onPressed: () =>
                      setState(() => _clickToMove = !_clickToMove),
                  icon: Icon(
                    _clickToMove ? Icons.touch_app : Icons.touch_app_outlined,
                    size: 18,
                  ),
                  label: AnimatedText(
                    'Click to move: ${_clickToMove ? 'ON' : 'OFF'}',
                    style: GoogleFonts.archivo(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: _clickToMove ? Colors.white : kDevBlue,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _clickToMove ? kDevBlue : kCard,
                    foregroundColor: _clickToMove ? Colors.white : kDevBlue,
                    side: const BorderSide(color: kDevBlue),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                  ),
                ),
              ),
            ),
          ),
          // Buttons pop in/out, and Simulate <-> Stop morphs smoothly.
          AnimatedSwitcher(
            duration: kMotion,
            transitionBuilder: _popTransition,
            child: !onCampus
                ? PressScale(
                    key: const ValueKey('travel'),
                    child: ElevatedButton.icon(
                      onPressed: _teleportToCampus,
                      icon: const Icon(Icons.flight_takeoff, size: 18),
                      label: Text('Travel to ${_place.nickname}'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: kDev,
                        foregroundColor: kOnAccent,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                      ),
                    ),
                  )
                : const SizedBox.shrink(key: ValueKey('no-travel')),
          ),
          AnimatedSwitcher(
            duration: kMotion,
            transitionBuilder: _popTransition,
            child: (canSimulate || _isSimulating)
                ? PressScale(
                    key: ValueKey('sim-$_isSimulating'),
                    child: ElevatedButton.icon(
                      onPressed: _toggleSimulation,
                      icon: Icon(
                        _isSimulating ? Icons.pause : Icons.play_arrow,
                        size: 20,
                      ),
                      label: Text(
                        _isSimulating ? 'Stop (20 mph)' : 'Simulate Run',
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _isSimulating ? kRed : kAccent,
                        foregroundColor: kOnAccent,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                      ),
                    ),
                  )
                : const SizedBox.shrink(key: ValueKey('no-sim')),
          ),
          // After parking: walk the arrow to the building at a normal pace.
          AnimatedSwitcher(
            duration: kMotion,
            transitionBuilder: _popTransition,
            child: (canWalk || _isWalkSim)
                ? Row(
                    key: ValueKey('walk-$_isWalkSim'),
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Speed chip: tap to cycle 1x (real pace) / 3x / 8x.
                      PressScale(
                        child: OutlinedButton(
                          onPressed: _cycleWalkSpeed,
                          style: OutlinedButton.styleFrom(
                            backgroundColor: kCard,
                            foregroundColor: kText,
                            minimumSize: const Size(0, 40),
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                          ),
                          child: AnimatedText(
                            '$_walkSpeedMult×',
                            style: mono(fontSize: 13, color: kAccent),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      PressScale(
                        child: ElevatedButton.icon(
                          onPressed: _toggleWalkSimulation,
                          icon: Icon(
                            _isWalkSim ? Icons.pause : Icons.directions_walk,
                            size: 20,
                          ),
                          label: Text(
                            _isWalkSim ? 'Stop walk' : 'Simulate Walk',
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: _isWalkSim ? kRed : kAccent,
                            foregroundColor: kOnAccent,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 10,
                            ),
                          ),
                        ),
                      ),
                    ],
                  )
                : const SizedBox.shrink(key: ValueKey('no-walk')),
          ),
        ],
      )),
    );
  }

  /// OpenStreetMap data requires visible attribution.
  Widget _buildAttribution(double bottomInset) {
    return Positioned(
      left: 22,
      bottom: 100 + bottomInset,
      child: const IgnorePointer(
        child: Text(
          '© OpenStreetMap contributors · OpenFreeMap',
          style: TextStyle(
            fontSize: 9,
            color: Color(0xFF3A3A33),
            shadows: [Shadow(color: Colors.white, blurRadius: 3)],
          ),
        ),
      ),
    );
  }

  Widget _buildGuidanceCard(bool onCampus, double bottomInset) {
    final building = _selectedBuilding;
    final walk = _walkResult;
    final String title;
    final String subtitle;
    final String phase; // kind of message; the subtitle animates when it changes

    if (building == null) {
      title = _place.guidanceTitle;
      subtitle = _userPos == null
          ? _gpsStatus
          : (onCampus
              ? '${_place.insideLabel} • Heading: ${_heading.round()}°'
              : _place.outsideLabel);
      phase = _userPos == null ? 'gps' : (onCampus ? 'on' : 'off');
    } else if (walk == null) {
      title =
          _liveLots.isEmpty ? 'Loading live parking data...' : 'No open lot';
      subtitle = _liveLots.isEmpty
          ? 'Waiting for sensor data'
          : 'All nearby lots are currently full';
      phase = 'nolot';
    } else {
      final lot = _liveLots[walk.lotId];
      final free = lot == null ? null : _freeText(lot);
      final lotName = lot?['name'] ?? walk.lotId;
      final lotText = free == null ? '$lotName' : '$lotName ($free)';
      title = walk.unitId != null
          ? 'Park at ${walk.unitId} • $lotText'
          : 'Best Lot: $lotText';
      final walkText = formatDistance(walk.totalDistanceMeters);
      if (_isWalkSim) {
        subtitle =
            'Walking • ${formatDistance(_walkRemaining)} to ${building.code}';
        phase = 'walking';
      } else if (_walkDone) {
        subtitle = "You've arrived at ${building.code}";
        phase = 'walkdone';
      } else if (_arrived) {
        // Counts down as you walk (and updates after a reroute).
        final left = _walkPath.length >= 2 ? formatDistance(_walkRemaining) : walkText;
        subtitle = 'Arrived • $left walk to ${building.code}';
        phase = 'arrived';
      } else if (_fullRoute.isEmpty) {
        subtitle = 'Calculating driving route...';
        phase = 'calc';
      } else {
        subtitle =
            'Drive ${formatDistance(_routeRemaining)} • then walk $walkText';
        phase = 'drive';
      }
    }

    final routing =
        _isRouting || (walk != null && _fullRoute.isEmpty && !_arrived);

    // Dev mode: how good live GPS and the compass are right now (these
    // update in place). GPS ±m = how far off the phone says its position may
    // be; turning the device should change the compass value.
    final accuracy = _gpsAccuracy;
    final devInfo = [
      if (accuracy != null && !_devLocationOverride)
        'GPS ±${accuracy.round()} m',
      switch (_compassWorks) {
        true => 'Compass ${_compassHeading.round()}°',
        false => 'No compass sensor detected',
        null => 'Checking compass…',
      },
    ];
    final shownSubtitle =
        _devMode ? [subtitle, ...devInfo].join(' • ') : subtitle;

    return Positioned(
      bottom: 24 + bottomInset,
      left: 20,
      right: 20,
      child: _tapShield(FadeSlideIn(
        index: 2,
        offsetY: 24,
        child: AnimatedContainer(
          duration: kMotion,
          curve: kEaseOut,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: kCard,
            borderRadius: BorderRadius.circular(kRadius),
            border: Border.all(color: building != null ? kAccent : kDivider),
            boxShadow: [
              const BoxShadow(
                color: Colors.black38,
                blurRadius: 6,
                offset: Offset(0, 2),
              ),
              // Soft accent glow while a destination is active.
              BoxShadow(
                color: kAccent.withValues(alpha: building != null ? 0.12 : 0),
                blurRadius: 16,
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  AnimatedSwitcher(
                    duration: kMotion,
                    transitionBuilder: (child, anim) => ScaleTransition(
                      scale: anim,
                      child: FadeTransition(opacity: anim, child: child),
                    ),
                    child: Icon(
                      building != null
                          ? Icons.assistant_direction
                          : Icons.my_location,
                      key: ValueKey(building != null),
                      color: kAccent,
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        AnimatedText(
                          title,
                          style: mono(fontSize: 14),
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            // Connection quality: green / amber / red wifi.
                            const ConnectionIndicator(size: 14),
                            const SizedBox(width: 6),
                            Expanded(
                              child: AnimatedText(
                                shownSubtitle,
                                switchKey: phase,
                                style: const TextStyle(
                                  fontSize: 12.5,
                                  color: kTextMuted,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              // Thin indeterminate bar while the driving route is computed.
              AnimatedSize(
                duration: kMotion,
                curve: kEaseOut,
                child: routing
                    ? Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(2),
                          child: const LinearProgressIndicator(
                            minHeight: 2,
                            color: kAccent,
                            backgroundColor: kDivider,
                          ),
                        ),
                      )
                    : const SizedBox(width: double.infinity),
              ),
            ],
          ),
        ),
      )),
    );
  }

  /// Small bubble that sits on top of the tapped lot's dot and moves with it
  /// as the map is dragged, zoomed or rotated. Shows every spot as a chip,
  /// 3 per row: green = available, red = occupied, gray = offline.
  Widget _buildLotPopup() {
    final id = _openLotId;
    final lot = id == null ? null : _liveLots[id];
    final anchor = _lotAnchor;
    // Must stay Positioned even when hidden: a non-positioned child would
    // make the map's Stack size itself to it (0x0) and hide everything.
    const hidden = Positioned(left: 0, top: 0, child: SizedBox.shrink());
    if (id == null || lot == null || anchor == null) return hidden;

    final mapW = _mapWidth > 0 ? _mapWidth : MediaQuery.of(context).size.width;
    final mapH = _mapHeight > 0 ? _mapHeight : MediaQuery.of(context).size.height;
    // Hide while the dot is scrolled off screen.
    if (anchor.dx < 0 || anchor.dx > mapW || anchor.dy < 0 || anchor.dy > mapH) {
      return hidden;
    }

    final units = lot['units'] as List<Map<String, dynamic>>;
    final free = (lot['capacity'] as int) - (lot['occupied'] as int);

    const width = 190.0;
    const arrowW = 12.0;
    const arrowH = 7.0;
    // Keep the bubble on screen near the edges; the arrow still points at
    // the dot.
    final left = (anchor.dx - width / 2)
        .clamp(8.0, math.max(8.0, mapW - width - 8))
        .toDouble();
    final arrowX =
        (anchor.dx - left - arrowW / 2).clamp(6.0, width - arrowW - 6).toDouble();

    return Positioned(
      left: left,
      width: width,
      // Clear of the dot (radius 6-8 plus its stroke).
      bottom: mapH - anchor.dy + 12,
      child: _tapShield(FadeSlideIn(
        key: ValueKey(id),
        offsetY: 8,
        duration: kMotion,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(8, 6, 4, 8),
              decoration: BoxDecoration(
                color: kCard,
                borderRadius: BorderRadius.circular(kRadius),
                border: Border.all(color: kDivider),
                boxShadow: const [
                  BoxShadow(
                    color: Colors.black45,
                    blurRadius: 8,
                    offset: Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          // Out of the curbs that are online.
                          lot['sensors'] == false
                              ? '${lot['name']}'
                              : '${lot['name']} • $free/${lot['capacity']} free',
                          style: mono(fontSize: 11.5),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      InkWell(
                        borderRadius: BorderRadius.circular(10),
                        onTap: () => setState(() => _openLotId = null),
                        child: const Padding(
                          padding: EdgeInsets.all(2),
                          child:
                              Icon(Icons.close, size: 15, color: kTextMuted),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Padding(
                    padding: const EdgeInsets.only(right: 4),
                    child: units.isEmpty
                        ? const Text(
                            'No sensors yet',
                            style: TextStyle(fontSize: 11, color: kTextMuted),
                          )
                        : ConstrainedBox(
                            // About 4 rows; scroll for the rest.
                            constraints: const BoxConstraints(maxHeight: 108),
                            child: GridView.builder(
                              shrinkWrap: true,
                              padding: EdgeInsets.zero,
                              itemCount: units.length,
                              gridDelegate:
                                  const SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: 3,
                                mainAxisSpacing: 4,
                                crossAxisSpacing: 4,
                                mainAxisExtent: 24,
                              ),
                              itemBuilder: (context, i) {
                                final u = units[i];
                                return _SpotChip(
                                  name: u['id'] as String,
                                  online: u['online'] == true,
                                  occupied: u['occupied'] == true,
                                );
                              },
                            ),
                          ),
                  ),
                ],
              ),
            ),
            // Little pointer down to the dot.
            Padding(
              padding: EdgeInsets.only(left: arrowX),
              child: CustomPaint(
                size: const Size(arrowW, arrowH),
                painter: _BubbleArrowPainter(),
              ),
            ),
          ],
        ),
      )),
    );
  }

  /// Re-reads where the open lot's dot is on screen. Requests are coalesced:
  /// while one is in flight, further camera moves just mark it dirty and a
  /// single follow-up runs afterwards.
  Future<void> _updateLotAnchor() async {
    final m = _map;
    final id = _openLotId;
    final lot = id == null ? null : _liveLots[id];
    if (m == null || lot == null) return;
    if (_anchorBusy) {
      _anchorDirty = true;
      return;
    }
    _anchorBusy = true;
    try {
      final p = await m.toScreenLocation(lot['position'] as LatLng);
      if (!mounted || _openLotId != id) return;
      // Android reports physical pixels; iOS and web already use logical.
      final scale = !kIsWeb && defaultTargetPlatform == TargetPlatform.android
          ? MediaQuery.of(context).devicePixelRatio
          : 1.0;
      setState(() => _lotAnchor = Offset(p.x / scale, p.y / scale));
    } catch (e) {
      debugPrint('[map] $e');
    } finally {
      _anchorBusy = false;
      if (_anchorDirty) {
        _anchorDirty = false;
        _updateLotAnchor();
      }
    }
  }
}
