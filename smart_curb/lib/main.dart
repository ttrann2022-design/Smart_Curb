import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';
import 'firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const MyApp());
}

// ==========================================
// THEME CONFIGURATION
// ==========================================

final ValueNotifier<ThemeMode> themeNotifier = ValueNotifier(ThemeMode.dark);

const Color accentVoltGreenDark = Color(0xFFC6F24A);
const Color accentVoltGreenLight = Color(0xFF6B8A08);

final ThemeData darkTheme = ThemeData(
  brightness: Brightness.dark,
  primaryColor: accentVoltGreenDark,
  scaffoldBackgroundColor: const Color(0xFF0F0F0D),
  cardColor: const Color(0xFF171714),
  dividerColor: const Color(0xFF2B2B25),
  dialogBackgroundColor: const Color(0xFF171714),
  appBarTheme: const AppBarTheme(
    backgroundColor: Color(0xFF090908),
    elevation: 0,
    iconTheme: IconThemeData(color: Color(0xFFF2F1EA)),
    titleTextStyle: TextStyle(
      color: Color(0xFFF2F1EA),
      fontSize: 18,
      fontWeight: FontWeight.w700,
      letterSpacing: 0.5,
    ),
  ),
  colorScheme: const ColorScheme.dark(
    primary: accentVoltGreenDark,
    surface: Color(0xFF171714),
    onSurface: Color(0xFFF2F1EA),
    onSurfaceVariant: Color(0xFF8E8C82),
    outline: Color(0xFF2B2B25),
  ),
  bottomNavigationBarTheme: const BottomNavigationBarThemeData(
    backgroundColor: Color(0xFF090908),
    selectedItemColor: accentVoltGreenDark,
    unselectedItemColor: Color(0xFF6E7C8F),
    type: BottomNavigationBarType.fixed,
  ),
  useMaterial3: true,
);

final ThemeData lightTheme = ThemeData(
  brightness: Brightness.light,
  primaryColor: accentVoltGreenLight,
  scaffoldBackgroundColor: const Color(0xFFF7F6F2),
  cardColor: const Color(0xFFFFFFFF),
  dividerColor: const Color(0xFFE5E3DC),
  dialogBackgroundColor: const Color(0xFFFFFFFF),
  appBarTheme: const AppBarTheme(
    backgroundColor: Color(0xFFFFFFFF),
    elevation: 0,
    iconTheme: IconThemeData(color: Color(0xFF171714)),
    titleTextStyle: TextStyle(
      color: Color(0xFF171714),
      fontSize: 18,
      fontWeight: FontWeight.w700,
      letterSpacing: 0.5,
    ),
  ),
  colorScheme: const ColorScheme.light(
    primary: accentVoltGreenLight,
    surface: Color(0xFFFFFFFF),
    onSurface: Color(0xFF171714),
    onSurfaceVariant: Color(0xFF706E66),
    outline: Color(0xFFE5E3DC),
  ),
  bottomNavigationBarTheme: const BottomNavigationBarThemeData(
    backgroundColor: Color(0xFFFFFFFF),
    selectedItemColor: accentVoltGreenLight,
    unselectedItemColor: Color(0xFF9E9C94),
    type: BottomNavigationBarType.fixed,
  ),
  useMaterial3: true,
);

// ==========================================
// ROOT APP & AUTH LISTENER
// ==========================================

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: themeNotifier,
      builder: (context, currentMode, _) {
        return MaterialApp(
          title: 'Smart Curb App',
          debugShowCheckedModeBanner: false,
          theme: lightTheme,
          darkTheme: darkTheme,
          themeMode: currentMode,
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
      },
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
    final theme = Theme.of(context);
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
                      Icon(Icons.radar, size: 100, color: theme.primaryColor),
                ),
                const SizedBox(height: 20),
                RichText(
                  text: TextSpan(
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1.5,
                    ),
                    children: [
                      TextSpan(
                        text: 'SMART ',
                        style: TextStyle(color: theme.colorScheme.onSurface),
                      ),
                      TextSpan(
                        text: 'CURB',
                        style: TextStyle(color: theme.primaryColor),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'SMART PARKING',
                  style: TextStyle(
                    color: theme.colorScheme.onSurfaceVariant,
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
                  child: Text(
                    "Don't have an account? Register",
                    style: TextStyle(
                      color: theme.primaryColor,
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
      if (mounted) showErrorSnackBar(context, e.message ?? 'Registration failed.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Create Account')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32.0),
            child: Column(
              children: [
                Icon(Icons.person_add_alt_1, size: 70, color: theme.primaryColor),
                const SizedBox(height: 16),
                Text(
                  'Join Smart Curb',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.onSurface,
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
                  child: Text(
                    'Already have an account? Back to Login',
                    style: TextStyle(
                      color: theme.primaryColor,
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
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.logout),
          tooltip: 'Logout',
          onPressed: () => FirebaseAuth.instance.signOut(),
        ),
        title: Container(
          height: 40,
          decoration: BoxDecoration(
            color: theme.brightness == Brightness.dark
                ? Colors.white10
                : Colors.grey[200],
            borderRadius: BorderRadius.circular(20),
          ),
          child: TextField(
            style: TextStyle(color: theme.colorScheme.onSurface),
            decoration: InputDecoration(
              hintText: 'Search...',
              hintStyle: TextStyle(color: theme.colorScheme.onSurfaceVariant),
              prefixIcon: Icon(
                Icons.search,
                color: theme.colorScheme.onSurfaceVariant,
              ),
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(vertical: 10),
            ),
          ),
        ),
        centerTitle: true,
        actions: [
          PopupMenuButton<String>(
            icon: Icon(Icons.more_vert, color: theme.primaryColor),
            color: theme.cardColor,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            offset: const Offset(0, 50),
            onSelected: (val) {
              final page = (val == 'settings')
                  ? const UserSettingsPage()
                  : const UserAboutPage();
              Navigator.push(context, MaterialPageRoute(builder: (_) => page));
            },
            itemBuilder: (_) => [
              _buildMenuItem('settings', Icons.settings, 'Settings', theme),
              _buildMenuItem('about', Icons.info_outline, 'About App', theme),
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
        type: BottomNavigationBarType.fixed,
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

  PopupMenuItem<String> _buildMenuItem(
    String val,
    IconData icon,
    String label,
    ThemeData theme,
  ) {
    return PopupMenuItem(
      value: val,
      child: Row(
        children: [
          Icon(icon, color: theme.colorScheme.onSurfaceVariant, size: 20),
          const SizedBox(width: 12),
          Text(label, style: TextStyle(color: theme.colorScheme.onSurface)),
        ],
      ),
    );
  }
}

// ==========================================
// TAB 1: HOME (Places & Campus Management)
// ==========================================

class _HomeTab extends StatelessWidget {
  const _HomeTab();

  static const List<Map<String, String>> _availableCampuses = [
    {
      'id': 'fau_boca',
      'shortName': 'FAU',
      'fullName': 'Florida Atlantic University',
      'address': '777 Glades Rd, Boca Raton, FL 33431',
    },
  ];

  void _showAddSpaceDialog(BuildContext context) {
    final theme = Theme.of(context);
    final uid = FirebaseAuth.instance.currentUser?.uid;

    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (dialogCtx) => Dialog(
        backgroundColor: theme.cardColor,
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
                    color: theme.colorScheme.onSurface,
                    tooltip: 'Close',
                    onPressed: () => Navigator.of(dialogCtx).pop(),
                  ),
                  Text(
                    'Select Location',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.onSurface,
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
                        color: theme.scaffoldBackgroundColor,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: theme.dividerColor),
                      ),
                      child: Row(
                        children: [
                          _buildCampusLogo(campus['shortName']!, theme),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  campus['fullName']!,
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.bold,
                                    color: theme.colorScheme.onSurface,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  campus['address']!,
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 10),
                          ElevatedButton(
                            onPressed: () {
                              Navigator.of(dialogCtx).pop();
                              if (uid != null) {
                                FirebaseDatabase.instance
                                    .ref('drivers/$uid/locations/${campus['id']}')
                                    .set({
                                  'shortName': campus['shortName'],
                                  'fullName': campus['fullName'],
                                  'address': campus['address'],
                                  'addedAt': ServerValue.timestamp,
                                });
                              }
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: theme.primaryColor,
                              foregroundColor: const Color(0xFF12110F),
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

  static Widget _buildCampusLogo(String shortName, ThemeData theme) {
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final uid = FirebaseAuth.instance.currentUser?.uid;

    if (uid == null) {
      return const Center(child: Text('User not signed in.'));
    }

    return StreamBuilder<DatabaseEvent>(
      stream: FirebaseDatabase.instance.ref('drivers/$uid/locations').onValue,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final rawData = snapshot.data?.snapshot.value;

        if (rawData == null) {
          return AnimatedAddCard(
            title: 'No Locations Found',
            subtitle: 'Tap to add a new parking space',
            onTap: () => _showAddSpaceDialog(context),
          );
        }

        final locationsMap = Map<dynamic, dynamic>.from(rawData as Map);
        final locationEntries = locationsMap.entries.toList();

        return ListView(
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 16.0),
          children: [
            ...locationEntries.map((entry) {
              final locKey = entry.key.toString();
              final data = Map<String, dynamic>.from(entry.value as Map);
              final shortName = data['shortName']?.toString() ?? 'FAU';
              final fullName =
                  data['fullName']?.toString() ?? 'Florida Atlantic University';
              final address = data['address']?.toString() ??
                  '777 Glades Rd, Boca Raton, FL 33431';

              return Padding(
                padding: const EdgeInsets.only(bottom: 12.0),
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const FauMapScreen(),
                      ),
                    );
                  },
                  child: Container(
                    padding: const EdgeInsets.all(20.0),
                    decoration: BoxDecoration(
                      color: theme.cardColor,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: theme.dividerColor, width: 1.5),
                    ),
                    child: Row(
                      children: [
                        _buildCampusLogo(shortName, theme),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                fullName,
                                style: TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.bold,
                                  color: theme.colorScheme.onSurface,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                address,
                                style: TextStyle(
                                  fontSize: 13,
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline, size: 20),
                          color: Colors.redAccent.withOpacity(0.7),
                          tooltip: 'Remove Place',
                          onPressed: () {
                            FirebaseDatabase.instance
                                .ref('drivers/$uid/locations/$locKey')
                                .remove();
                          },
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () => _showAddSpaceDialog(context),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                side: BorderSide(color: theme.primaryColor, width: 1.5),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: Text(
                'Add more place',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: theme.primaryColor,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

// ==========================================
// FAU CAMPUS MAP SCREEN & PATHFINDING
// ==========================================

class FauBuilding {
  final String id;
  final String code;
  final String name;
  final LatLng position;
  final String recommendedLotId;

  const FauBuilding({
    required this.id,
    required this.code,
    required this.name,
    required this.position,
    this.recommendedLotId = 'N/A',
  });
}

class CampusWaypoint {
  final String id;
  final LatLng position;
  final List<String> neighbors;

  const CampusWaypoint({
    required this.id,
    required this.position,
    required this.neighbors,
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

class CampusPathfinder {
  static const Distance _dist = Distance();

  static final Map<String, CampusWaypoint> walkwayGraph = {
    // --- PARKING LOT ACCESS POINTS (Exact DB Keys) ---
    'node_lot12': const CampusWaypoint(
      id: 'node_lot12',
      position: LatLng(26.373262, -80.106806),
      neighbors: ['node_ed47_west'],
    ),
    'node_lot14': const CampusWaypoint(
      id: 'node_lot14',
      position: LatLng(26.373005, -80.099683),
      neighbors: ['node_bc71_east'],
    ),
    // ⭐️ Lot 07 (Reverted from lot20)
    'node_lot07': const CampusWaypoint(
      id: 'node_lot07',
      position: LatLng(26.373999, -80.105842),
      neighbors: ['node_ed47_west', 'node_lot06'],
    ),
    // ⭐️ Lot 06 (Reverted from garage2)
    'node_lot06': const CampusWaypoint(
      id: 'node_lot06',
      position: LatLng(26.374013, -80.104280),
      neighbors: ['node_lot07', 'node_breezeway_west'],
    ),

    // --- BUILDING ACCESS POINTS ---
    'node_ed47': const CampusWaypoint(
      id: 'node_ed47',
      position: LatLng(26.373358, -80.105828),
      neighbors: ['node_ed47_west', 'node_breezeway_west'],
    ),
    'node_bc71': const CampusWaypoint(
      id: 'node_bc71',
      position: LatLng(26.373263, -80.100446),
      neighbors: ['node_bc71_east', 'node_breezeway_east'],
    ),
    'node_cm22': const CampusWaypoint(
      id: 'node_cm22',
      position: LatLng(26.372528, -80.104044),
      neighbors: ['node_breezeway_west', 'node_breezeway_center'],
    ),

    // --- INTERMEDIATE WALKWAY INTERSECTIONS ---
    'node_ed47_west': const CampusWaypoint(
      id: 'node_ed47_west',
      position: LatLng(26.373300, -80.106300),
      neighbors: ['node_lot12', 'node_ed47', 'node_lot07'],
    ),
    'node_breezeway_west': const CampusWaypoint(
      id: 'node_breezeway_west',
      position: LatLng(26.373300, -80.103500),
      neighbors: ['node_ed47', 'node_breezeway_center', 'node_lot06', 'node_cm22'],
    ),
    'node_breezeway_center': const CampusWaypoint(
      id: 'node_breezeway_center',
      position: LatLng(26.373280, -80.101700),
      neighbors: ['node_breezeway_west', 'node_breezeway_east', 'node_cm22'],
    ),
    'node_breezeway_east': const CampusWaypoint(
      id: 'node_breezeway_east',
      position: LatLng(26.373270, -80.101000),
      neighbors: ['node_breezeway_center', 'node_bc71'],
    ),
    'node_bc71_east': const CampusWaypoint(
      id: 'node_bc71_east',
      position: LatLng(26.373150, -80.099950),
      neighbors: ['node_bc71', 'node_lot14'],
    ),
  };

  /// Evaluates lots, skips full ones, and selects the one with the shortest A* path to the building.
  static PathResult? findBestAvailableRoute({
    required LatLng buildingPos,
    required Map<String, Map<String, dynamic>> lots,
  }) {
    PathResult? bestResult;
    double shortestDistance = double.infinity;

    for (final entry in lots.entries) {
      final lotId = entry.key;
      final lotData = entry.value;

      final occupied = lotData['occupied'] as int? ?? 0;
      final capacity = lotData['capacity'] as int? ?? 1;

      // Skip full lots
      if (capacity > 0 && occupied >= capacity) {
        continue;
      }

      // Route from the waypoint if it exists, otherwise fallback to GPS
      final String nodeKey = 'node_$lotId';
      final LatLng lotPos = walkwayGraph.containsKey(nodeKey)
          ? walkwayGraph[nodeKey]!.position
          : (lotData['position'] as LatLng);

      final path = runAStar(start: lotPos, goal: buildingPos);
      final dist = _calculatePathDistance(path);

      if (dist < shortestDistance) {
        shortestDistance = dist;
        bestResult = PathResult(
          lotId: lotId,
          pathPoints: path,
          totalDistanceMeters: dist,
        );
      }
    }

    return bestResult;
  }

  static List<LatLng> runAStar({
    required LatLng start,
    required LatLng goal,
  }) {
    final startNodeId = _findClosestWaypoint(start);
    final goalNodeId = _findClosestWaypoint(goal);

    if (startNodeId == goalNodeId) {
      return [start, goal];
    }

    final List<String> openSet = [startNodeId];
    final Map<String, String> cameFrom = {};

    final Map<String, double> gScore = {
      for (final k in walkwayGraph.keys) k: double.infinity,
    };
    gScore[startNodeId] = 0.0;

    final Map<String, double> fScore = {
      for (final k in walkwayGraph.keys) k: double.infinity,
    };
    fScore[startNodeId] = _dist.as(
      LengthUnit.Meter,
      walkwayGraph[startNodeId]!.position,
      goal,
    );

    while (openSet.isNotEmpty) {
      openSet.sort((a, b) => fScore[a]!.compareTo(fScore[b]!));
      final current = openSet.removeAt(0);

      if (current == goalNodeId) {
        final List<LatLng> path = [goal];
        String curr = current;
        while (cameFrom.containsKey(curr)) {
          path.insert(0, walkwayGraph[curr]!.position);
          curr = cameFrom[curr]!;
        }
        path.insert(0, walkwayGraph[startNodeId]!.position);
        path.insert(0, start);
        return path;
      }

      final currentNode = walkwayGraph[current];
      if (currentNode == null) continue;

      for (final neighborId in currentNode.neighbors) {
        final neighborNode = walkwayGraph[neighborId];
        if (neighborNode == null) continue;

        final tentativeG = gScore[current]! +
            _dist.as(
              LengthUnit.Meter,
              currentNode.position,
              neighborNode.position,
            );

        if (tentativeG < (gScore[neighborId] ?? double.infinity)) {
          cameFrom[neighborId] = current;
          gScore[neighborId] = tentativeG;
          fScore[neighborId] = tentativeG +
              _dist.as(
                LengthUnit.Meter,
                neighborNode.position,
                goal,
              );

          if (!openSet.contains(neighborId)) {
            openSet.add(neighborId);
          }
        }
      }
    }

    return [start, goal];
  }

  static String _findClosestWaypoint(LatLng target) {
    String closestId = walkwayGraph.keys.first;
    double minMeters = double.infinity;

    walkwayGraph.forEach((id, wp) {
      final d = _dist.as(LengthUnit.Meter, target, wp.position);
      if (d < minMeters) {
        minMeters = d;
        closestId = id;
      }
    });

    return closestId;
  }

  static double _calculatePathDistance(List<LatLng> points) {
    double total = 0.0;
    for (int i = 0; i < points.length - 1; i++) {
      total += _dist.as(LengthUnit.Meter, points[i], points[i + 1]);
    }
    return total;
  }
}

// ---------------------------------------------------------
// REAL STREET & DRIVEWAY ROUTING ENGINE (OSRM)
// ---------------------------------------------------------

class RealRoadRouter {
  static const Distance _dist = Distance();

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
      final response = await http.get(url).timeout(const Duration(seconds: 4));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final routes = data['routes'] as List<dynamic>?;
        if (routes != null && routes.isNotEmpty) {
          final coordinates = routes[0]['geometry']['coordinates'] as List<dynamic>;
          return coordinates
              .map((pt) => LatLng((pt[1] as num).toDouble(), (pt[0] as num).toDouble()))
              .toList();
        }
      }
    } catch (_) {}

    return [start, destination];
  }

  static double calculateDistance(List<LatLng> points) {
    double total = 0.0;
    for (int i = 0; i < points.length - 1; i++) {
      total += _dist.as(LengthUnit.Meter, points[i], points[i + 1]);
    }
    return total;
  }
}

class FauMapScreen extends StatefulWidget {
  const FauMapScreen({super.key});

  @override
  State<FauMapScreen> createState() => _FauMapScreenState();
}

class _FauMapScreenState extends State<FauMapScreen> {
  final MapController _mapController = MapController();
  StreamSubscription<Position>? _positionStreamSub;
  StreamSubscription<DatabaseEvent>? _parkingSub;

  LatLng? _currentUserLocation;
  bool _isLocating = false;
  String _gpsStatus = 'Searching for GPS...';

  bool _developerMode = false;
  LatLng? _cursorLocation;

  FauBuilding? _selectedBuilding;
  PathResult? _currentRoute;

  static final LatLngBounds _fauBounds = LatLngBounds(
    const LatLng(26.3630, -80.1170),
    const LatLng(26.3860, -80.0890),
  );

  static const LatLng _fauCenter = LatLng(26.3745, -80.1030);

  // Physical coordinates on campus (keys match Firebase IDs: lot06, lot07, lot12, lot14)
  static final Map<String, LatLng> _lotPositions = {
    'lot12': const LatLng(26.373262, -80.106806),
    'lot14': const LatLng(26.373005, -80.099683),
    'lot07': const LatLng(26.373999, -80.105842),
    'lot06': const LatLng(26.374013, -80.104280),
  };

  // Live aggregated lots from Firebase
  Map<String, Map<String, dynamic>> _liveLots = {};

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

  @override
  void initState() {
    super.initState();
    _startLiveLocationTracking();
    _listenToFirebaseParking();
  }

  @override
  void dispose() {
    _positionStreamSub?.cancel();
    _parkingSub?.cancel();
    super.dispose();
  }

  /// Listens to Firebase Realtime Database 'demo' node to aggregate live curbs into lot totals
  void _listenToFirebaseParking() {
    _parkingSub = FirebaseDatabase.instance.ref('demo').onValue.listen((event) {
      final rawData = event.snapshot.value;
      if (rawData == null) return;

      final rootData = Map<dynamic, dynamic>.from(rawData as Map);
      final rawLots = rootData['lots'] != null
          ? Map<dynamic, dynamic>.from(rootData['lots'] as Map)
          : <dynamic, dynamic>{};
      final rawUnits = rootData['units'] != null
          ? Map<dynamic, dynamic>.from(rootData['units'] as Map)
          : <dynamic, dynamic>{};

      // 1. Group all curb units by lot to dynamically count capacity & occupied
      final Map<String, int> capacityMap = {};
      final Map<String, int> occupiedMap = {};

      rawUnits.forEach((unitKey, unitVal) {
        if (unitVal is Map) {
          final unitData = Map<String, dynamic>.from(unitVal);
          final String? targetLot = unitData['lot']?.toString();
          final bool isOccupied = unitData['occupied'] == true;

          if (targetLot != null && targetLot.isNotEmpty) {
            capacityMap[targetLot] = (capacityMap[targetLot] ?? 0) + 1;
            if (isOccupied) {
              occupiedMap[targetLot] = (occupiedMap[targetLot] ?? 0) + 1;
            }
          }
        }
      });

      // 2. Build live lots dictionary
      final Map<String, Map<String, dynamic>> updatedLots = {};

      rawLots.forEach((lotKey, lotVal) {
        final String lotId = lotKey.toString();
        final lotData = lotVal is Map ? Map<String, dynamic>.from(lotVal) : <String, dynamic>{};

        // Formats labels as Lot 6, Lot 7, etc.
        final String lotName = lotData['name']?.toString() ??
            (lotId == 'lot06'
                ? 'Lot 6'
                : lotId == 'lot07'
                    ? 'Lot 7'
                    : lotId.toUpperCase());

        final int totalUnits = capacityMap[lotId] ?? 0;
        final int occupiedUnits = occupiedMap[lotId] ?? 0;

        // Visual color thresholds
        final double ratio = totalUnits > 0 ? (occupiedUnits / totalUnits) : 0.0;
        Color badgeColor;
        if (totalUnits == 0) {
          badgeColor = Colors.grey;
        } else if (ratio < 0.60) {
          badgeColor = const Color(0xFFC6F24A); // Volt Green
        } else if (ratio < 0.90) {
          badgeColor = const Color(0xFFF5A623); // Orange
        } else {
          badgeColor = const Color(0xFFF2694C); // Red (Full)
        }

        updatedLots[lotId] = {
          'name': lotName,
          'status': '$occupiedUnits/$totalUnits',
          'occupied': occupiedUnits,
          'capacity': totalUnits,
          'position': _lotPositions[lotId] ?? const LatLng(26.373000, -80.103000),
          'color': badgeColor,
        };
      });

      if (mounted) {
        setState(() {
          _liveLots = updatedLots;
        });

        // 3. ⭐️ Real-time Rerouting: If a building is selected, recalculate with fresh occupancy
        if (_selectedBuilding != null) {
          _updateNavigationRoute(_selectedBuilding!);
        }
      }
    });
  }

  Future<void> _updateNavigationRoute(FauBuilding building) async {
    if (_liveLots.isEmpty) return;

    // A* selects closest available lot
    final bestLotResult = CampusPathfinder.findBestAvailableRoute(
      buildingPos: building.position,
      lots: _liveLots,
    );

    if (bestLotResult == null) {
      if (mounted) {
        setState(() => _currentRoute = null);
      }
      return;
    }

    final LatLng lotPos = _liveLots[bestLotResult.lotId]!['position'] as LatLng;

    // Check if live GPS is on campus, otherwise route from Glades Rd main entrance
    final bool isUserOnCampus = _currentUserLocation != null &&
        _fauBounds.contains(_currentUserLocation!);

    final LatLng startPos = isUserOnCampus
        ? _currentUserLocation!
        : const LatLng(26.3685, -80.1020);

    // Fetch road-snapped polyline
    final roadPoints = await RealRoadRouter.getRoadRoute(
      start: startPos,
      destination: lotPos,
    );

    if (mounted) {
      setState(() {
        _currentRoute = PathResult(
          lotId: bestLotResult.lotId,
          pathPoints: roadPoints,
          totalDistanceMeters: RealRoadRouter.calculateDistance(roadPoints),
        );
      });
    }
  }

  void _onBuildingSelected(FauBuilding building) {
    setState(() {
      _selectedBuilding = building;
    });
    _updateNavigationRoute(building);
    _mapController.move(building.position, 16.5);
  }

  Future<void> _startLiveLocationTracking() async {
    setState(() {
      _isLocating = true;
      _gpsStatus = 'Requesting GPS permissions...';
    });

    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() {
          _isLocating = false;
          _gpsStatus = 'Location services disabled.';
        });
        return;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          setState(() {
            _isLocating = false;
            _gpsStatus = 'GPS permission denied.';
          });
          return;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        setState(() {
          _isLocating = false;
          _gpsStatus = 'GPS permanently denied.';
        });
        return;
      }

      final initialPos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );

      if (mounted) {
        setState(() {
          _currentUserLocation = LatLng(initialPos.latitude, initialPos.longitude);
          _isLocating = false;
          _gpsStatus =
              'Live GPS: ${initialPos.latitude.toStringAsFixed(4)}, ${initialPos.longitude.toStringAsFixed(4)}';
          if (_selectedBuilding != null) {
            _updateNavigationRoute(_selectedBuilding!);
          }
        });
      }

      _positionStreamSub = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 2,
        ),
      ).listen((Position position) {
        if (!mounted) return;
        setState(() {
          _currentUserLocation = LatLng(position.latitude, position.longitude);
          _isLocating = false;
          _gpsStatus =
              'Live GPS: ${position.latitude.toStringAsFixed(4)}, ${position.longitude.toStringAsFixed(4)}';
          if (_selectedBuilding != null) {
            _updateNavigationRoute(_selectedBuilding!);
          }
        });
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLocating = false;
          _gpsStatus = 'Error reading GPS: $e';
        });
      }
    }
  }

  void _showBuildingSelector() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF171714),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Select Destination Building',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white70),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                ],
              ),
              const Divider(color: Colors.white24),
              Expanded(
                child: ListView.separated(
                  itemCount: _campusBuildings.length,
                  separatorBuilder: (context, index) =>
                      const Divider(color: Colors.white12, height: 1),
                  itemBuilder: (context, index) {
                    final bldg = _campusBuildings[index];

                    final bestRoute = CampusPathfinder.findBestAvailableRoute(
                      buildingPos: bldg.position,
                      lots: _liveLots,
                    );

                    final lot = bestRoute != null ? _liveLots[bestRoute.lotId] : null;

                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
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
                                color: Color(0xFFC6F24A),
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
                                    color: Colors.white,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 14,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  lot != null
                                      ? 'Best Lot: ${lot['name']} (${lot['status']} open • ${bestRoute!.totalDistanceMeters.round()}m)'
                                      : 'All nearby lots full',
                                  style: const TextStyle(
                                    color: Colors.white60,
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
                            icon: const Icon(
                              Icons.navigation,
                              size: 14,
                              color: Colors.black,
                            ),
                            label: const Text(
                              'Go to',
                              style: TextStyle(
                                color: Colors.black,
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                              ),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFFC6F24A),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 6,
                              ),
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
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
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Resolve recommended lot safely
    Map<String, dynamic>? recommendedLot;
    if (_currentRoute != null && _liveLots.containsKey(_currentRoute!.lotId)) {
      recommendedLot = _liveLots[_currentRoute!.lotId];
    } else if (_selectedBuilding != null) {
      final instantBest = CampusPathfinder.findBestAvailableRoute(
        buildingPos: _selectedBuilding!.position,
        lots: _liveLots,
      );
      if (instantBest != null) {
        recommendedLot = _liveLots[instantBest.lotId];
      }
    }

    final bool isInsideCampus = _currentUserLocation != null &&
        _fauBounds.contains(_currentUserLocation!);

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
              _developerMode
                  ? '🛠 Developer Mode Active'
                  : 'Boca Raton Main Campus',
              style: TextStyle(
                fontSize: 12,
                color: _developerMode
                    ? Colors.cyanAccent
                    : theme.colorScheme.onSurfaceVariant,
                fontWeight:
                    _developerMode ? FontWeight.bold : FontWeight.normal,
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
              _developerMode
                  ? Icons.developer_mode
                  : Icons.developer_mode_outlined,
              color: _developerMode
                  ? Colors.cyanAccent
                  : theme.colorScheme.onSurfaceVariant,
            ),
            tooltip: _developerMode
                ? 'Disable Developer Mode'
                : 'Enable Developer Mode',
            onPressed: () {
              setState(() {
                _developerMode = !_developerMode;
                if (!_developerMode) {
                  _cursorLocation = null;
                }
              });
            },
          ),
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
                : const Icon(Icons.my_location),
            tooltip: 'My Location',
            onPressed: () {
              if (_currentUserLocation != null) {
                _mapController.move(_currentUserLocation!, 17.5);
              }
            },
          ),
          IconButton(
            icon: const Icon(Icons.center_focus_strong),
            tooltip: 'Reset Campus View',
            onPressed: () {
              setState(() {
                _selectedBuilding = null;
                _currentRoute = null;
              });
              _mapController.move(_fauCenter, 15.3);
            },
          ),
        ],
      ),
      body: Stack(
        children: [
          MouseRegion(
            onHover: (PointerEvent event) {
              if (_developerMode) {
                try {
                  final latLng =
                      _mapController.camera.offsetToCrs(event.localPosition);
                  setState(() {
                    _cursorLocation = latLng;
                  });
                } catch (_) {}
              }
            },
            onExit: (_) {
              if (_developerMode) {
                setState(() => _cursorLocation = null);
              }
            },
            child: FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: _fauCenter,
                initialZoom: 15.3,
                minZoom: 15.0,
                maxZoom: 19.5,
                cameraConstraint:
                    CameraConstraint.containCenter(bounds: _fauBounds),
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.pinchZoom |
                      InteractiveFlag.drag |
                      InteractiveFlag.doubleTapZoom |
                      InteractiveFlag.scrollWheelZoom,
                ),
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.smartcurb.app',
                  maxNativeZoom: 19,
                  maxZoom: 20,
                ),

                // Real-time Road Navigation Polyline
                if (_currentRoute != null && _currentRoute!.pathPoints.isNotEmpty)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: _currentRoute!.pathPoints,
                        strokeWidth: 6.5,
                        color: Colors.black87,
                      ),
                      Polyline(
                        points: _currentRoute!.pathPoints,
                        strokeWidth: 4.0,
                        color: const Color(0xFFC6F24A),
                      ),
                    ],
                  ),

                MarkerLayer(
                  markers: [
                    // 1. Live Device GPS Puck
                    if (_currentUserLocation != null)
                      Marker(
                        point: _currentUserLocation!,
                        alignment: Alignment.center,
                        width: 34,
                        height: 34,
                        child: Container(
                          decoration: BoxDecoration(
                            color: const Color(0xFFC6F24A),
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.black, width: 3),
                          ),
                          child: const Icon(
                            Icons.navigation,
                            size: 14,
                            color: Colors.black,
                          ),
                        ),
                      ),

                    // 2. Interactive Campus Building Markers
                    ..._campusBuildings.map((bldg) {
                      final isSelected = _selectedBuilding?.id == bldg.id;

                      return Marker(
                        point: bldg.position,
                        alignment: Alignment.center,
                        width: isSelected ? 120 : 80,
                        height: isSelected ? 48 : 30,
                        child: GestureDetector(
                          onTap: () => _onBuildingSelected(bldg),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? Colors.cyanAccent
                                  : const Color(0xDD1F242A),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                color: isSelected
                                    ? Colors.white
                                    : Colors.cyanAccent.withOpacity(0.7),
                                width: isSelected ? 2 : 1,
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: (isSelected
                                          ? Colors.cyanAccent
                                          : Colors.black)
                                      .withOpacity(0.4),
                                  blurRadius: 4,
                                ),
                              ],
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.business,
                                  size: isSelected ? 14 : 11,
                                  color: isSelected
                                      ? Colors.black
                                      : Colors.cyanAccent,
                                ),
                                const SizedBox(width: 4),
                                Flexible(
                                  child: Text(
                                    bldg.code,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: isSelected
                                          ? Colors.black
                                          : Colors.white,
                                      fontSize: isSelected ? 11 : 9,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    }),

                    // 3. Dynamic Parking Lots Markers from Firebase
                    ..._liveLots.entries.map((entry) {
                      final isBest = _currentRoute != null &&
                          _currentRoute!.lotId == entry.key;

                      return _buildLotMarker(
                        point: entry.value['position'] as LatLng,
                        name: entry.value['name'] as String,
                        status: entry.value['status'] as String,
                        badgeColor: isBest
                            ? const Color(0xFFC6F24A)
                            : entry.value['color'] as Color,
                        isHighlighted: isBest,
                      );
                    }),
                  ],
                ),
              ],
            ),
          ),

          // Top Floating Destination Selector Bar
          Positioned(
            top: 16,
            left: 16,
            right: 16,
            child: GestureDetector(
              onTap: _showBuildingSelector,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: const Color(0xFF171714),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _selectedBuilding != null
                        ? const Color(0xFFC6F24A)
                        : Colors.white24,
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
                      color: _selectedBuilding != null
                          ? const Color(0xFFC6F24A)
                          : Colors.white70,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        _selectedBuilding != null
                            ? 'Destination: ${_selectedBuilding!.name}'
                            : 'Choose a building destination...',
                        style: TextStyle(
                          color: _selectedBuilding != null
                              ? Colors.white
                              : Colors.white60,
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (_selectedBuilding != null)
                      GestureDetector(
                        onTap: () => setState(() {
                          _selectedBuilding = null;
                          _currentRoute = null;
                        }),
                        child: const Icon(
                          Icons.cancel,
                          color: Colors.white54,
                          size: 20,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),

          // Cursor GPS Banner
          if (_developerMode)
            Positioned(
              top: 80,
              left: 20,
              right: 20,
              child: Center(
                child: GestureDetector(
                  onTap: () {
                    if (_cursorLocation != null) {
                      final str =
                          'LatLng(${_cursorLocation!.latitude.toStringAsFixed(6)}, ${_cursorLocation!.longitude.toStringAsFixed(6)})';
                      Clipboard.setData(ClipboardData(text: str));
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('Copied to clipboard: $str'),
                          duration: const Duration(seconds: 2),
                        ),
                      );
                    }
                  },
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: const Color(0xEE0B1A24),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: Colors.cyanAccent, width: 1.5),
                      boxShadow: const [
                        BoxShadow(color: Colors.black87, blurRadius: 8),
                      ],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.gps_fixed,
                            color: Colors.cyanAccent, size: 16),
                        const SizedBox(width: 8),
                        Text(
                          _cursorLocation != null
                              ? 'Cursor GPS: Lat ${_cursorLocation!.latitude.toStringAsFixed(6)}, Lng ${_cursorLocation!.longitude.toStringAsFixed(6)} (Tap to copy)'
                              : 'Move cursor over map to read coordinates',
                          style: const TextStyle(
                            color: Colors.cyanAccent,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),

          // Bottom Guidance Card
          Positioned(
            bottom: 24,
            left: 20,
            right: 20,
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: theme.cardColor,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _selectedBuilding != null
                      ? const Color(0xFFC6F24A)
                      : theme.dividerColor,
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
                    _selectedBuilding != null
                        ? Icons.assistant_direction
                        : Icons.my_location,
                    color: theme.primaryColor,
                    size: 24,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _selectedBuilding != null
                              ? 'Best Lot: ${recommendedLot?['name'] ?? 'Finding open lot...'}'
                              : 'FAU Boca Raton Main Campus',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: theme.colorScheme.onSurface,
                          ),
                        ),
                        Text(
                          _selectedBuilding != null
                              ? (recommendedLot != null
                                  ? 'Routing from live GPS to ${recommendedLot['name']} (${_currentRoute?.totalDistanceMeters.round() ?? 0}m)'
                                  : 'All nearby lots are currently full')
                              : (_currentUserLocation == null
                                  ? _gpsStatus
                                  : (isInsideCampus
                                      ? '📍 On Campus • Live Tracking Active'
                                      : '🚗 Outside Campus Perimeter')),
                          style: TextStyle(
                            fontSize: 12,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Marker _buildLotMarker({
    required LatLng point,
    required String name,
    required String status,
    required Color badgeColor,
    bool isHighlighted = false,
  }) {
    return Marker(
      point: point,
      alignment: Alignment.center,
      width: isHighlighted ? 120 : 105,
      height: isHighlighted ? 62 : 56,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
        decoration: BoxDecoration(
          color: const Color(0xFF0F0F0D),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: badgeColor,
            width: isHighlighted ? 3 : 2,
          ),
          boxShadow: [
            BoxShadow(
              color: badgeColor.withOpacity(isHighlighted ? 0.6 : 0.25),
              blurRadius: isHighlighted ? 12 : 6,
              spreadRadius: isHighlighted ? 2 : 0,
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontWeight: isHighlighted ? FontWeight.w900 : FontWeight.bold,
                fontSize: 10.5,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              status,
              maxLines: 1,
              style: TextStyle(
                color: badgeColor,
                fontWeight: FontWeight.w800,
                fontSize: 11,
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

class _VehicleTab extends StatelessWidget {
  const _VehicleTab();

  void _openAddVehicleDialog(BuildContext context) {
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (dialogCtx) => const _VehicleFormDialog(),
    );
  }

  void _showVehicleDetails(
    BuildContext context,
    Map<String, dynamic> data,
    String key,
  ) {
    final theme = Theme.of(context);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: theme.cardColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            Icon(Icons.directions_car, color: theme.primaryColor),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                '${data['model'] ?? 'Vehicle'}',
                style: TextStyle(color: theme.colorScheme.onSurface),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DetailInfoRow(
              label: 'Plate Number',
              value: data['plate']?.toString() ?? 'N/A',
            ),
            DetailInfoRow(
              label: 'Manufacturer',
              value: data['manufacturer']?.toString() ?? 'N/A',
            ),
            DetailInfoRow(
              label: 'Year',
              value: data['year']?.toString() ?? 'N/A',
            ),
            DetailInfoRow(
              label: 'Color',
              value: data['color']?.toString() ?? 'N/A',
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              final uid = FirebaseAuth.instance.currentUser?.uid;
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
              backgroundColor: theme.primaryColor,
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
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return const Center(child: Text('User not signed in.'));

    final theme = Theme.of(context);

    return StreamBuilder<DatabaseEvent>(
      stream: FirebaseDatabase.instance.ref('drivers/$uid/vehicles').onValue,
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
        if (rawData == null) {
          return AnimatedAddCard(
            title: 'No Vehicle Found',
            subtitle: 'Tap to add a new vehicle to your account',
            onTap: () => _openAddVehicleDialog(context),
          );
        }

        final vehiclesMap = Map<dynamic, dynamic>.from(rawData as Map);
        final vehicleEntries = vehiclesMap.entries.toList();

        return ListView(
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 16.0),
          children: [
            ...vehicleEntries.map((entry) {
              final key = entry.key.toString();
              final data = Map<String, dynamic>.from(entry.value as Map);
              return Padding(
                padding: const EdgeInsets.only(bottom: 12.0),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => _showVehicleDetails(context, data, key),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 20,
                    ),
                    decoration: BoxDecoration(
                      color: theme.cardColor,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: theme.dividerColor, width: 2),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          data['model']?.toString() ?? 'Unknown Model',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: theme.colorScheme.onSurface,
                          ),
                        ),
                        Text(
                          data['plate']?.toString() ?? 'No Plate',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: theme.primaryColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () => _openAddVehicleDialog(context),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                side: BorderSide(color: theme.primaryColor, width: 1.5),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: Text(
                'Add more vehicle',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: theme.primaryColor,
                ),
              ),
            ),
          ],
        );
      },
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
        context,
        'Please fill out at least Model and License Plate.',
      );
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
    final theme = Theme.of(context);
    return Dialog(
      backgroundColor: theme.cardColor,
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
                Text(
                  'Add New Vehicle',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.onSurface,
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
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: theme.colorScheme.onSurface,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      side: BorderSide(color: theme.dividerColor),
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
                    onPressed: _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: theme.primaryColor,
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
            ),
          ],
        ),
      ),
    );
  }
}

// ==========================================
// TAB 3: PROFILE
// ==========================================

class _ProfileTab extends StatelessWidget {
  const _ProfileTab();

  void _openContactDialog(BuildContext context, {Map<String, dynamic>? data}) {
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (dialogCtx) => _ContactInfoDialog(existingData: data),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return const Center(child: Text('User not signed in.'));

    final theme = Theme.of(context);

    return StreamBuilder<DatabaseEvent>(
      stream: FirebaseDatabase.instance
          .ref('drivers/${user.uid}/profile')
          .onValue,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final rawData = snapshot.data?.snapshot.value;
        if (rawData == null) {
          return AnimatedAddCard(
            title: 'Profile Incomplete',
            subtitle: 'Tap to add your contact information',
            onTap: () => _openContactDialog(context),
          );
        }

        final data = Map<String, dynamic>.from(rawData as Map);
        if (data['firstName'] == null) {
          return AnimatedAddCard(
            title: 'Profile Incomplete',
            subtitle: 'Tap to add your contact information',
            onTap: () => _openContactDialog(context),
          );
        }

        final middle = (data['middleName'] ?? '').toString().trim();
        final fullName = middle.isEmpty
            ? '${data['firstName']} ${data['lastName']}'
            : '${data['firstName']} $middle ${data['lastName']}';

        final addr2 = (data['address2'] ?? '').toString().trim();
        final zip = data['zipCode'] ?? '';
        final fullAddress = addr2.isEmpty
            ? '${data['address1']}\n${data['city']}, ${data['state']} $zip\n${data['country']}'
            : '${data['address1']}, $addr2\n${data['city']}, ${data['state']} $zip\n${data['country']}';

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
                        color: theme.cardColor,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: theme.dividerColor),
                      ),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 34,
                            backgroundColor: theme.scaffoldBackgroundColor,
                            child: Icon(
                              Icons.person,
                              size: 38,
                              color: theme.primaryColor,
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  fullName,
                                  style: TextStyle(
                                    fontSize: 20,
                                    fontWeight: FontWeight.bold,
                                    color: theme.colorScheme.onSurface,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  user.email ?? '',
                                  style: TextStyle(
                                    fontSize: 14,
                                    color: theme.colorScheme.onSurfaceVariant,
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
                        color: theme.cardColor,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: theme.dividerColor),
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
                padding: const EdgeInsets.symmetric(
                  horizontal: 24.0,
                  vertical: 16.0,
                ),
                child: PrimaryButton(
                  title: 'Edit Information',
                  icon: Icons.edit_outlined,
                  onPressed: () => _openContactDialog(context, data: data),
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
    _phoneCtrl = TextEditingController(text: d?['phone']?.toString() ?? '');
    _firstCtrl = TextEditingController(text: d?['firstName']?.toString() ?? '');
    _lastCtrl = TextEditingController(text: d?['lastName']?.toString() ?? '');
    _middleCtrl =
        TextEditingController(text: d?['middleName']?.toString() ?? '');
    _addr1Ctrl = TextEditingController(text: d?['address1']?.toString() ?? '');
    _addr2Ctrl = TextEditingController(text: d?['address2']?.toString() ?? '');
    _cityCtrl = TextEditingController(text: d?['city']?.toString() ?? '');
    _stateCtrl = TextEditingController(text: d?['state']?.toString() ?? '');
    _zipCtrl = TextEditingController(text: d?['zipCode']?.toString() ?? '');
    _countryCtrl =
        TextEditingController(text: d?['country']?.toString() ?? '');
    _gender = d?['gender']?.toString();
  }

  @override
  void dispose() {
    _phoneCtrl.dispose();
    _firstCtrl.dispose();
    _lastCtrl.dispose();
    _middleCtrl.dispose();
    _addr1Ctrl.dispose();
    _addr2Ctrl.dispose();
    _cityCtrl.dispose();
    _stateCtrl.dispose();
    _zipCtrl.dispose();
    _countryCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    if (_phoneCtrl.text.trim().isEmpty ||
        _firstCtrl.text.trim().isEmpty ||
        _lastCtrl.text.trim().isEmpty ||
        _gender == null ||
        _addr1Ctrl.text.trim().isEmpty ||
        _cityCtrl.text.trim().isEmpty ||
        _stateCtrl.text.trim().isEmpty ||
        _zipCtrl.text.trim().isEmpty ||
        _countryCtrl.text.trim().isEmpty) {
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
    final theme = Theme.of(context);
    return Dialog(
      backgroundColor: theme.cardColor,
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
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.onSurface,
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
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: theme.cardColor,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: theme.dividerColor),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _gender,
                    isExpanded: true,
                    hint: Row(
                      children: [
                        Icon(Icons.transgender, color: theme.primaryColor),
                        const SizedBox(width: 12),
                        Text(
                          'Gender *',
                          style: TextStyle(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                    dropdownColor: theme.cardColor,
                    icon: Icon(Icons.arrow_drop_down, color: theme.primaryColor),
                    items: const [
                      DropdownMenuItem(value: 'Male', child: Text('Male')),
                      DropdownMenuItem(value: 'Female', child: Text('Female')),
                      DropdownMenuItem(value: 'Other', child: Text('Other')),
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
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: theme.colorScheme.onSurface,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        side: BorderSide(color: theme.dividerColor),
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
                      onPressed: _submit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: theme.primaryColor,
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
              ),
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
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: theme.dividerColor),
      ),
      child: TextField(
        controller: controller,
        obscureText: obscureText,
        keyboardType: keyboardType,
        style: TextStyle(color: theme.colorScheme.onSurface),
        decoration: InputDecoration(
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 16,
          ),
          hintText: hintText,
          hintStyle: TextStyle(
            color: theme.colorScheme.onSurfaceVariant,
            fontSize: 14,
          ),
          prefixIcon: Icon(icon, color: theme.primaryColor, size: 20),
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
    final theme = Theme.of(context);
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: theme.primaryColor,
          foregroundColor: const Color(0xFF12110F),
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
                  color: Color(0xFF12110F),
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
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              color: theme.colorScheme.onSurfaceVariant,
              fontSize: 14,
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: theme.colorScheme.onSurface,
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
    final theme = Theme.of(context);
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
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            curve: Curves.easeInOut,
            width: double.infinity,
            height: 220,
            transform: Matrix4.identity()..scale(_isPressed ? 0.95 : 1.0),
            transformAlignment: Alignment.center,
            decoration: BoxDecoration(
              color: theme.cardColor,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: _isPressed
                    ? theme.primaryColor.withOpacity(0.6)
                    : theme.dividerColor,
                width: 2,
              ),
              boxShadow: _isPressed
                  ? [
                      BoxShadow(
                        color: theme.primaryColor.withOpacity(0.15),
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
                    color: theme.scaffoldBackgroundColor,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: _isPressed
                            ? theme.primaryColor.withOpacity(0.4)
                            : theme.primaryColor.withOpacity(0.1),
                        blurRadius: _isPressed ? 25 : 15,
                        spreadRadius: _isPressed ? 8 : 5,
                      ),
                    ],
                  ),
                  child: Icon(Icons.add, size: 40, color: theme.primaryColor),
                ),
                const SizedBox(height: 20),
                Text(
                  widget.title,
                  style: TextStyle(
                    color: theme.colorScheme.onSurface,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  widget.subtitle,
                  style: TextStyle(
                    color: theme.colorScheme.onSurfaceVariant,
                    fontSize: 14,
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
// STATIC USER PAGES
// ==========================================

class UserSettingsPage extends StatelessWidget {
  const UserSettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16.0),
        children: [
          ListTile(
            leading: Icon(Icons.dark_mode, color: theme.primaryColor),
            title: Text(
              'Dark Mode',
              style: TextStyle(color: theme.colorScheme.onSurface),
            ),
            trailing: Switch(
              value: themeNotifier.value == ThemeMode.dark,
              onChanged: (val) =>
                  themeNotifier.value = val ? ThemeMode.dark : ThemeMode.light,
              activeColor: theme.scaffoldBackgroundColor,
              activeTrackColor: theme.primaryColor,
            ),
          ),
          ListTile(
            leading: Icon(
              Icons.notifications_active,
              color: theme.primaryColor,
            ),
            title: Text(
              'Notifications',
              style: TextStyle(color: theme.colorScheme.onSurface),
            ),
            trailing: Switch(
              value: true,
              onChanged: (_) {},
              activeColor: theme.scaffoldBackgroundColor,
              activeTrackColor: theme.primaryColor,
            ),
          ),
          ListTile(
            leading: Icon(Icons.mail_outline, color: theme.primaryColor),
            title: Text(
              'Contact Us',
              style: TextStyle(color: theme.colorScheme.onSurface),
            ),
            trailing: Icon(
              Icons.arrow_forward_ios,
              color: theme.colorScheme.onSurfaceVariant,
              size: 16,
            ),
            onTap: () {},
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
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('About App')),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.radar, color: theme.primaryColor, size: 60),
            const SizedBox(height: 20),
            Text(
              'Smart Curb is an intelligent IoT parking sensing application designed to monitor space availability and manage vehicles for individual users.',
              style: TextStyle(
                color: theme.colorScheme.onSurfaceVariant,
                height: 1.5,
                fontSize: 16,
              ),
            ),
            const SizedBox(height: 30),
            Divider(color: theme.dividerColor),
            const SizedBox(height: 10),
            Text(
              'Version: 1.0.0 (Beta)',
              style: TextStyle(
                color: theme.primaryColor,
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
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.bold,
        ),
      ),
      backgroundColor: Colors.redAccent,
    ),
  );
}