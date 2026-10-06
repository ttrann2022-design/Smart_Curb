import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_compass/flutter_compass.dart';
import 'package:geolocator/geolocator.dart' as geo;
import 'package:http/http.dart' as http;
import 'package:maplibre_gl/maplibre_gl.dart';

import 'firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const MyApp());
}

// ==========================================
// THEME (dark only)
// ==========================================

const Color kAccent = Color(0xFFC6F24A);
const Color kBg = Color(0xFF0F0F0D);
const Color kBar = Color(0xFF090908);
const Color kCard = Color(0xFF171714);
const Color kDivider = Color(0xFF2B2B25);
const Color kText = Color(0xFFF2F1EA);
const Color kTextMuted = Color(0xFF8E8C82);
const Color kOnAccent = Color(0xFF12110F);
const Color kAmber = Color(0xFFF5A623);
const Color kRed = Color(0xFFF2694C);
const Color kDev = Colors.cyanAccent;

/// TODO: replace with your real support address.
const String kSupportEmail = 'support@example.com';

final ThemeData appTheme = ThemeData(
  useMaterial3: true,
  brightness: Brightness.dark,
  primaryColor: kAccent,
  scaffoldBackgroundColor: kBg,
  cardColor: kCard,
  dividerColor: kDivider,
  dialogTheme: const DialogThemeData(backgroundColor: kCard),
  appBarTheme: const AppBarTheme(
    backgroundColor: kBar,
    elevation: 0,
    scrolledUnderElevation: 0,
    iconTheme: IconThemeData(color: kText),
    titleTextStyle: TextStyle(
      color: kText,
      fontSize: 18,
      fontWeight: FontWeight.w700,
      letterSpacing: 0.5,
    ),
  ),
  colorScheme: const ColorScheme.dark(
    primary: kAccent,
    onPrimary: kOnAccent,
    surface: kCard,
    onSurface: kText,
    onSurfaceVariant: kTextMuted,
    outline: kDivider,
  ),
  bottomNavigationBarTheme: const BottomNavigationBarThemeData(
    backgroundColor: kBar,
    selectedItemColor: kAccent,
    unselectedItemColor: Color(0xFF6E7C8F),
    type: BottomNavigationBarType.fixed,
  ),
);

/// "850 m" / "1.4 km"
String formatDistance(double meters) {
  if (meters < 1000) return '${meters.round()} m';
  return '${(meters / 1000).toStringAsFixed(1)} km';
}

// ==========================================
// ROOT APP & AUTH LISTENER
// ==========================================

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Smart Curb App',
      debugShowCheckedModeBanner: false,
      theme: appTheme,
      home: StreamBuilder<User?>(
        stream: FirebaseAuth.instance.authStateChanges(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            );
          }
          return snapshot.hasData ? const UserSpace() : const LoginPage();
        },
      ),
    );
  }
}

// ==========================================
// AUTHENTICATION: LOGIN & REGISTER
// ==========================================

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _isLoading = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final email = _emailCtrl.text.trim();
    final password = _passwordCtrl.text;
    if (email.isEmpty || password.isEmpty) {
      showErrorSnackBar(context, 'Please enter both email and password.');
      return;
    }
    setState(() => _isLoading = true);
    try {
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
    } on FirebaseAuthException catch (e) {
      if (mounted) showErrorSnackBar(context, e.message ?? 'Login failed.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32.0),
            child: Column(
              children: [
                Image.asset(
                  'assets/logo.png',
                  height: 140,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) =>
                      const Icon(Icons.radar, size: 100, color: kAccent),
                ),
                const SizedBox(height: 20),
                const _BrandTitle(fontSize: 28),
                const SizedBox(height: 8),
                const Text(
                  'SMART PARKING',
                  style: TextStyle(
                    color: kTextMuted,
                    fontSize: 12,
                    letterSpacing: 2,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 40),
                AppTextField(
                  controller: _emailCtrl,
                  hintText: 'Email',
                  icon: Icons.email_outlined,
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 16),
                AppTextField(
                  controller: _passwordCtrl,
                  hintText: 'Password',
                  icon: Icons.lock_outline,
                  obscureText: true,
                ),
                const SizedBox(height: 28),
                PrimaryButton(
                  title: 'Login',
                  isLoading: _isLoading,
                  onPressed: _handleLogin,
                ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const RegisterPage()),
                  ),
                  child: const Text(
                    "Don't have an account? Register",
                    style: TextStyle(
                      color: kAccent,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BrandTitle extends StatelessWidget {
  final double fontSize;
  const _BrandTitle({required this.fontSize});

  @override
  Widget build(BuildContext context) {
    return RichText(
      text: TextSpan(
        style: TextStyle(
          fontSize: fontSize,
          fontWeight: FontWeight.bold,
          letterSpacing: 1.5,
        ),
        children: const [
          TextSpan(text: 'SMART ', style: TextStyle(color: kText)),
          TextSpan(text: 'CURB', style: TextStyle(color: kAccent)),
        ],
      ),
    );
  }
}

class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key});

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _isLoading = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _handleRegister() async {
    final email = _emailCtrl.text.trim();
    final password = _passwordCtrl.text;
    if (email.isEmpty || password.isEmpty || _confirmCtrl.text.isEmpty) {
      showErrorSnackBar(context, 'Please fill out all fields.');
      return;
    }
    if (password != _confirmCtrl.text) {
      showErrorSnackBar(context, 'Passwords do not match.');
      return;
    }
    setState(() => _isLoading = true);
    try {
      await FirebaseAuth.instance.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );
      if (mounted) Navigator.pop(context);
    } on FirebaseAuthException catch (e) {
      if (mounted) {
        showErrorSnackBar(context, e.message ?? 'Registration failed.');
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create Account')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32.0),
            child: Column(
              children: [
                const Icon(Icons.person_add_alt_1, size: 70, color: kAccent),
                const SizedBox(height: 16),
                const Text(
                  'Join Smart Curb',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: kText,
                  ),
                ),
                const SizedBox(height: 32),
                AppTextField(
                  controller: _emailCtrl,
                  hintText: 'Email Address',
                  icon: Icons.email_outlined,
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 16),
                AppTextField(
                  controller: _passwordCtrl,
                  hintText: 'Password',
                  icon: Icons.lock_outline,
                  obscureText: true,
                ),
                const SizedBox(height: 16),
                AppTextField(
                  controller: _confirmCtrl,
                  hintText: 'Confirm Password',
                  icon: Icons.lock_reset,
                  obscureText: true,
                ),
                const SizedBox(height: 28),
                PrimaryButton(
                  title: 'Register',
                  isLoading: _isLoading,
                  onPressed: _handleRegister,
                ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text(
                    'Already have an account? Back to Login',
                    style: TextStyle(
                      color: kAccent,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ==========================================
// USER DASHBOARD HUB
// ==========================================

class UserSpace extends StatefulWidget {
  const UserSpace({super.key});

  @override
  State<UserSpace> createState() => _UserSpaceState();
}

class _UserSpaceState extends State<UserSpace> {
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.logout),
          tooltip: 'Logout',
          onPressed: () => FirebaseAuth.instance.signOut(),
        ),
        // The old search field did nothing, so it is replaced by the brand title.
        title: const _BrandTitle(fontSize: 18),
        centerTitle: true,
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert, color: kAccent),
            color: kCard,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            offset: const Offset(0, 50),
            onSelected: (val) {
              final page = (val == 'settings')
                  ? const UserSettingsPage()
                  : const UserAboutPage();
              Navigator.push(context, MaterialPageRoute(builder: (_) => page));
            },
            itemBuilder: (_) => [
              _buildMenuItem('settings', Icons.settings, 'Settings'),
              _buildMenuItem('about', Icons.info_outline, 'About App'),
            ],
          ),
        ],
      ),
      body: IndexedStack(
        index: _currentIndex,
        children: const [
          _HomeTab(),
          _VehicleTab(),
          _ProfileTab(),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
          BottomNavigationBarItem(
            icon: Icon(Icons.directions_car),
            label: 'Vehicle',
          ),
          BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }

  PopupMenuItem<String> _buildMenuItem(String val, IconData icon, String label) {
    return PopupMenuItem(
      value: val,
      child: Row(
        children: [
          Icon(icon, color: kTextMuted, size: 20),
          const SizedBox(width: 12),
          Text(label, style: const TextStyle(color: kText)),
        ],
      ),
    );
  }
}

// ==========================================
// TAB 1: HOME (Places & Campus Management)
// ==========================================

Widget buildCampusLogo(String shortName) {
  return Container(
    width: 52,
    height: 52,
    decoration: BoxDecoration(
      color: const Color(0xFF003366),
      borderRadius: BorderRadius.circular(10),
      border: Border.all(color: const Color(0xFFCC0000), width: 1.5),
    ),
    alignment: Alignment.center,
    child: Text(
      shortName,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 16,
        fontWeight: FontWeight.w900,
        letterSpacing: 1,
      ),
    ),
  );
}

class _HomeTab extends StatefulWidget {
  const _HomeTab();

  @override
  State<_HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<_HomeTab> {
  static const List<Map<String, String>> _availableCampuses = [
    {
      'id': 'fau_boca',
      'shortName': 'FAU',
      'fullName': 'Florida Atlantic University',
      'address': '777 Glades Rd, Boca Raton, FL 33431',
    },
  ];

  // Stream is created once instead of on every build (avoids re-subscribing).
  late final String? _uid = FirebaseAuth.instance.currentUser?.uid;
  late final Stream<DatabaseEvent>? _stream = _uid == null
      ? null
      : FirebaseDatabase.instance.ref('drivers/$_uid/locations').onValue;

  void _addCampus(Map<String, String> campus) {
    final uid = _uid;
    if (uid == null) return;
    FirebaseDatabase.instance.ref('drivers/$uid/locations/${campus['id']}').set({
      'shortName': campus['shortName'],
      'fullName': campus['fullName'],
      'address': campus['address'],
      'addedAt': ServerValue.timestamp,
    });
  }

  void _showAddSpaceDialog() {
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (dialogCtx) => Dialog(
        backgroundColor: kCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(maxWidth: 550, maxHeight: 600),
          padding: const EdgeInsets.all(20.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    icon: const Icon(Icons.close),
                    color: kText,
                    tooltip: 'Close',
                    onPressed: () => Navigator.of(dialogCtx).pop(),
                  ),
                  const Text(
                    'Select Location',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: kText,
                    ),
                  ),
                  const SizedBox(width: 48),
                ],
              ),
              const Divider(height: 24),
              Expanded(
                child: ListView.builder(
                  itemCount: _availableCampuses.length,
                  itemBuilder: (context, index) {
                    final campus = _availableCampuses[index];
                    return Container(
                      margin: const EdgeInsets.only(bottom: 12.0),
                      padding: const EdgeInsets.all(16.0),
                      decoration: BoxDecoration(
                        color: kBg,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: kDivider),
                      ),
                      child: Row(
                        children: [
                          buildCampusLogo(campus['shortName']!),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  campus['fullName']!,
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.bold,
                                    color: kText,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  campus['address']!,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: kTextMuted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 10),
                          ElevatedButton(
                            onPressed: () {
                              Navigator.of(dialogCtx).pop();
                              _addCampus(campus);
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: kAccent,
                              foregroundColor: kOnAccent,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 10,
                              ),
                            ),
                            child: const Text(
                              'Add',
                              style: TextStyle(fontWeight: FontWeight.bold),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final uid = _uid;
    if (uid == null) {
      return const Center(child: Text('User not signed in.'));
    }

    return StreamBuilder<DatabaseEvent>(
      stream: _stream,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final rawData = snapshot.data?.snapshot.value;
        if (rawData is! Map) {
          return AnimatedAddCard(
            title: 'No Locations Found',
            subtitle: 'Tap to add a new location',
            onTap: _showAddSpaceDialog,
          );
        }

        final locationEntries = rawData.entries.toList();

        return ListView(
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 16.0),
          children: [
            for (final entry in locationEntries)
              if (entry.value is Map)
                _buildLocationCard(
                  uid,
                  entry.key.toString(),
                  Map<String, dynamic>.from(entry.value as Map),
                ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: _showAddSpaceDialog,
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                side: const BorderSide(color: kAccent, width: 1.5),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text(
                'Add more locations',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: kAccent,
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildLocationCard(String uid, String locKey, Map<String, dynamic> data) {
    final shortName = data['shortName']?.toString() ?? 'FAU';
    final fullName = data['fullName']?.toString() ?? 'Florida Atlantic University';
    final address =
        data['address']?.toString() ?? '777 Glades Rd, Boca Raton, FL 33431';

    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const FauMapScreen()),
        ),
        child: Container(
          padding: const EdgeInsets.all(20.0),
          decoration: BoxDecoration(
            color: kCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: kDivider, width: 1.5),
          ),
          child: Row(
            children: [
              buildCampusLogo(shortName),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      fullName,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                        color: kText,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      address,
                      style: const TextStyle(fontSize: 13, color: kTextMuted),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.delete_outline, size: 20),
                color: Colors.redAccent.withValues(alpha: 0.7),
                tooltip: 'Remove Place',
                onPressed: () => FirebaseDatabase.instance
                    .ref('drivers/$uid/locations/$locKey')
                    .remove(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

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

  /// Signed shortest rotation (-180..180] from one angle to another.
  static double shortestAngle(double from, double to) {
    var d = (to - from) % 360.0; // Dart % is always >= 0 here
    if (d > 180.0) d -= 360.0;
    return d;
  }
}

// ==========================================
// FAU CAMPUS MODELS & A* PATHFINDING
// ==========================================

class FauBuilding {
  final String id;
  final String code;
  final String name;
  final LatLng position;

  const FauBuilding({
    required this.id,
    required this.code,
    required this.name,
    required this.position,
  });
}

class PathResult {
  final String lotId;
  final List<LatLng> pathPoints;
  final double totalDistanceMeters;

  const PathResult({
    required this.lotId,
    required this.pathPoints,
    required this.totalDistanceMeters,
  });
}

class _GraphSnap {
  final String a;
  final String b;
  final LatLng point;
  final double dist;
  const _GraphSnap(this.a, this.b, this.point, this.dist);
}

/// Tiny binary min-heap for the A* open set (O(log n) instead of sorting).
class _MinHeap {
  final List<double> _keys = [];
  final List<String> _vals = [];

  bool get isNotEmpty => _keys.isNotEmpty;

  void push(double key, String val) {
    _keys.add(key);
    _vals.add(val);
    var i = _keys.length - 1;
    while (i > 0) {
      final p = (i - 1) >> 1;
      if (_keys[p] <= _keys[i]) break;
      _swap(i, p);
      i = p;
    }
  }

  String pop() {
    final top = _vals[0];
    final lastK = _keys.removeLast();
    final lastV = _vals.removeLast();
    if (_keys.isNotEmpty) {
      _keys[0] = lastK;
      _vals[0] = lastV;
      var i = 0;
      final n = _keys.length;
      while (true) {
        final l = 2 * i + 1;
        final r = l + 1;
        var m = i;
        if (l < n && _keys[l] < _keys[m]) m = l;
        if (r < n && _keys[r] < _keys[m]) m = r;
        if (m == i) break;
        _swap(i, m);
        i = m;
      }
    }
    return top;
  }

  void _swap(int a, int b) {
    final k = _keys[a];
    _keys[a] = _keys[b];
    _keys[b] = k;
    final v = _vals[a];
    _vals[a] = _vals[b];
    _vals[b] = v;
  }
}

class CampusPathfinder {
  /// Walkway nodes. The map key IS the id, so ids can never mismatch.
  static final Map<String, LatLng> nodes = {
    'lot12': const LatLng(26.373262, -80.106806),
    'lot14': const LatLng(26.373005, -80.099683),
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
  };

  /// Walkways, listed once each. They are always two-way, so a one-sided
  /// neighbor list can no longer break the graph.
  static const List<List<String>> edges = [
    ['lot12', 'ed47_west'],
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
    ['bc71_east', 'lot14'],
  ];

  static final Map<String, Map<String, double>> _adj = _buildAdjacency();

  static Map<String, Map<String, double>> _buildAdjacency() {
    final adj = <String, Map<String, double>>{};
    for (final e in edges) {
      final a = nodes[e[0]];
      final b = nodes[e[1]];
      assert(a != null, 'Walkway edge references unknown node "${e[0]}"');
      assert(b != null, 'Walkway edge references unknown node "${e[1]}"');
      if (a == null || b == null || e[0] == e[1]) continue;
      final w = Geo.meters(a, b);
      adj.putIfAbsent(e[0], () => {})[e[1]] = w;
      adj.putIfAbsent(e[1], () => {})[e[0]] = w;
    }
    return adj;
  }

  /// Lots and buildings never move, so each lot→building walk is computed once.
  static final Map<String, PathResult> _cache = {};

  static PathResult walkingRoute(String lotId, LatLng lotPos, LatLng buildingPos) {
    final key = '$lotId|${buildingPos.latitude},${buildingPos.longitude}';
    return _cache.putIfAbsent(key, () {
      final path = findPath(lotPos, buildingPos);
      return PathResult(
        lotId: lotId,
        pathPoints: path,
        totalDistanceMeters: Geo.pathLength(path),
      );
    });
  }

  /// Closest non-full lot by real walking distance. Lots with no sensors
  /// (capacity 0) are treated as unknown and skipped.
  static PathResult? findBestAvailableRoute({
    required LatLng buildingPos,
    required Map<String, Map<String, dynamic>> lots,
  }) {
    PathResult? best;
    for (final entry in lots.entries) {
      final occupied = (entry.value['occupied'] as num?)?.toInt() ?? 0;
      final capacity = (entry.value['capacity'] as num?)?.toInt() ?? 0;
      if (capacity <= 0 || occupied >= capacity) continue;

      final lotPos = entry.value['position'] as LatLng?;
      if (lotPos == null) continue;

      final r = walkingRoute(entry.key, lotPos, buildingPos);
      if (best == null || r.totalDistanceMeters < best.totalDistanceMeters) {
        best = r;
      }
    }
    return best;
  }

  /// Projects p onto the nearest walkway segment (not just nearest node),
  /// so start/goal points between nodes route correctly.
  static _GraphSnap _snapToGraph(LatLng p) {
    _GraphSnap? best;
    for (final e in edges) {
      final pa = nodes[e[0]];
      final pb = nodes[e[1]];
      if (pa == null || pb == null) continue;
      final q = Geo.lerp(pa, pb, Geo.projectT(p, pa, pb));
      final d = Geo.meters(p, q);
      if (best == null || d < best.dist) best = _GraphSnap(e[0], e[1], q, d);
    }
    return best!;
  }

  static List<LatLng> findPath(LatLng start, LatLng goal) {
    final s = _snapToGraph(start);
    final g = _snapToGraph(goal);
    const sId = '__start';
    const gId = '__goal';

    // Temporary edges connecting the snapped start/goal into the graph.
    final extra = <String, Map<String, double>>{};
    void link(String u, String v, double w) {
      extra.putIfAbsent(u, () => {})[v] = w;
      extra.putIfAbsent(v, () => {})[u] = w;
    }

    link(sId, s.a, Geo.meters(s.point, nodes[s.a]!));
    link(sId, s.b, Geo.meters(s.point, nodes[s.b]!));
    link(gId, g.a, Geo.meters(g.point, nodes[g.a]!));
    link(gId, g.b, Geo.meters(g.point, nodes[g.b]!));
    if (s.a == g.a && s.b == g.b) {
      link(sId, gId, Geo.meters(s.point, g.point)); // same walkway
    }

    LatLng posOf(String id) =>
        id == sId ? s.point : (id == gId ? g.point : nodes[id]!);

    final gScore = <String, double>{sId: 0.0};
    final cameFrom = <String, String>{};
    final closed = <String>{};
    final open = _MinHeap()..push(Geo.meters(s.point, g.point), sId);

    while (open.isNotEmpty) {
      final current = open.pop();
      if (!closed.add(current)) continue; // stale heap entry

      if (current == gId) {
        final ids = <String>[gId];
        var c = gId;
        while (cameFrom.containsKey(c)) {
          c = cameFrom[c]!;
          ids.add(c);
        }
        final raw = <LatLng>[start, ...ids.reversed.map(posOf), goal];
        // Drop near-duplicate consecutive points.
        final out = <LatLng>[raw.first];
        for (final p in raw.skip(1)) {
          if (Geo.meters(out.last, p) > 0.5) out.add(p);
        }
        if (out.length == 1) out.add(goal);
        return out;
      }

      final gc = gScore[current]!;
      final neighborMaps = [_adj[current], extra[current]];
      for (final m in neighborMaps) {
        if (m == null) continue;
        m.forEach((nId, w) {
          if (closed.contains(nId)) return;
          final tentative = gc + w;
          if (tentative < (gScore[nId] ?? double.infinity)) {
            gScore[nId] = tentative;
            cameFrom[nId] = current;
            open.push(tentative + Geo.meters(posOf(nId), g.point), nId);
          }
        });
      }
    }

    return [start, goal]; // unreachable (graph disconnected)
  }
}

// ---------------------------------------------------------
// REAL STREET ROUTING (OSRM)
// ---------------------------------------------------------

class RealRoadRouter {
  static final http.Client _client = http.Client(); // reuse connections

  static Future<List<LatLng>> getRoadRoute({
    required LatLng start,
    required LatLng destination,
  }) async {
    final url = Uri.parse(
      'https://router.project-osrm.org/route/v1/driving/'
      '${start.longitude},${start.latitude};'
      '${destination.longitude},${destination.latitude}'
      '?overview=full&geometries=geojson',
    );

    try {
      final response =
          await _client.get(url).timeout(const Duration(seconds: 10));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final routes = data['routes'] as List<dynamic>?;
        if (routes != null && routes.isNotEmpty) {
          final coords = routes[0]['geometry']['coordinates'] as List<dynamic>;
          final pts = coords
              .map((pt) => LatLng(
                    (pt[1] as num).toDouble(),
                    (pt[0] as num).toDouble(),
                  ))
              .toList();
          if (pts.length >= 2) return pts;
        }
      } else {
        debugPrint('OSRM returned status ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('OSRM routing error: $e');
    }
    return [start, destination];
  }
}

// ==========================================
// FAU CAMPUS MAP SCREEN (MapLibre GL, 3D)
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

/// Square polygon around [c] (used for the 3D lot pillars and destination beacon).
Map<String, dynamic> _squareFeature(
  LatLng c,
  double halfMeters,
  Map<String, dynamic> props,
) {
  final dLat = halfMeters / 111320.0;
  final dLng = halfMeters / (111320.0 * math.cos(c.latitude * math.pi / 180.0));
  final ring = [
    [c.longitude - dLng, c.latitude - dLat],
    [c.longitude + dLng, c.latitude - dLat],
    [c.longitude + dLng, c.latitude + dLat],
    [c.longitude - dLng, c.latitude + dLat],
    [c.longitude - dLng, c.latitude - dLat],
  ];
  return {
    'type': 'Feature',
    'properties': props,
    'geometry': {
      'type': 'Polygon',
      'coordinates': [ring],
    },
  };
}

String _hex(Color c) =>
    '#${(c.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';

/// Draws the navigation arrow once and caches the PNG bytes.
final Future<Uint8List> _puckIconBytes = _drawPuckIcon();

Future<Uint8List> _drawPuckIcon() async {
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
  final arrow = Path()
    ..moveTo(s / 2, s / 2 - 19)
    ..lineTo(s / 2 + 13, s / 2 + 15)
    ..lineTo(s / 2, s / 2 + 7)
    ..lineTo(s / 2 - 13, s / 2 + 15)
    ..close();
  canvas.drawPath(arrow, Paint()..color = kAccent);

  final image = await recorder.endRecording().toImage(s.toInt(), s.toInt());
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  return data!.buffer.asUint8List();
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

class FauMapScreen extends StatefulWidget {
  const FauMapScreen({super.key});

  @override
  State<FauMapScreen> createState() => _FauMapScreenState();
}

class _FauMapScreenState extends State<FauMapScreen> {
  // ---- map style ----
  /// Bright, detailed OpenStreetMap style (free, no API key).
  static const String _styleUrl = 'https://tiles.openfreemap.org/styles/liberty';

  // ---- camera tuning ----
  static const double _overviewZoom = 16.0;
  static const double _overviewTilt = 50.0;
  static const double _navZoom = 18.0;
  static const double _navTilt = 60.0;

  // ---- routing tuning ----
  static const double _offRouteMeters = 35.0;
  static const double _arrivalMeters = 10.0;
  static const double _maxGpsAccuracyForReroute = 30.0;
  static const Duration _rerouteCooldown = Duration(seconds: 6);
  static const Duration _simTick = Duration(milliseconds: 50);
  static const double _simMetersPerTick = 0.447; // 20 mph at 50 ms ticks

  // ---- campus geometry ----
  static const LatLng _campusEntrance = LatLng(26.3685, -80.1020);
  static const LatLng _sw = LatLng(26.3630, -80.1170);
  static const LatLng _ne = LatLng(26.3860, -80.0890);
  static const LatLng _fauCenter = LatLng(26.3745, -80.1030);
  static final CameraTargetBounds _cameraBounds =
      CameraTargetBounds(LatLngBounds(southwest: _sw, northeast: _ne));

  static bool _inCampus(LatLng p) =>
      p.latitude >= _sw.latitude &&
      p.latitude <= _ne.latitude &&
      p.longitude >= _sw.longitude &&
      p.longitude <= _ne.longitude;

  // ---- map source / layer ids ----
  static const String _srcRoute = 'sc-route';
  static const String _srcPillars = 'sc-lot-pillars';
  static const String _srcBeacon = 'sc-beacon';
  static const String _srcLots = 'sc-lots';
  static const String _srcBuildings = 'sc-buildings';
  static const String _srcPuck = 'sc-puck';
  static const String _layerBuildings3d = 'sc-buildings-3d';
  static const String _puckImage = 'sc-puck-arrow';
  static const List<String> _fonts = ['Noto Sans Regular'];

  static final Map<String, LatLng> _lotPositions = {
    'lot12': CampusPathfinder.nodes['lot12']!,
    'lot14': CampusPathfinder.nodes['lot14']!,
    'lot07': CampusPathfinder.nodes['lot07']!,
    'lot06': CampusPathfinder.nodes['lot06']!,
  };

  static const List<FauBuilding> _campusBuildings = [
    FauBuilding(
      id: 'ed47',
      code: 'ED-47',
      name: 'College of Education (ED-47)',
      position: LatLng(26.373358, -80.105828),
    ),
    FauBuilding(
      id: 'bc71',
      code: 'BC-71',
      name: 'Charles E. Schmidt Biomedical Science Center (BC-71)',
      position: LatLng(26.373263, -80.100446),
    ),
    FauBuilding(
      id: 'cm22',
      code: 'CM-22',
      name: 'Computer Center (CM-22)',
      position: LatLng(26.372528, -80.104044),
    ),
  ];

  // ---- map ----
  MapLibreMapController? _map;
  bool _styleReady = false;
  bool _introPlayed = false;
  bool _is3D = true;
  late final _SourceSync _sync = _SourceSync(_sendSource);
  Offset? _pointerDownAt;
  DateTime _lastCamAt = DateTime.fromMillisecondsSinceEpoch(0);
  double _camBearing = 0;

  // ---- subscriptions ----
  StreamSubscription<geo.Position>? _positionSub;
  StreamSubscription<DatabaseEvent>? _parkingSub;
  StreamSubscription<CompassEvent>? _compassSub;
  Timer? _simTimer;
  int _simTickCount = 0;

  /// Dev mode: last tapped coordinate (notifier = no full rebuild).
  final ValueNotifier<LatLng?> _devTap = ValueNotifier(null);

  // ---- location ----
  LatLng? _userPos;
  double _heading = 0;
  DateTime _lastGpsHeadingAt = DateTime.fromMillisecondsSinceEpoch(0);
  bool _isLocating = false;
  String _gpsStatus = 'Searching for GPS...';

  // ---- modes ----
  bool _navTracking = false;
  bool _devMode = false;
  bool _devLocationOverride = false;
  bool _isSimulating = false;

  // ---- routing ----
  FauBuilding? _selectedBuilding;
  PathResult? _walkResult;
  String? _routeLotId;
  List<LatLng> _fullRoute = const [];
  List<double> _routeSuffix = const [];
  List<LatLng> _displayRoute = const [];
  int _routeSeg = 0;
  double _routeRemaining = 0;
  double _distToRoute = 0;
  bool _arrived = false;
  int _routeRequestId = 0;
  bool _isRouting = false;
  DateTime _lastRouteAt = DateTime.fromMillisecondsSinceEpoch(0);

  Map<String, Map<String, dynamic>> _liveLots = {};

  bool get _isOnCampus => _userPos != null && _inCampus(_userPos!);

  // ==========================================
  // LIFECYCLE
  // ==========================================

  @override
  void initState() {
    super.initState();
    _startLiveLocationTracking();
    _startCompassTracking();
    _listenToFirebaseParking();
  }

  @override
  void dispose() {
    _simTimer?.cancel();
    _positionSub?.cancel();
    _compassSub?.cancel();
    _parkingSub?.cancel();
    _devTap.dispose();
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
          target: _fauCenter,
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
            // Buildings "grow" out of the ground as you zoom in.
            fillExtrusionHeight: [
              'interpolate', ['linear'], ['zoom'],
              14.5, 0,
              15.5, height,
            ],
            fillExtrusionBase: [
              'interpolate', ['linear'], ['zoom'],
              14.5, 0,
              15.5, base,
            ],
            fillExtrusionOpacity: 0.9,
          ),
          sourceLayer: 'building',
          minzoom: 14.5,
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
      _srcPillars,
      _srcBeacon,
      _srcLots,
      _srcBuildings,
      _srcPuck,
    ]) {
      await safe('source $id', () => m.addGeoJsonSource(id, empty));
    }

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

    // ---- 3D lot pillars (height = free spots) & destination beacon ----
    await safe(
      'lot pillars',
      () => m.addFillExtrusionLayer(
        _srcPillars,
        'sc-lot-pillars',
        const FillExtrusionLayerProperties(
          fillExtrusionColor: ['get', 'color'],
          fillExtrusionHeight: ['get', 'height'],
          fillExtrusionBase: 0,
          fillExtrusionOpacity: 0.85,
        ),
        enableInteraction: false,
      ),
    );
    await safe(
      'beacon',
      () => m.addFillExtrusionLayer(
        _srcBeacon,
        'sc-beacon',
        FillExtrusionLayerProperties(
          fillExtrusionColor: _hex(kDev),
          fillExtrusionHeight: ['get', 'height'],
          fillExtrusionBase: 0,
          fillExtrusionOpacity: 0.8,
        ),
        enableInteraction: false,
      ),
    );

    // ---- building markers ----
    const isSelected = ['==', ['get', 'selected'], true];
    await safe(
      'building dots',
      () => m.addCircleLayer(
        _srcBuildings,
        'sc-buildings-dot',
        CircleLayerProperties(
          circleRadius: ['case', isSelected, 8, 5],
          circleColor: ['case', isSelected, _hex(kAccent), _hex(kDev)],
          circleStrokeColor: '#000000',
          circleStrokeWidth: 2,
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
          textSize: ['case', isSelected, 14, 11],
          textColor: ['case', isSelected, _hex(kAccent), '#FFFFFF'],
          textHaloColor: '#000000',
          textHaloWidth: 1.6,
          textAnchor: 'top',
          textOffset: [0, 0.9],
          textAllowOverlap: true,
          textIgnorePlacement: true,
        ),
        enableInteraction: false,
      ),
    );

    // ---- lot labels ----
    await safe(
      'lot labels',
      () => m.addSymbolLayer(
        _srcLots,
        'sc-lots-label',
        const SymbolLayerProperties(
          textField: ['get', 'label'],
          textFont: _fonts,
          textSize: ['case', ['==', ['get', 'best'], true], 13, 11],
          textColor: ['get', 'color'],
          textHaloColor: '#000000',
          textHaloWidth: 1.8,
          textJustify: 'center',
          textAllowOverlap: true,
          textIgnorePlacement: true,
        ),
        enableInteraction: false,
      ),
    );

    // ---- user puck: flat glow + arrow that lies on the tilted map ----
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
    await safe('puck icon', () async {
      await m.addImage(_puckImage, await _puckIconBytes);
      return null;
    });
    await safe(
      'puck arrow',
      () => m.addSymbolLayer(
        _srcPuck,
        'sc-puck-arrow',
        const SymbolLayerProperties(
          iconImage: _puckImage,
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
    _pushOverlays();
    _pushRoute();
    _pushPuck();
  }

  void _pushOverlays() {
    _pushLots();
    _pushBuildings();
  }

  void _pushLots() {
    final bestId = _walkResult?.lotId;
    final labels = <Map<String, dynamic>>[];
    final pillars = <Map<String, dynamic>>[];

    _liveLots.forEach((id, lot) {
      final pos = lot['position'] as LatLng;
      final isBest = id == bestId;
      final color = _hex(isBest ? kAccent : lot['color'] as Color);
      final cap = lot['capacity'] as int;
      final free = math.max(0, cap - (lot['occupied'] as int));
      final height = cap == 0 ? 3.0 : (6.0 + free * 3.0).clamp(6.0, 60.0);

      labels.add(_pointFeature(pos, {
        'label': '${lot['name']}\n${lot['status']}',
        'color': color,
        'best': isBest,
      }));
      pillars.add(_squareFeature(pos, isBest ? 9 : 7, {
        'color': color,
        'height': height,
      }));
    });

    _sync.push(_srcLots, _fc(labels));
    _sync.push(_srcPillars, _fc(pillars));
  }

  void _pushBuildings() {
    final selectedId = _selectedBuilding?.id;
    _sync.push(
      _srcBuildings,
      _fc([
        for (final b in _campusBuildings)
          _pointFeature(b.position, {
            'code': b.code,
            'selected': b.id == selectedId,
          }),
      ]),
    );
    final sel = _selectedBuilding;
    _sync.push(
      _srcBeacon,
      _fc(sel == null
          ? const <Map<String, dynamic>>[]
          : [
              _squareFeature(sel.position, 4, {'height': 45.0}),
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
  }

  void _pushPuck() {
    final p = _userPos;
    _sync.push(
      _srcPuck,
      _fc(p == null
          ? const <Map<String, dynamic>>[]
          : [
              _pointFeature(p, {'bearing': _puckBearing()}),
            ]),
    );
  }

  // ==========================================
  // CAMERA
  // ==========================================

  void _animateTo(CameraPosition p, Duration d) {
    final m = _map;
    if (m == null) return;
    _guard(() => m.animateCamera(CameraUpdate.newCameraPosition(p), duration: d));
  }

  /// Follow-camera for navigation. Linear easing chains smoothly between
  /// successive calls; calls are throttled so the channel never floods.
  void _follow(LatLng pos, double bearing, Duration d, {bool force = false}) {
    final m = _map;
    if (m == null || !_navTracking) return;
    final now = DateTime.now();
    if (!force &&
        now.difference(_lastCamAt) < const Duration(milliseconds: 150)) {
      return;
    }
    _lastCamAt = now;
    _guard(() => m.easeCamera(
          CameraUpdate.newCameraPosition(CameraPosition(
            target: pos,
            zoom: _navZoom,
            bearing: bearing,
            tilt: _is3D ? _navTilt : 0,
          )),
          duration: d,
          interpolation: CameraAnimationInterpolation.linear,
        ));
  }

  void _setNavTracking(bool on, {bool recenter = true}) {
    final pos = _userPos;
    final m = _map;
    setState(() => _navTracking = on);
    if (m == null) return;

    if (on && pos != null) {
      _camBearing = _heading;
      // Push the focal point down so you see more road ahead.
      final h = MediaQuery.of(context).size.height;
      _guard(() => m.setPadding(top: h * 0.35, animated: true));
      _animateTo(
        CameraPosition(
          target: pos,
          zoom: _navZoom,
          bearing: _heading,
          tilt: _is3D ? _navTilt : 0,
        ),
        const Duration(milliseconds: 800),
      );
    } else {
      _guard(() => m.setPadding(animated: true));
      if (recenter && pos != null) {
        _animateTo(
          CameraPosition(
            target: pos,
            zoom: 16.5,
            bearing: 0,
            tilt: _is3D ? _overviewTilt : 0,
          ),
          const Duration(milliseconds: 800),
        );
      }
    }
  }

  void _toggle3D() {
    final m = _map;
    setState(() => _is3D = !_is3D);
    if (m == null) return;
    final tilt = !_is3D ? 0.0 : (_navTracking ? _navTilt : _overviewTilt);
    _guard(() => m.animateCamera(
          CameraUpdate.tiltTo(tilt),
          duration: const Duration(milliseconds: 700),
        ));
  }

  void _resetView() {
    _clearDestination();
    if (_navTracking) _setNavTracking(false, recenter: false);
    _animateTo(
      CameraPosition(
        target: _fauCenter,
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
    _compassSub = FlutterCompass.events?.listen((event) {
      if (!mounted || _isSimulating) return;
      if (DateTime.now().difference(_lastGpsHeadingAt) <
          const Duration(seconds: 3)) {
        return; // GPS course wins while driving
      }
      final raw = event.headingForCameraMode ?? event.heading;
      if (raw == null) return;
      final h = raw % 360.0;
      if (Geo.shortestAngle(_heading, h).abs() < 2.0) return;

      setState(() => _heading = h);
      _pushPuck();
      if (_navTracking && _isOnCampus) {
        _follow(_userPos!, h, const Duration(milliseconds: 300));
      }
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
        locationSettings: const geo.LocationSettings(
          accuracy: geo.LocationAccuracy.bestForNavigation,
          distanceFilter: 2,
        ),
      ).listen(
        _handlePosition,
        onError: (Object e) => fail('GPS stream error: $e'),
      );
    } catch (e) {
      fail('Error reading GPS: $e');
    }
  }

  void _handlePosition(geo.Position p) {
    if (!mounted) return;
    if (_isSimulating || _devLocationOverride) return;

    final loc = LatLng(p.latitude, p.longitude);
    final onCampus = _inCampus(loc);
    final hasCourse = p.speed > 1.0 && p.heading >= 0;
    var progress = _Progress.none;
    final wasTracking = _navTracking;

    setState(() {
      _userPos = loc;
      _isLocating = false;
      _gpsStatus =
          'Live GPS: ${p.latitude.toStringAsFixed(4)}, ${p.longitude.toStringAsFixed(4)}';
      if (hasCourse) {
        _heading = p.heading;
        _lastGpsHeadingAt = DateTime.now();
      }
      progress = _updateRouteProgress(loc);
    });

    _pushPuck();
    _pushRoute();

    if (wasTracking && !onCampus) {
      _setNavTracking(false, recenter: false);
    } else if (_navTracking) {
      _follow(loc, _heading, const Duration(milliseconds: 1000));
    }

    if (progress == _Progress.arrived) _onArrived();
    if (progress == _Progress.offRoute &&
        p.accuracy <= _maxGpsAccuracyForReroute) {
      _maybeReroute();
    }
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

  static String _prettyLotName(String id) {
    final m = RegExp(r'^lot0*(\d+)$', caseSensitive: false).firstMatch(id);
    return m != null ? 'Lot ${m.group(1)}' : id.toUpperCase();
  }

  static LatLng? _readLatLng(Map<String, dynamic> data) {
    final lat = data['lat'] ?? data['latitude'];
    final lng = data['lng'] ?? data['longitude'];
    if (lat is num && lng is num) return LatLng(lat.toDouble(), lng.toDouble());
    return null;
  }

  Map<String, Map<String, dynamic>> _parseLots(Object? raw) {
    if (raw is! Map) return {};
    final rawLots = raw['lots'] is Map ? raw['lots'] as Map : const {};
    final rawUnits = raw['units'] is Map ? raw['units'] as Map : const {};

    final capacity = <String, int>{};
    final occupied = <String, int>{};
    for (final unit in rawUnits.values) {
      if (unit is! Map) continue;
      final lot = unit['lot']?.toString();
      if (lot == null || lot.isEmpty) continue;
      final occ = unit['occupied'];
      final isOcc = occ == true || occ == 1 || occ == 'true';
      capacity[lot] = (capacity[lot] ?? 0) + 1;
      if (isOcc) occupied[lot] = (occupied[lot] ?? 0) + 1;
    }

    final result = <String, Map<String, dynamic>>{};
    rawLots.forEach((key, val) {
      final lotId = key.toString();
      final lotData =
          val is Map ? Map<String, dynamic>.from(val) : <String, dynamic>{};
      final pos = _lotPositions[lotId] ?? _readLatLng(lotData);
      if (pos == null) return;

      final total = capacity[lotId] ?? 0;
      final occ = occupied[lotId] ?? 0;
      final ratio = total > 0 ? occ / total : 0.0;
      final Color color;
      if (total == 0) {
        color = Colors.grey;
      } else if (ratio < 0.60) {
        color = kAccent;
      } else if (ratio < 0.90) {
        color = kAmber;
      } else {
        color = kRed;
      }

      result[lotId] = {
        'name': lotData['name']?.toString() ?? _prettyLotName(lotId),
        'status': '$occ/$total',
        'occupied': occ,
        'capacity': total,
        'position': pos,
        'color': color,
      };
    });
    return result;
  }

  void _listenToFirebaseParking() {
    _parkingSub = FirebaseDatabase.instance.ref('demo').onValue.listen((event) {
      if (!mounted) return;
      final lots = _parseLots(event.snapshot.value);
      setState(() => _liveLots = lots);

      final building = _selectedBuilding;
      if (building == null) {
        _pushOverlays();
        return;
      }

      final best = CampusPathfinder.findBestAvailableRoute(
        buildingPos: building.position,
        lots: lots,
      );

      // Only hit OSRM when the recommended lot actually changes.
      if (best?.lotId != _routeLotId) {
        _updateNavigationRoute();
      } else if (_fullRoute.isEmpty && !_isRouting && !_arrived) {
        _updateNavigationRoute();
      } else if (best != null) {
        setState(() => _walkResult = best);
      }
      _pushOverlays();
    });
  }

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
    final best = CampusPathfinder.findBestAvailableRoute(
      buildingPos: building.position,
      lots: _liveLots,
    );

    if (best == null) {
      setState(() {
        _walkResult = null;
        _routeLotId = null;
        _isRouting = false;
        _clearDrivingRoute();
      });
      _pushOverlays();
      _pushRoute();
      return;
    }

    final lotPos = _liveLots[best.lotId]!['position'] as LatLng;
    setState(() {
      _walkResult = best;
      _isRouting = true;
    });
    _pushOverlays();
    _lastRouteAt = DateTime.now();

    final start = _userPos ?? await _quickFix() ?? _campusEntrance;
    if (!mounted || reqId != _routeRequestId) return;

    final road =
        await RealRoadRouter.getRoadRoute(start: start, destination: lotPos);
    if (!mounted || reqId != _routeRequestId) return;

    setState(() {
      _isRouting = false;
      _routeLotId = best.lotId;
      _fullRoute = road;
      _routeSuffix = _suffixLengths(road);
      _routeSeg = 0;
      _distToRoute = 0;
      _arrived = false;
      _displayRoute = List<LatLng>.of(road);
      _routeRemaining = _routeSuffix.first;
    });
    _pushRoute();
    _pushPuck();
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
    _distToRoute = 0;
    _arrived = false;
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
  _Progress _updateRouteProgress(LatLng pos) {
    final route = _fullRoute;
    if (route.length < 2 || _arrived) return _Progress.none;

    final proj = _project(
      pos,
      math.max(0, _routeSeg - 2),
      math.min(route.length - 2, _routeSeg + 25),
    );
    _distToRoute = proj.dist;
    if (proj.dist > _offRouteMeters) return _Progress.offRoute;

    _routeSeg = proj.seg;
    _routeRemaining =
        Geo.meters(proj.point, route[proj.seg + 1]) + _routeSuffix[proj.seg + 1];

    if (_routeRemaining <= _arrivalMeters) {
      _arrived = true;
      _displayRoute = const [];
      return _Progress.arrived;
    }
    _displayRoute = [pos, ...route.sublist(proj.seg + 1)];
    return _Progress.onRoute;
  }

  void _onArrived() {
    if (!mounted) return;
    final lotName = _liveLots[_routeLotId]?['name'] ?? 'the lot';
    final walk = _walkResult;
    final building = _selectedBuilding;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          walk != null && building != null
              ? 'Arrived at $lotName. About ${formatDistance(walk.totalDistanceMeters)} walk to ${building.code}.'
              : 'Arrived at $lotName.',
        ),
      ),
    );
  }

  void _onBuildingSelected(FauBuilding building) {
    _stopSimulation();
    setState(() {
      _selectedBuilding = building;
      _routeLotId = null;
      _clearDrivingRoute();
      _walkResult = CampusPathfinder.findBestAvailableRoute(
        buildingPos: building.position,
        lots: _liveLots,
      );
    });
    _pushOverlays();
    _pushRoute();
    _updateNavigationRoute();

    final m = _map;
    if (m != null && !_navTracking) {
      _guard(() => m.animateCamera(
            CameraUpdate.newLatLngZoom(building.position, 17.0),
            duration: const Duration(milliseconds: 900),
          ));
    }
  }

  void _clearDestination() {
    _stopSimulation();
    _routeRequestId++; // cancel any in-flight route request
    setState(() {
      _selectedBuilding = null;
      _walkResult = null;
      _routeLotId = null;
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
    if (_devMode) _devTap.value = latLng;

    FauBuilding? nearest;
    var nearestDist = 45.0; // meters
    for (final b in _campusBuildings) {
      final d = Geo.meters(latLng, b.position);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = b;
      }
    }
    if (nearest != null) {
      _onBuildingSelected(nearest);
      return;
    }

    for (final lot in _liveLots.values) {
      if (Geo.meters(latLng, lot['position'] as LatLng) < 40) {
        final free = (lot['capacity'] as int) - (lot['occupied'] as int);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${lot['name']}: $free free of ${lot['capacity']}'),
            duration: const Duration(seconds: 2),
          ),
        );
        return;
      }
    }
  }

  // ==========================================
  // DEVELOPER TOOLS
  // ==========================================

  void _teleportToCampus() {
    _stopSimulation();
    var target = _campusEntrance;
    for (final p in _fullRoute) {
      if (_inCampus(p)) {
        target = p;
        break;
      }
    }
    setState(() {
      _devLocationOverride = true;
      _userPos = target;
      _gpsStatus = 'Teleported to campus (dev)';
    });
    _pushPuck();
    final m = _map;
    if (m != null) {
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

    _camBearing = _heading;
    _simTickCount = 0;
    setState(() {
      _isSimulating = true;
      _devLocationOverride = true;
      _userPos = onRoute ? proj.point : _fullRoute.first;
      _routeSeg = onRoute ? proj.seg : 0;
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
      setState(() {
        _userPos = route.last;
        _arrived = true;
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

    // Per-tick state is updated WITHOUT setState: the puck moves on the GPU
    // via its GeoJSON source; Flutter widgets only refresh a few times a second.
    _userPos = cur;
    _routeSeg = seg;
    _heading = bearing;
    _distToRoute = 0;
    _displayRoute = [cur, ...route.sublist(seg + 1)];
    _routeRemaining = Geo.meters(cur, route[seg + 1]) + _routeSuffix[seg + 1];
    _pushPuck();

    if (_simTickCount % 5 == 0) {
      _pushRoute(); // 4 Hz is plenty for the trimmed line
      setState(() => _gpsStatus = 'Simulating 20 mph (${bearing.round()}°)');
    }

    if (_navTracking && _simTickCount % 4 == 0) {
      _camBearing =
          (_camBearing + Geo.shortestAngle(_camBearing, bearing) * 0.35) % 360;
      _follow(cur, _camBearing, const Duration(milliseconds: 220), force: true);
    }
  }

  void _stopSimulation() {
    _simTimer?.cancel();
    _simTimer = null;
    if (mounted && _isSimulating) {
      setState(() => _isSimulating = false);
      _pushRoute();
    }
  }

  void _toggleDevMode() {
    final turningOff = _devMode;
    setState(() => _devMode = !_devMode);
    if (turningOff) {
      _stopSimulation();
      _devTap.value = null;
      if (_devLocationOverride) {
        _devLocationOverride = false;
        _resyncRealGps();
      }
    }
  }

  // ==========================================
  // UI
  // ==========================================

  double _puckBearing() {
    if (_displayRoute.length >= 2 &&
        _distToRoute < 15 &&
        _routeSeg < _fullRoute.length - 1) {
      return Geo.bearing(_fullRoute[_routeSeg], _fullRoute[_routeSeg + 1]);
    }
    return _heading;
  }

  void _showBuildingSelector() {
    showModalBottomSheet(
      context: context,
      backgroundColor: kCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Select Building',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: kText,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, color: kTextMuted),
                      onPressed: () => Navigator.pop(ctx),
                    ),
                  ],
                ),
                const Divider(color: kDivider),
                Expanded(
                  child: ListView.separated(
                    itemCount: _campusBuildings.length,
                    separatorBuilder: (_, __) =>
                        const Divider(color: kDivider, height: 1),
                    itemBuilder: (context, index) {
                      final bldg = _campusBuildings[index];
                      final best = CampusPathfinder.findBestAvailableRoute(
                        buildingPos: bldg.position,
                        lots: _liveLots,
                      );
                      final lot = best != null ? _liveLots[best.lotId] : null;
                      final free = lot == null
                          ? 0
                          : (lot['capacity'] as int) - (lot['occupied'] as int);

                      return Padding(
                        padding: const EdgeInsets.symmetric(
                            vertical: 8, horizontal: 4),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.white10,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                bldg.code,
                                style: const TextStyle(
                                  color: kAccent,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12,
                                ),
                              ),
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
                                        ? 'Best lot: ${lot['name']} ($free free, ${formatDistance(best!.totalDistanceMeters)} walk)'
                                        : (_liveLots.isEmpty
                                            ? 'Loading parking data...'
                                            : 'All nearby lots full'),
                                    style: const TextStyle(
                                      color: kTextMuted,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            ElevatedButton.icon(
                              onPressed: () {
                                Navigator.pop(ctx);
                                _onBuildingSelected(bldg);
                              },
                              icon: const Icon(Icons.navigation,
                                  size: 14, color: Colors.black),
                              label: const Text(
                                'Go to',
                                style: TextStyle(
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12,
                                ),
                              ),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: kAccent,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 6,
                                ),
                                minimumSize: Size.zero,
                                tapTargetSize:
                                    MaterialTapTargetSize.shrinkWrap,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final onCampus = _isOnCampus;
    final navActive = _navTracking && onCampus;
    final bottomInset = MediaQuery.of(context).padding.bottom;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'FAU Campus Map',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            Text(
              navActive
                  ? 'Navigation Mode Active (${_heading.round()}°)'
                  : (_devMode ? 'Dev Mode Active' : 'Boca Raton Main Campus'),
              style: TextStyle(
                fontSize: 12,
                color: navActive ? kAccent : (_devMode ? kDev : kTextMuted),
                fontWeight: (navActive || _devMode)
                    ? FontWeight.bold
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
          if (onCampus)
            IconButton(
              icon: _isLocating
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Icon(
                      _navTracking ? Icons.navigation : Icons.my_location,
                      color: _navTracking ? kAccent : Colors.white,
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
            tooltip: 'Reset Campus View',
            onPressed: _resetView,
          ),
        ],
      ),
      body: Stack(
        children: [
          Positioned.fill(child: _buildMap()),
          _buildSearchHeader(),
          if (_devMode) _buildDevTapBadge(),
          if (_devMode && _selectedBuilding != null)
            _buildDevControls(onCampus, bottomInset),
          _buildAttribution(bottomInset),
          _buildGuidanceCard(onCampus, bottomInset),
        ],
      ),
    );
  }

  Widget _buildMap() {
    // Listener sees raw touches before the native map does, so a drag
    // cancels follow-mode just like Google Maps.
    return Listener(
      onPointerDown: (e) => _pointerDownAt = e.position,
      onPointerMove: (e) {
        final start = _pointerDownAt;
        if (_navTracking &&
            start != null &&
            (e.position - start).distance > 12) {
          _pointerDownAt = null;
          _setNavTracking(false, recenter: false);
        }
      },
      onPointerUp: (_) => _pointerDownAt = null,
      onPointerCancel: (_) => _pointerDownAt = null,
      child: MapLibreMap(
        styleString: _styleUrl,
        initialCameraPosition: const CameraPosition(
          target: _fauCenter,
          zoom: 15.0,
        ),
        onMapCreated: (controller) => _map = controller,
        onStyleLoadedCallback: _onStyleLoaded,
        onMapClick: _onMapClick,
        cameraTargetBounds: _cameraBounds,
        minMaxZoomPreference: const MinMaxZoomPreference(14.5, 20.0),
        compassEnabled: false,
        rotateGesturesEnabled: true,
        tiltGesturesEnabled: true,
        myLocationEnabled: false,
        trackCameraPosition: false,
      ),
    );
  }

  Widget _buildSearchHeader() {
    final selected = _selectedBuilding;
    return Positioned(
      top: 16,
      left: 16,
      right: 16,
      child: GestureDetector(
        onTap: _showBuildingSelector,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: kCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected != null ? kAccent : Colors.white24,
              width: 1.5,
            ),
            boxShadow: const [
              BoxShadow(
                color: Colors.black54,
                blurRadius: 8,
                offset: Offset(0, 3),
              ),
            ],
          ),
          child: Row(
            children: [
              Icon(
                Icons.search,
                color: selected != null ? kAccent : Colors.white70,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  selected != null
                      ? 'Destination: ${selected.name}'
                      : 'Search for destination...',
                  style: TextStyle(
                    color: selected != null ? Colors.white : Colors.white60,
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (selected != null)
                GestureDetector(
                  onTap: _clearDestination,
                  child:
                      const Icon(Icons.cancel, color: Colors.white54, size: 20),
                ),
            ],
          ),
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
            return GestureDetector(
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
            );
          },
        ),
      ),
    );
  }

  Widget _buildDevControls(bool onCampus, double bottomInset) {
    final canSimulate = onCampus && _fullRoute.length >= 2 && !_arrived;
    return Positioned(
      right: 20,
      bottom: 105 + bottomInset,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!onCampus)
            ElevatedButton.icon(
              onPressed: _teleportToCampus,
              icon: const Icon(Icons.flight_takeoff, size: 18),
              label: const Text('Travel to FAU'),
              style: ElevatedButton.styleFrom(
                backgroundColor: kDev,
                foregroundColor: Colors.black,
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
            ),
          if (canSimulate || _isSimulating)
            ElevatedButton.icon(
              onPressed: _toggleSimulation,
              icon: Icon(_isSimulating ? Icons.pause : Icons.play_arrow,
                  size: 20),
              label: Text(_isSimulating ? 'Stop (20 mph)' : 'Simulate Run'),
              style: ElevatedButton.styleFrom(
                backgroundColor: _isSimulating ? Colors.redAccent : kAccent,
                foregroundColor: Colors.black,
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                elevation: 6,
              ),
            ),
        ],
      ),
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

    if (building == null) {
      title = 'FAU Boca Raton Main Campus';
      subtitle = _userPos == null
          ? _gpsStatus
          : (onCampus
              ? 'On Campus • Heading: ${_heading.round()}°'
              : 'Outside Campus Area');
    } else if (walk == null) {
      title =
          _liveLots.isEmpty ? 'Loading live parking data...' : 'No open lot';
      subtitle = _liveLots.isEmpty
          ? 'Waiting for sensor data'
          : 'All nearby lots are currently full';
    } else {
      final lot = _liveLots[walk.lotId];
      final free = lot == null
          ? 0
          : (lot['capacity'] as int) - (lot['occupied'] as int);
      title = 'Best Lot: ${lot?['name'] ?? walk.lotId} ($free free)';
      final walkText = formatDistance(walk.totalDistanceMeters);
      if (_arrived) {
        subtitle = 'Arrived • $walkText walk to ${building.code}';
      } else if (_fullRoute.isEmpty) {
        subtitle = 'Calculating driving route...';
      } else {
        subtitle =
            'Drive ${formatDistance(_routeRemaining)} • then walk $walkText';
      }
    }

    return Positioned(
      bottom: 24 + bottomInset,
      left: 20,
      right: 20,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: kCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: building != null ? kAccent : kDivider,
            width: 1.5,
          ),
          boxShadow: const [
            BoxShadow(
              color: Colors.black54,
              blurRadius: 10,
              offset: Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            Icon(
              building != null ? Icons.assistant_direction : Icons.my_location,
              color: kAccent,
              size: 24,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: kText,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: const TextStyle(fontSize: 12, color: kTextMuted),
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ==========================================
// TAB 2: VEHICLES
// ==========================================

class _VehicleTab extends StatefulWidget {
  const _VehicleTab();

  @override
  State<_VehicleTab> createState() => _VehicleTabState();
}

class _VehicleTabState extends State<_VehicleTab> {
  late final String? _uid = FirebaseAuth.instance.currentUser?.uid;
  late final Stream<DatabaseEvent>? _stream = _uid == null
      ? null
      : FirebaseDatabase.instance.ref('drivers/$_uid/vehicles').onValue;

  void _openAddVehicleDialog() {
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (_) => const _VehicleFormDialog(),
    );
  }

  void _showVehicleDetails(Map<String, dynamic> data, String key) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: kCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            const Icon(Icons.directions_car, color: kAccent),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                '${data['model'] ?? 'Vehicle'}',
                style: const TextStyle(color: kText),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DetailInfoRow(
                label: 'Plate Number', value: data['plate']?.toString() ?? 'N/A'),
            DetailInfoRow(
                label: 'Manufacturer',
                value: data['manufacturer']?.toString() ?? 'N/A'),
            DetailInfoRow(label: 'Year', value: data['year']?.toString() ?? 'N/A'),
            DetailInfoRow(
                label: 'Color', value: data['color']?.toString() ?? 'N/A'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              final uid = _uid;
              if (uid != null) {
                FirebaseDatabase.instance
                    .ref('drivers/$uid/vehicles/$key')
                    .remove();
              }
            },
            child: const Text(
              'Delete Vehicle',
              style: TextStyle(color: Colors.redAccent),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(),
            style: ElevatedButton.styleFrom(
              backgroundColor: kAccent,
              foregroundColor: Colors.black,
            ),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_uid == null) return const Center(child: Text('User not signed in.'));

    return StreamBuilder<DatabaseEvent>(
      stream: _stream,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(
            child: Text(
              'Error: ${snapshot.error}',
              style: const TextStyle(color: Colors.redAccent),
            ),
          );
        }
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final rawData = snapshot.data?.snapshot.value;
        if (rawData is! Map) {
          return AnimatedAddCard(
            title: 'No Vehicle Found',
            subtitle: 'Tap to add a new vehicle to your account',
            onTap: _openAddVehicleDialog,
          );
        }

        return ListView(
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 16.0),
          children: [
            for (final entry in rawData.entries)
              if (entry.value is Map)
                _buildVehicleCard(
                  entry.key.toString(),
                  Map<String, dynamic>.from(entry.value as Map),
                ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: _openAddVehicleDialog,
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                side: const BorderSide(color: kAccent, width: 1.5),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text(
                'Add more vehicle',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: kAccent,
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildVehicleCard(String key, Map<String, dynamic> data) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showVehicleDetails(data, key),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          decoration: BoxDecoration(
            color: kCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: kDivider, width: 2),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Text(
                  data['model']?.toString() ?? 'Unknown Model',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: kText,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Text(
                data['plate']?.toString() ?? 'No Plate',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: kAccent,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _VehicleFormDialog extends StatefulWidget {
  const _VehicleFormDialog();

  @override
  State<_VehicleFormDialog> createState() => _VehicleFormDialogState();
}

class _VehicleFormDialogState extends State<_VehicleFormDialog> {
  final _manufacturerCtrl = TextEditingController();
  final _modelCtrl = TextEditingController();
  final _plateCtrl = TextEditingController();
  final _yearCtrl = TextEditingController();
  final _colorCtrl = TextEditingController();

  @override
  void dispose() {
    _manufacturerCtrl.dispose();
    _modelCtrl.dispose();
    _plateCtrl.dispose();
    _yearCtrl.dispose();
    _colorCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    final model = _modelCtrl.text.trim();
    final plate = _plateCtrl.text.trim();
    if (model.isEmpty || plate.isEmpty) {
      showErrorSnackBar(
          context, 'Please fill out at least Model and License Plate.');
      return;
    }

    Navigator.of(context).pop();

    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid != null) {
      FirebaseDatabase.instance.ref('drivers/$uid/vehicles').push().set({
        'manufacturer': _manufacturerCtrl.text.trim(),
        'model': model,
        'plate': plate,
        'year': _yearCtrl.text.trim(),
        'color': _colorCtrl.text.trim(),
        'createdAt': ServerValue.timestamp,
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: kCard,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Add New Vehicle',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: kText,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: 16),
            AppTextField(
              controller: _manufacturerCtrl,
              hintText: 'Manufacturer (e.g. Toyota)',
              icon: Icons.business,
            ),
            const SizedBox(height: 12),
            AppTextField(
              controller: _modelCtrl,
              hintText: 'Model (e.g. RAV 4)',
              icon: Icons.directions_car,
            ),
            const SizedBox(height: 12),
            AppTextField(
              controller: _plateCtrl,
              hintText: 'License Plate (e.g. S108123)',
              icon: Icons.pin,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: AppTextField(
                    controller: _yearCtrl,
                    hintText: 'Year (e.g. 2024)',
                    icon: Icons.calendar_today,
                    keyboardType: TextInputType.number,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: AppTextField(
                    controller: _colorCtrl,
                    hintText: 'Color (e.g. Silver)',
                    icon: Icons.color_lens,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            _DialogButtons(onConfirm: _submit),
          ],
        ),
      ),
    );
  }
}

class _DialogButtons extends StatelessWidget {
  final VoidCallback onConfirm;
  const _DialogButtons({required this.onConfirm});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton(
            onPressed: () => Navigator.of(context).pop(),
            style: OutlinedButton.styleFrom(
              foregroundColor: kText,
              padding: const EdgeInsets.symmetric(vertical: 14),
              side: const BorderSide(color: kDivider),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: const Text('Cancel'),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: ElevatedButton(
            onPressed: onConfirm,
            style: ElevatedButton.styleFrom(
              backgroundColor: kAccent,
              foregroundColor: Colors.black,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: const Text(
              'Confirm',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
        ),
      ],
    );
  }
}

// ==========================================
// TAB 3: PROFILE
// ==========================================

class _ProfileTab extends StatefulWidget {
  const _ProfileTab();

  @override
  State<_ProfileTab> createState() => _ProfileTabState();
}

class _ProfileTabState extends State<_ProfileTab> {
  late final User? _user = FirebaseAuth.instance.currentUser;
  late final Stream<DatabaseEvent>? _stream = _user == null
      ? null
      : FirebaseDatabase.instance.ref('drivers/${_user!.uid}/profile').onValue;

  void _openContactDialog({Map<String, dynamic>? data}) {
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (_) => _ContactInfoDialog(existingData: data),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = _user;
    if (user == null) return const Center(child: Text('User not signed in.'));

    return StreamBuilder<DatabaseEvent>(
      stream: _stream,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final rawData = snapshot.data?.snapshot.value;
        if (rawData is! Map || rawData['firstName'] == null) {
          return AnimatedAddCard(
            title: 'Profile Incomplete',
            subtitle: 'Tap to add your contact information',
            onTap: _openContactDialog,
          );
        }

        final data = Map<String, dynamic>.from(rawData);
        final middle = (data['middleName'] ?? '').toString().trim();
        final fullName = middle.isEmpty
            ? '${data['firstName']} ${data['lastName']}'
            : '${data['firstName']} $middle ${data['lastName']}';

        final addr2 = (data['address2'] ?? '').toString().trim();
        final zip = data['zipCode'] ?? '';
        final line1 =
            addr2.isEmpty ? '${data['address1']}' : '${data['address1']}, $addr2';
        final fullAddress =
            '$line1\n${data['city']}, ${data['state']} $zip\n${data['country']}';

        return SafeArea(
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(20.0),
                  children: [
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: kCard,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: kDivider),
                      ),
                      child: Row(
                        children: [
                          const CircleAvatar(
                            radius: 34,
                            backgroundColor: kBg,
                            child: Icon(Icons.person, size: 38, color: kAccent),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  fullName,
                                  style: const TextStyle(
                                    fontSize: 20,
                                    fontWeight: FontWeight.bold,
                                    color: kText,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  user.email ?? '',
                                  style: const TextStyle(
                                    fontSize: 14,
                                    color: kTextMuted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: kCard,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: kDivider),
                      ),
                      child: Column(
                        children: [
                          DetailInfoRow(
                            label: 'Phone Number',
                            value: data['phone']?.toString() ?? 'N/A',
                          ),
                          const Divider(height: 20),
                          DetailInfoRow(
                            label: 'Gender',
                            value: data['gender']?.toString() ?? 'N/A',
                          ),
                          const Divider(height: 20),
                          DetailInfoRow(label: 'Address', value: fullAddress),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
                child: PrimaryButton(
                  title: 'Edit Information',
                  icon: Icons.edit_outlined,
                  onPressed: () => _openContactDialog(data: data),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _ContactInfoDialog extends StatefulWidget {
  final Map<String, dynamic>? existingData;
  const _ContactInfoDialog({this.existingData});

  @override
  State<_ContactInfoDialog> createState() => _ContactInfoDialogState();
}

class _ContactInfoDialogState extends State<_ContactInfoDialog> {
  static const List<String> _genders = ['Male', 'Female', 'Other'];

  late final TextEditingController _phoneCtrl;
  late final TextEditingController _firstCtrl;
  late final TextEditingController _lastCtrl;
  late final TextEditingController _middleCtrl;
  late final TextEditingController _addr1Ctrl;
  late final TextEditingController _addr2Ctrl;
  late final TextEditingController _cityCtrl;
  late final TextEditingController _stateCtrl;
  late final TextEditingController _zipCtrl;
  late final TextEditingController _countryCtrl;
  String? _gender;

  @override
  void initState() {
    super.initState();
    final d = widget.existingData;
    String v(String k) => d?[k]?.toString() ?? '';
    _phoneCtrl = TextEditingController(text: v('phone'));
    _firstCtrl = TextEditingController(text: v('firstName'));
    _lastCtrl = TextEditingController(text: v('lastName'));
    _middleCtrl = TextEditingController(text: v('middleName'));
    _addr1Ctrl = TextEditingController(text: v('address1'));
    _addr2Ctrl = TextEditingController(text: v('address2'));
    _cityCtrl = TextEditingController(text: v('city'));
    _stateCtrl = TextEditingController(text: v('state'));
    _zipCtrl = TextEditingController(text: v('zipCode'));
    _countryCtrl = TextEditingController(text: v('country'));
    // Guard: an unexpected stored value would crash the dropdown.
    final g = d?['gender']?.toString();
    _gender = _genders.contains(g) ? g : null;
  }

  @override
  void dispose() {
    for (final c in [
      _phoneCtrl,
      _firstCtrl,
      _lastCtrl,
      _middleCtrl,
      _addr1Ctrl,
      _addr2Ctrl,
      _cityCtrl,
      _stateCtrl,
      _zipCtrl,
      _countryCtrl,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  void _submit() {
    final required = [
      _phoneCtrl,
      _firstCtrl,
      _lastCtrl,
      _addr1Ctrl,
      _cityCtrl,
      _stateCtrl,
      _zipCtrl,
      _countryCtrl,
    ];
    if (_gender == null || required.any((c) => c.text.trim().isEmpty)) {
      showErrorSnackBar(context, 'Please fill in all required fields.');
      return;
    }

    Navigator.of(context).pop();

    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid != null) {
      FirebaseDatabase.instance.ref('drivers/$uid/profile').update({
        'firstName': _firstCtrl.text.trim(),
        'lastName': _lastCtrl.text.trim(),
        'middleName': _middleCtrl.text.trim(),
        'phone': _phoneCtrl.text.trim(),
        'gender': _gender,
        'address1': _addr1Ctrl.text.trim(),
        'address2': _addr2Ctrl.text.trim(),
        'city': _cityCtrl.text.trim(),
        'state': _stateCtrl.text.trim(),
        'zipCode': _zipCtrl.text.trim(),
        'country': _countryCtrl.text.trim(),
        'updatedAt': ServerValue.timestamp,
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: kCard,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 500),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    widget.existingData == null
                        ? 'Add Contact Info'
                        : 'Edit Contact Info',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: kText,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: AppTextField(
                      controller: _firstCtrl,
                      hintText: 'First Name *',
                      icon: Icons.person_outline,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: AppTextField(
                      controller: _lastCtrl,
                      hintText: 'Last Name *',
                      icon: Icons.person_outline,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              AppTextField(
                controller: _middleCtrl,
                hintText: 'Middle Name (Optional)',
                icon: Icons.badge_outlined,
              ),
              const SizedBox(height: 12),
              AppTextField(
                controller: _phoneCtrl,
                hintText: 'Phone Number *',
                icon: Icons.phone_outlined,
                keyboardType: TextInputType.phone,
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                decoration: BoxDecoration(
                  color: kCard,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: kDivider),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _gender,
                    isExpanded: true,
                    hint: const Row(
                      children: [
                        Icon(Icons.transgender, color: kAccent),
                        SizedBox(width: 12),
                        Text('Gender *', style: TextStyle(color: kTextMuted)),
                      ],
                    ),
                    dropdownColor: kCard,
                    icon: const Icon(Icons.arrow_drop_down, color: kAccent),
                    items: [
                      for (final g in _genders)
                        DropdownMenuItem(value: g, child: Text(g)),
                    ],
                    onChanged: (val) => setState(() => _gender = val),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              AppTextField(
                controller: _addr1Ctrl,
                hintText: 'Address Line 1 *',
                icon: Icons.home_outlined,
              ),
              const SizedBox(height: 12),
              AppTextField(
                controller: _addr2Ctrl,
                hintText: 'Address Line 2 (Optional)',
                icon: Icons.location_city_outlined,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: AppTextField(
                      controller: _cityCtrl,
                      hintText: 'City *',
                      icon: Icons.location_on_outlined,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: AppTextField(
                      controller: _stateCtrl,
                      hintText: 'State *',
                      icon: Icons.map_outlined,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: AppTextField(
                      controller: _zipCtrl,
                      hintText: 'Zip Code *',
                      icon: Icons.markunread_mailbox_outlined,
                      keyboardType: TextInputType.number,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: AppTextField(
                      controller: _countryCtrl,
                      hintText: 'Country *',
                      icon: Icons.public_outlined,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              _DialogButtons(onConfirm: _submit),
            ],
          ),
        ),
      ),
    );
  }
}

// ==========================================
// REUSABLE PRESENTATIONAL WIDGETS
// ==========================================

class AppTextField extends StatelessWidget {
  final TextEditingController controller;
  final String hintText;
  final IconData icon;
  final bool obscureText;
  final TextInputType keyboardType;

  const AppTextField({
    super.key,
    required this.controller,
    required this.hintText,
    required this.icon,
    this.obscureText = false,
    this.keyboardType = TextInputType.text,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: kCard,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: kDivider),
      ),
      child: TextField(
        controller: controller,
        obscureText: obscureText,
        keyboardType: keyboardType,
        style: const TextStyle(color: kText),
        decoration: InputDecoration(
          border: InputBorder.none,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          hintText: hintText,
          hintStyle: const TextStyle(color: kTextMuted, fontSize: 14),
          prefixIcon: Icon(icon, color: kAccent, size: 20),
        ),
      ),
    );
  }
}

class PrimaryButton extends StatelessWidget {
  final String title;
  final VoidCallback onPressed;
  final bool isLoading;
  final IconData? icon;

  const PrimaryButton({
    super.key,
    required this.title,
    required this.onPressed,
    this.isLoading = false,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: kAccent,
          foregroundColor: kOnAccent,
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          elevation: 0,
        ),
        child: isLoading
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: kOnAccent,
                ),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 20),
                    const SizedBox(width: 8),
                  ],
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class DetailInfoRow extends StatelessWidget {
  final String label;
  final String value;

  const DetailInfoRow({super.key, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: kTextMuted, fontSize: 14)),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: kText,
                fontWeight: FontWeight.bold,
                fontSize: 14,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class AnimatedAddCard extends StatefulWidget {
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const AnimatedAddCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  State<AnimatedAddCard> createState() => _AnimatedAddCardState();
}

class _AnimatedAddCardState extends State<AnimatedAddCard> {
  bool _isPressed = false;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: GestureDetector(
          onTapDown: (_) => setState(() => _isPressed = true),
          onTapUp: (_) {
            setState(() => _isPressed = false);
            widget.onTap();
          },
          onTapCancel: () => setState(() => _isPressed = false),
          child: AnimatedScale(
            scale: _isPressed ? 0.95 : 1.0,
            duration: const Duration(milliseconds: 150),
            curve: Curves.easeInOut,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              curve: Curves.easeInOut,
              width: double.infinity,
              height: 220,
              decoration: BoxDecoration(
                color: kCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: _isPressed ? kAccent.withValues(alpha: 0.6) : kDivider,
                  width: 2,
                ),
                boxShadow: _isPressed
                    ? [
                        BoxShadow(
                          color: kAccent.withValues(alpha: 0.15),
                          blurRadius: 20,
                          spreadRadius: 2,
                        ),
                      ]
                    : null,
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: kBg,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: kAccent.withValues(alpha: _isPressed ? 0.4 : 0.1),
                          blurRadius: _isPressed ? 25 : 15,
                          spreadRadius: _isPressed ? 8 : 5,
                        ),
                      ],
                    ),
                    child: const Icon(Icons.add, size: 40, color: kAccent),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    widget.title,
                    style: const TextStyle(
                      color: kText,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.subtitle,
                    style: const TextStyle(color: kTextMuted, fontSize: 14),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ==========================================
// STATIC USER PAGES
// ==========================================

class UserSettingsPage extends StatefulWidget {
  const UserSettingsPage({super.key});

  @override
  State<UserSettingsPage> createState() => _UserSettingsPageState();
}

class _UserSettingsPageState extends State<UserSettingsPage> {
  late final String? _uid = FirebaseAuth.instance.currentUser?.uid;
  late final DatabaseReference? _notifRef = _uid == null
      ? null
      : FirebaseDatabase.instance.ref('drivers/$_uid/settings/notifications');
  late final Stream<DatabaseEvent>? _notifStream = _notifRef?.onValue;

  void _showContactDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: kCard,
        title: const Text('Contact Us', style: TextStyle(color: kText)),
        content: const SelectableText(
          kSupportEmail,
          style: TextStyle(color: kAccent, fontWeight: FontWeight.bold),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Clipboard.setData(const ClipboardData(text: kSupportEmail));
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Email copied to clipboard')),
              );
            },
            child: const Text('Copy email', style: TextStyle(color: kAccent)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close', style: TextStyle(color: kTextMuted)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16.0),
        children: [
          StreamBuilder<DatabaseEvent>(
            stream: _notifStream,
            builder: (context, snapshot) {
              // Default ON until the user turns it off.
              final enabled = snapshot.data?.snapshot.value != false;
              return ListTile(
                leading: const Icon(Icons.notifications_active, color: kAccent),
                title:
                    const Text('Notifications', style: TextStyle(color: kText)),
                trailing: Switch(
                  value: enabled,
                  onChanged:
                      _notifRef == null ? null : (val) => _notifRef!.set(val),
                  activeColor: kBg,
                  activeTrackColor: kAccent,
                ),
              );
            },
          ),
          ListTile(
            leading: const Icon(Icons.mail_outline, color: kAccent),
            title: const Text('Contact Us', style: TextStyle(color: kText)),
            trailing: const Icon(
              Icons.arrow_forward_ios,
              color: kTextMuted,
              size: 16,
            ),
            onTap: _showContactDialog,
          ),
        ],
      ),
    );
  }
}

class UserAboutPage extends StatelessWidget {
  const UserAboutPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('About App')),
      body: const Padding(
        padding: EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.radar, color: kAccent, size: 60),
            SizedBox(height: 20),
            Text(
              'Smart Curb is an intelligent IoT parking sensing application designed to monitor space availability and manage vehicles for individual users.',
              style: TextStyle(color: kTextMuted, height: 1.5, fontSize: 16),
            ),
            SizedBox(height: 30),
            Divider(color: kDivider),
            SizedBox(height: 10),
            Text(
              'Version: 1.0.0 (Beta)',
              style: TextStyle(
                color: kAccent,
                fontWeight: FontWeight.bold,
                fontSize: 14,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// Global Alert Helper
void showErrorSnackBar(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(
        message,
        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
      ),
      backgroundColor: Colors.redAccent,
    ),
  );
}