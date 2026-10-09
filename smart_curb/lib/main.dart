import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_compass/flutter_compass.dart';
import 'package:geolocator/geolocator.dart' as geo;
import 'package:google_fonts/google_fonts.dart';
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
// THEME (dark only) — mirrors admin-dashboard/src/theme.js
// ==========================================

const Color kAccent = Color(0xFFC6F24A); // c.accent
const Color kBg = Color(0xFF0F0F0D); // c.bg
const Color kBar = Color(0xFF090908); // c.side
const Color kCard = Color(0xFF171714); // c.panel
const Color kCardAlt = Color(0xFF1D1D19); // c.card
const Color kDivider = Color(0xFF2B2B25); // c.line
const Color kText = Color(0xFFF2F1EA); // c.text
const Color kTextMuted = Color(0xFF8E8C82); // c.dim
const Color kOnAccent = Color(0xFF12110F); // c.onAccent
const Color kOpen = Color(0xFF8BD44A); // c.open
const Color kAmber = Color(0xFFE0A63C); // c.warn
const Color kRed = Color(0xFFF2694C); // c.busy
const Color kNavBg = Color(0xFF232B15); // c.navBg
const Color kNavText = Color(0xFFA5A399); // c.navText
const Color kDev = Colors.cyanAccent;

/// Dashboard corner radius (5–6px everywhere).
const double kRadius = 6;

/// TODO: replace with your real support address.
const String kSupportEmail = 'support@example.com';

/// IBM Plex Mono, the dashboard's heading/number font (`mono` in theme.js).
TextStyle mono({
  double? fontSize,
  FontWeight fontWeight = FontWeight.w600,
  Color color = kText,
  double? letterSpacing,
}) =>
    GoogleFonts.ibmPlexMono(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      letterSpacing: letterSpacing,
    );

final RoundedRectangleBorder _panelShape = RoundedRectangleBorder(
  borderRadius: BorderRadius.circular(kRadius),
  side: const BorderSide(color: kDivider),
);

final ThemeData appTheme = ThemeData(
  useMaterial3: true,
  brightness: Brightness.dark,
  primaryColor: kAccent,
  scaffoldBackgroundColor: kBg,
  cardColor: kCard,
  dividerColor: kDivider,
  // Archivo is the dashboard's body font.
  textTheme: GoogleFonts.archivoTextTheme(ThemeData.dark().textTheme)
      .apply(bodyColor: kText, displayColor: kText),
  dividerTheme: const DividerThemeData(color: kDivider, thickness: 1),
  // Slim, rounded scrollbar in the dashboard's colours.
  scrollbarTheme: ScrollbarThemeData(
    thickness: const WidgetStatePropertyAll(4),
    radius: const Radius.circular(4),
    thumbColor: WidgetStateProperty.resolveWith(
      (s) => s.contains(WidgetState.dragged) || s.contains(WidgetState.hovered)
          ? kAccent.withValues(alpha: 0.8)
          : kTextMuted.withValues(alpha: 0.45),
    ),
    crossAxisMargin: 2,
  ),
  // Modern page transitions: new pages fade in while sliding forward
  // (iOS/macOS keep the native slide so swipe-back still works).
  pageTransitionsTheme: const PageTransitionsTheme(
    builders: {
      TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.fuchsia: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.windows: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.linux: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
    },
  ),
  dialogTheme: DialogThemeData(backgroundColor: kCard, shape: _panelShape),
  bottomSheetTheme: const BottomSheetThemeData(backgroundColor: kCard),
  popupMenuTheme: PopupMenuThemeData(color: kCard, shape: _panelShape),
  snackBarTheme: SnackBarThemeData(
    backgroundColor: kCardAlt,
    contentTextStyle: GoogleFonts.archivo(color: kText, fontSize: 13),
    behavior: SnackBarBehavior.floating,
    shape: _panelShape,
  ),
  // Page header bar: panel background with a 1px bottom rule.
  appBarTheme: AppBarTheme(
    backgroundColor: kCard,
    elevation: 0,
    scrolledUnderElevation: 0,
    shape: const Border(bottom: BorderSide(color: kDivider)),
    iconTheme: const IconThemeData(color: kText),
    titleTextStyle: mono(fontSize: 17),
  ),
  colorScheme: const ColorScheme.dark(
    primary: kAccent,
    onPrimary: kOnAccent,
    secondary: kAccent,
    onSecondary: kOnAccent,
    surface: kCard,
    onSurface: kText,
    onSurfaceVariant: kTextMuted,
    outline: kDivider,
    error: kRed,
  ),
  elevatedButtonTheme: ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(
      backgroundColor: kAccent,
      foregroundColor: kOnAccent,
      elevation: 0,
      textStyle: GoogleFonts.archivo(fontSize: 14, fontWeight: FontWeight.w600),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(kRadius),
      ),
    ),
  ),
  outlinedButtonTheme: OutlinedButtonThemeData(
    style: OutlinedButton.styleFrom(
      foregroundColor: kText,
      backgroundColor: kBg,
      side: const BorderSide(color: kDivider),
      textStyle: GoogleFonts.archivo(fontSize: 14, fontWeight: FontWeight.w600),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(kRadius),
      ),
    ),
  ),
  textButtonTheme: TextButtonThemeData(
    style: TextButton.styleFrom(
      foregroundColor: kAccent,
      textStyle: GoogleFonts.archivo(fontSize: 13, fontWeight: FontWeight.w600),
    ),
  ),
  switchTheme: SwitchThemeData(
    thumbColor: WidgetStateProperty.resolveWith(
      (s) => s.contains(WidgetState.selected) ? kOnAccent : kTextMuted,
    ),
    trackColor: WidgetStateProperty.resolveWith(
      (s) => s.contains(WidgetState.selected) ? kAccent : kBg,
    ),
    trackOutlineColor: const WidgetStatePropertyAll(kDivider),
  ),
  // Bottom nav = dashboard sidebar: active item gets the navBg pill.
  navigationBarTheme: NavigationBarThemeData(
    backgroundColor: kBar,
    indicatorColor: kNavBg,
    indicatorShape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(kRadius),
    ),
    surfaceTintColor: Colors.transparent,
    iconTheme: WidgetStateProperty.resolveWith(
      (s) => IconThemeData(
        color: s.contains(WidgetState.selected) ? kAccent : kNavText,
      ),
    ),
    labelTextStyle: WidgetStateProperty.resolveWith(
      (s) => GoogleFonts.archivo(
        fontSize: 12,
        fontWeight:
            s.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
        color: s.contains(WidgetState.selected) ? kAccent : kNavText,
      ),
    ),
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
      scrollBehavior: const AppScrollBehavior(),
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
                // Logo pops in (scale + fade), then the rest rises in order.
                const _LogoEntrance(),
                const SizedBox(height: 20),
                const FadeSlideIn(index: 2, child: _BrandTitle(fontSize: 26)),
                const SizedBox(height: 6),
                const FadeSlideIn(
                  index: 3,
                  child: Text(
                    'SMART PARKING',
                    style: TextStyle(
                      color: kTextMuted,
                      fontSize: 10,
                      letterSpacing: 1.2,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(height: 40),
                FadeSlideIn(
                  index: 4,
                  child: AppTextField(
                    controller: _emailCtrl,
                    hintText: 'Email',
                    icon: Icons.email_outlined,
                    keyboardType: TextInputType.emailAddress,
                  ),
                ),
                const SizedBox(height: 16),
                FadeSlideIn(
                  index: 5,
                  child: AppTextField(
                    controller: _passwordCtrl,
                    hintText: 'Password',
                    icon: Icons.lock_outline,
                    obscureText: true,
                  ),
                ),
                const SizedBox(height: 28),
                FadeSlideIn(
                  index: 6,
                  child: PrimaryButton(
                    title: 'Login',
                    isLoading: _isLoading,
                    onPressed: _handleLogin,
                  ),
                ),
                const SizedBox(height: 16),
                FadeSlideIn(
                  index: 7,
                  child: TextButton(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const RegisterPage()),
                    ),
                    child: const Text("Don't have an account? Register"),
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
        style: mono(fontSize: fontSize, letterSpacing: 1.5),
        children: const [
          TextSpan(text: 'SMART ', style: TextStyle(color: kText)),
          TextSpan(text: 'CURB', style: TextStyle(color: kAccent)),
        ],
      ),
    );
  }
}

/// Login logo: scales up from 85% with a soft accent glow that fades out.
class _LogoEntrance extends StatelessWidget {
  const _LogoEntrance();

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: reduceMotion(context) ? Duration.zero : kMotionSlow * 2,
      curve: Curves.easeOutBack,
      builder: (context, t, child) => Opacity(
        opacity: t.clamp(0.0, 1.0),
        child: Transform.scale(
          scale: 0.85 + 0.15 * t,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              boxShadow: [
                BoxShadow(
                  color: kAccent.withValues(
                    alpha: 0.25 * (1 - t.clamp(0.0, 1.0)),
                  ),
                  blurRadius: 40,
                  spreadRadius: 6,
                ),
              ],
            ),
            child: child,
          ),
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Image.asset(
          'assets/logo.png',
          height: 140,
          fit: BoxFit.contain,
          errorBuilder: (_, _, _) =>
              const Icon(Icons.radar, size: 100, color: kAccent),
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
                const FadeSlideIn(
                  child: Icon(Icons.person_add_alt_1, size: 70, color: kAccent),
                ),
                const SizedBox(height: 16),
                FadeSlideIn(
                  index: 1,
                  child: Text('Join Smart Curb', style: mono(fontSize: 24)),
                ),
                const SizedBox(height: 32),
                FadeSlideIn(
                  index: 2,
                  child: AppTextField(
                    controller: _emailCtrl,
                    hintText: 'Email Address',
                    icon: Icons.email_outlined,
                    keyboardType: TextInputType.emailAddress,
                  ),
                ),
                const SizedBox(height: 16),
                FadeSlideIn(
                  index: 3,
                  child: AppTextField(
                    controller: _passwordCtrl,
                    hintText: 'Password',
                    icon: Icons.lock_outline,
                    obscureText: true,
                  ),
                ),
                const SizedBox(height: 16),
                FadeSlideIn(
                  index: 4,
                  child: AppTextField(
                    controller: _confirmCtrl,
                    hintText: 'Confirm Password',
                    icon: Icons.lock_reset,
                    obscureText: true,
                  ),
                ),
                const SizedBox(height: 28),
                FadeSlideIn(
                  index: 5,
                  child: PrimaryButton(
                    title: 'Register',
                    isLoading: _isLoading,
                    onPressed: _handleRegister,
                  ),
                ),
                const SizedBox(height: 16),
                FadeSlideIn(
                  index: 6,
                  child: TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Already have an account? Back to Login'),
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
      body: FadeIndexedStack(
        index: _currentIndex,
        children: const [
          _HomeTab(),
          _VehicleTab(),
          _ProfileTab(),
        ],
      ),
      bottomNavigationBar: DecoratedBox(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: kDivider)),
        ),
        child: NavigationBar(
          selectedIndex: _currentIndex,
          onDestinationSelected: (index) =>
              setState(() => _currentIndex = index),
          height: 68,
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home), label: 'Home'),
            NavigationDestination(
              icon: Icon(Icons.directions_car),
              label: 'Vehicle',
            ),
            NavigationDestination(icon: Icon(Icons.person), label: 'Profile'),
          ],
        ),
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
      color: kCardAlt,
      borderRadius: BorderRadius.circular(kRadius),
      border: Border.all(color: kDivider),
    ),
    alignment: Alignment.center,
    child: Text(
      shortName,
      style: mono(fontSize: 15, color: kAccent, letterSpacing: 0.8),
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

  final _searchCtrl = TextEditingController();
  String _query = '';

  /// Ids of locations already on the home page (kept in sync by the stream).
  Set<String> _addedIds = const {};

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  void _showAddSpaceDialog() {
    final notAdded = [
      for (final c in _availableCampuses)
        if (!_addedIds.contains(c['id'])) c,
    ];
    showAppDialog(
      context: context,
      barrierDismissible: true,
      builder: (_) => _SelectLocationDialog(
        campuses: notAdded,
        onAdd: _addCampus,
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
          _addedIds = const {};
          return AnimatedAddCard(
            title: 'No Locations Found',
            subtitle: 'Tap to add a new location',
            onTap: _showAddSpaceDialog,
          );
        }

        final locations = <String, Map<String, dynamic>>{
          for (final entry in rawData.entries)
            if (entry.value is Map)
              entry.key.toString():
                  Map<String, dynamic>.from(entry.value as Map),
        };
        _addedIds = locations.keys.toSet();
        final visible = locations.entries
            .where((e) => matchesLocationQuery(e.value, _query))
            .toList();

        return _ListWithBottomAction(
          actionTitle: 'Add more locations',
          actionIcon: Icons.add_location_alt_outlined,
          onAction: _showAddSpaceDialog,
          children: [
            AppTextField(
              controller: _searchCtrl,
              hintText: 'Search your locations',
              icon: Icons.search,
              onChanged: (v) => setState(() => _query = v),
            ),
            const SizedBox(height: 16),
            for (final e in visible) _buildLocationCard(uid, e.key, e.value),
            if (visible.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Text(
                  'No saved locations match "${_query.trim()}".',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: kTextMuted, fontSize: 13),
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
      key: ValueKey('loc-$locKey'),
      padding: const EdgeInsets.only(bottom: 12.0),
      child: PressScale(
        child: InkWell(
        borderRadius: BorderRadius.circular(kRadius),
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const FauMapScreen()),
        ),
        child: Container(
          padding: const EdgeInsets.all(16.0),
          decoration: BoxDecoration(
            color: kCard,
            borderRadius: BorderRadius.circular(kRadius),
            border: Border.all(color: kDivider),
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
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: kText,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      address,
                      style: const TextStyle(fontSize: 12.5, color: kTextMuted),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.delete_outline, size: 20),
                color: kRed,
                tooltip: 'Remove Place',
                onPressed: () => FirebaseDatabase.instance
                    .ref('drivers/$uid/locations/$locKey')
                    .remove(),
              ),
            ],
          ),
        ),
      ),
      ),
    );
  }
}

/// Case-insensitive match on a location's short name, full name or address.
/// An empty query matches everything.
bool matchesLocationQuery(Map<String, dynamic> loc, String query) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return true;
  return ['shortName', 'fullName', 'address']
      .any((k) => (loc[k]?.toString().toLowerCase() ?? '').contains(q));
}

class _SelectLocationDialog extends StatefulWidget {
  /// Campuses not yet on the user's home page.
  final List<Map<String, String>> campuses;
  final void Function(Map<String, String> campus) onAdd;

  const _SelectLocationDialog({required this.campuses, required this.onAdd});

  @override
  State<_SelectLocationDialog> createState() => _SelectLocationDialogState();
}

class _SelectLocationDialogState extends State<_SelectLocationDialog> {
  final _searchCtrl = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final results = widget.campuses
        .where((c) => matchesLocationQuery(c, _query))
        .toList();

    final String? emptyText = widget.campuses.isEmpty
        ? 'All available locations are already on your home page.'
        : (results.isEmpty ? 'No locations match "${_query.trim()}".' : null);

    return Dialog(
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
                  onPressed: () => Navigator.of(context).pop(),
                ),
                Text('Select Location', style: mono(fontSize: 16)),
                const SizedBox(width: 48),
              ],
            ),
            const Divider(height: 24),
            AppTextField(
              controller: _searchCtrl,
              hintText: 'Search locations',
              icon: Icons.search,
              onChanged: (v) => setState(() => _query = v),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: emptyText != null
                  ? Padding(
                      padding: const EdgeInsets.only(top: 24),
                      child: Text(
                        emptyText,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: kTextMuted, fontSize: 13),
                      ),
                    )
                  : ListView.builder(
                      itemCount: results.length,
                      itemBuilder: (context, index) =>
                          _buildCampusRow(results[index]),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCampusRow(Map<String, String> campus) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12.0),
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: kBg,
        borderRadius: BorderRadius.circular(kRadius),
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
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: kText,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  campus['address']!,
                  style: const TextStyle(fontSize: 12, color: kTextMuted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
              widget.onAdd(campus);
            },
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            ),
            child: const Text('Add'),
          ),
        ],
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
  // Turn-by-turn camera, tuned to feel like Apple / Google Maps: course-up,
  // close-in street-level zoom, arrow in the lower part of the screen.
  // (Max map zoom is 20, see minMaxZoomPreference.)
  static const double _navZoom3D = 19.5;
  static const double _navZoom2D = 18.0;
  static const double _navTilt = 55.0;

  /// Arrow sits this far down the map (0 = top, 1 = bottom).
  static const double _navPuckY = 0.72;

  double get _navZoom => _is3D ? _navZoom3D : _navZoom2D;

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
  double _camBearing = 0;

  /// Height of the map area (below the app bar), set by the LayoutBuilder.
  double _mapHeight = 0;

  // ---- subscriptions ----
  StreamSubscription<geo.Position>? _positionSub;
  StreamSubscription<DatabaseEvent>? _parkingSub;
  StreamSubscription<CompassEvent>? _compassSub;
  Timer? _simTimer;

  // ---- smooth arrow + camera (live GPS and Simulate Run) ----
  // Positions arrive about once a second (GPS) or every 0.5 s (simulation).
  // The arrow glides from where it is to each new position over about the
  // time between positions. In focus mode the camera makes ONE linear ease per
  // position with the same timing, so arrow and camera stay locked together
  // while the map only gets about one camera command a second. (Moving the
  // camera every frame cancelled the user's drag and wheel-zoom gestures.)
  static const Duration _glideFrame = Duration(milliseconds: 33); // ~30 fps
  static const double _glideSnapMeters = 100; // bigger jumps don't animate
  Timer? _glideTimer;
  LatLng? _shownPos; // where the arrow is drawn; null = draw at _userPos
  LatLng? _glideFrom;
  LatLng? _glideTo;
  DateTime _glideStart = DateTime.fromMillisecondsSinceEpoch(0);
  Duration _glideDuration = Duration.zero;
  DateTime _lastFixAt = DateTime.fromMillisecondsSinceEpoch(0);
  int _glideFrameCount = 0;

  // ---- detecting the user moving the map in focus mode ----
  // The app always knows where its own camera should be: the target of an
  // instant move, or a point along a linear ease. If the map reports
  // anything else, the user dragged, zoomed, rotated or tilted it, so focus
  // mode turns off and the camera stays exactly where it is.
  /// Deliberate animations (focus-mode intro, 2D/3D switch) pause the check.
  DateTime _camAnimUntil = DateTime.fromMillisecondsSinceEpoch(0);
  LatLng? _cmdTarget; // where the latest camera command ends up
  double _cmdBearing = 0;
  // The command before that: a camera report can arrive just after the next
  // command was sent, so matching it also counts as "ours".
  LatLng? _prevCmdTarget;
  double _prevCmdBearing = 0;
  // Start of the current linear ease (null = instant move, no ease).
  LatLng? _easeFrom;
  double _easeFromBearing = 0;
  DateTime _easeStart = DateTime.fromMillisecondsSinceEpoch(0);
  Duration _easeDuration = Duration.zero;

  /// The "arrow low on screen" padding stays on after focus mode ends, so the
  /// view doesn't jump; it is removed right before the next app animation.
  bool _navPaddingOn = false;

  void _setCameraCommand(
    LatLng target,
    double bearing, {
    LatLng? easeFrom,
    double easeFromBearing = 0,
    Duration easeDuration = Duration.zero,
  }) {
    _prevCmdTarget = _cmdTarget;
    _prevCmdBearing = _cmdBearing;
    _cmdTarget = target;
    _cmdBearing = bearing;
    _easeFrom = easeFrom;
    _easeFromBearing = easeFromBearing;
    _easeStart = DateTime.now();
    _easeDuration = easeDuration;
  }

  /// 0..1 progress of the current ease (1 when there is none).
  double get _easeT {
    if (_easeFrom == null || _easeDuration == Duration.zero) return 1;
    final elapsed = DateTime.now().difference(_easeStart).inMilliseconds;
    return (elapsed / _easeDuration.inMilliseconds).clamp(0.0, 1.0);
  }

  /// Where the app's camera should be right now.
  LatLng? _expectedCamTarget() {
    final cmd = _cmdTarget;
    final from = _easeFrom;
    if (cmd == null || from == null) return cmd;
    return Geo.lerp(from, cmd, _easeT);
  }

  double _expectedCamBearing() {
    if (_easeFrom == null) return _cmdBearing;
    final d = Geo.shortestAngle(_easeFromBearing, _cmdBearing);
    return (_easeFromBearing + d * _easeT) % 360;
  }

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
    _searchFocus.addListener(_onSearchFocusChanged);
    _startLiveLocationTracking();
    _startCompassTracking();
    _listenToFirebaseParking();
  }

  @override
  void dispose() {
    _simTimer?.cancel();
    _glideTimer?.cancel();
    _positionSub?.cancel();
    _compassSub?.cancel();
    _parkingSub?.cancel();
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
    await safe(
      'lot labels',
      () => m.addSymbolLayer(
        _srcLots,
        'sc-lots-label',
        const SymbolLayerProperties(
          textField: ['get', 'label'],
          textFont: _fonts,
          textSize: ['case', isBestLot, 13, 11],
          textColor: ['get', 'color'],
          textHaloColor: '#000000',
          textHaloWidth: 1.8,
          textJustify: 'center',
          textAnchor: 'top',
          textOffset: [0, 0.9],
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

    _liveLots.forEach((id, lot) {
      final isBest = id == bestId;
      labels.add(_pointFeature(lot['position'] as LatLng, {
        'label': '${lot['name']}\n${lot['status']}',
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
        for (final b in _campusBuildings)
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
  }

  void _pushPuck() {
    final p = _shownPos ?? _userPos;
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
    // Outside focus mode, drop the leftover "arrow low" padding first; the
    // animation that follows hides the shift.
    if (!_navTracking) _clearNavPadding();
    // Don't mistake our own animation for the user moving the map, and keep
    // focus-mode camera updates from cutting it off.
    _camAnimUntil = DateTime.now().add(d + const Duration(milliseconds: 150));
    _setCameraCommand(p.target, p.bearing);
    _guard(() => m.animateCamera(CameraUpdate.newCameraPosition(p), duration: d));
  }

  /// Called for every camera change. In focus mode, a camera that isn't where
  /// the app put it means the user dragged, zoomed, rotated or tilted the map,
  /// so focus mode switches off and leaves the camera where they put it.
  void _onCameraMove(CameraPosition cam) {
    if (!_navTracking) return;
    if (DateTime.now().isBefore(_camAnimUntil)) return;
    final expected = _expectedCamTarget();
    if (expected == null) return;

    bool near(LatLng? target, double bearing) =>
        target != null &&
        Geo.meters(cam.target, target) <= 2.0 &&
        Geo.shortestAngle(cam.bearing, bearing).abs() <= 4;

    // The app never changes zoom or tilt in focus mode outside the paused
    // animations, so any change at all there is the user (catches the very
    // first frame of a mouse-wheel zoom).
    final zoomOrTilt = (cam.zoom - _navZoom).abs() > 0.01 ||
        (cam.tilt - (_is3D ? _navTilt : 0)).abs() > 0.5;
    final positionOk = near(expected, _expectedCamBearing()) ||
        near(_cmdTarget, _cmdBearing) ||
        near(_prevCmdTarget, _prevCmdBearing);
    if (zoomOrTilt || !positionOk) _setNavTracking(false, userGesture: true);
  }

  /// Direction the nav camera should face: exactly where the car's arrow
  /// points (the road segment it is on, or the GPS/compass heading off-route),
  /// so the arrow always points straight up and the camera turns only as
  /// much as the car does.
  double _navCameraBearing() => _puckBearing();

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
  /// and angle and simply stops following the arrow. [userGesture] means the
  /// user is dragging/zooming right now, so the app must not touch the camera
  /// at all (any camera call would cancel their gesture). Otherwise an ease
  /// that is still running is stopped where it is.
  Future<void> _setNavTracking(bool on, {bool userGesture = false}) async {
    final pos = _shownPos ?? _userPos;
    final m = _map;
    if (_navTracking == on) return;
    setState(() => _navTracking = on);
    if (m == null) return;

    if (!on) {
      final cam = m.cameraPosition;
      if (!userGesture && _easeT < 1 && cam != null) {
        // Freeze the camera exactly where it is now.
        _guard(() => m.moveCamera(CameraUpdate.newCameraPosition(cam)));
      }
      _easeFrom = null;
      return;
    }

    if (pos == null) return;
    final bearing = _navCameraBearing();
    _camBearing = bearing;
    // The padding shift below also reports a camera move; ignore it.
    _camAnimUntil = DateTime.now().add(const Duration(seconds: 1));
    _cmdTarget = null;
    _prevCmdTarget = null;
    _easeFrom = null;
    await _applyNavPadding(m);
    if (!mounted || !_navTracking) return;
    _animateTo(
      CameraPosition(
        target: pos,
        zoom: _navZoom,
        bearing: bearing,
        tilt: _is3D ? _navTilt : 0,
      ),
      const Duration(milliseconds: 800),
    );
  }

  void _toggle3D() {
    final m = _map;
    setState(() => _is3D = !_is3D);
    if (m == null) return;
    final pos = _userPos;
    if (_navTracking && pos != null) {
      // Navigating: switch zoom and tilt together, keep facing the route.
      _animateTo(
        CameraPosition(
          target: pos,
          zoom: _navZoom,
          bearing: _camBearing,
          tilt: _is3D ? _navTilt : 0,
        ),
        const Duration(milliseconds: 700),
      );
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
        // On a route the camera stays course-up; the compass only steers it
        // when there is no route to follow.
        _refreshNavCamera(const Duration(milliseconds: 300));
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

    if (wasTracking && !onCampus) {
      _setNavTracking(false);
    }
    _startGlide(loc); // moves the arrow (and nav camera) smoothly to the fix

    if (progress == _Progress.arrived) _onArrived();
    if (progress == _Progress.offRoute &&
        p.accuracy <= _maxGpsAccuracyForReroute) {
      _maybeReroute();
    }
  }

  /// Starts (or retargets) the arrow glide toward a new position (a GPS fix,
  /// or the next simulated position). In focus mode the camera eases along
  /// with it over the same time.
  void _startGlide(LatLng target) {
    final now = DateTime.now();
    final from = _shownPos ?? _userPos;
    final sinceLastFix = now.difference(_lastFixAt);
    _lastFixAt = now;

    // First fix, or a jump too big to be driving: just place the arrow.
    if (from == null || Geo.meters(from, target) > _glideSnapMeters) {
      _stopGlide();
      _pushPuck();
      _pushRoute();
      if (_navTracking) _jumpNavCamera(target);
      return;
    }

    _glideFrom = from;
    _glideTo = target;
    _glideStart = now;
    // Glide for about as long as fixes are arriving, so the arrow is still
    // moving when the next one lands instead of stopping and restarting.
    final ms = sinceLastFix.inMilliseconds.clamp(300, 1500);
    _glideDuration = Duration(milliseconds: ms);
    _glideTimer ??= Timer.periodic(_glideFrame, (_) => _glideStep());
    if (_navTracking) _easeNavCamera(target, _glideDuration);
  }

  void _glideStep() {
    final from = _glideFrom;
    final to = _glideTo;
    if (!mounted || from == null || to == null) {
      _stopGlide();
      return;
    }
    final elapsed = DateTime.now().difference(_glideStart).inMilliseconds;
    final t = (elapsed / _glideDuration.inMilliseconds).clamp(0.0, 1.0);
    final pos = Geo.lerp(from, to, t);
    _shownPos = pos;
    _glideFrameCount++;

    // Keep the route line attached to the arrow instead of the latest fix.
    if (_displayRoute.length >= 2) {
      _displayRoute = [pos, ..._displayRoute.skip(1)];
      if (_glideFrameCount % 3 == 0 || t >= 1) _pushRoute(); // ~10 Hz
    }
    _pushPuck(); // the camera is already easing along on its own

    if (t >= 1) {
      _glideTimer?.cancel();
      _glideTimer = null;
    }
  }

  /// Cancels any glide and draws the arrow at the real position again.
  void _stopGlide() {
    _glideTimer?.cancel();
    _glideTimer = null;
    _glideFrom = null;
    _glideTo = null;
    _shownPos = null;
  }

  CameraPosition _navCamera(LatLng target, double bearing) => CameraPosition(
        target: target,
        zoom: _navZoom,
        bearing: bearing,
        tilt: _is3D ? _navTilt : 0,
      );

  /// Focus mode: ease the camera linearly to [target] over [d], facing the
  /// car's direction. One call per position; the map animates it smoothly.
  void _easeNavCamera(LatLng target, Duration d) {
    final m = _map;
    if (m == null || !_navTracking) return;
    // Let a deliberate animation (intro, 2D/3D) finish first.
    if (DateTime.now().isBefore(_camAnimUntil)) return;
    final fromTarget = _expectedCamTarget() ?? target;
    final fromBearing = _expectedCamBearing();
    final bearing = _navCameraBearing();
    _camBearing = bearing;
    _setCameraCommand(
      target,
      bearing,
      easeFrom: fromTarget,
      easeFromBearing: fromBearing,
      easeDuration: d,
    );
    _guard(() => m.easeCamera(
          CameraUpdate.newCameraPosition(_navCamera(target, bearing)),
          duration: d,
          interpolation: CameraAnimationInterpolation.linear,
        ));
  }

  /// Focus mode: move the camera instantly (used after a big position jump).
  void _jumpNavCamera(LatLng target) {
    final m = _map;
    if (m == null || !_navTracking) return;
    if (DateTime.now().isBefore(_camAnimUntil)) return;
    final bearing = _navCameraBearing();
    _camBearing = bearing;
    _setCameraCommand(target, bearing);
    _guard(() => m.moveCamera(
          CameraUpdate.newCameraPosition(_navCamera(target, bearing)),
        ));
  }

  /// Focus mode: re-aim the camera when the direction changes without a new
  /// position (compass turn, new route). If the arrow is mid-glide, the
  /// camera keeps travelling with it to the glide's end on the same timing.
  void _refreshNavCamera(Duration whenStill) {
    final glideTo = _glideTo;
    if (_glideTimer != null && glideTo != null) {
      final left = _glideDuration - DateTime.now().difference(_glideStart);
      _easeNavCamera(
        glideTo,
        left > const Duration(milliseconds: 50)
            ? left
            : const Duration(milliseconds: 50),
      );
      return;
    }
    final pos = _shownPos ?? _userPos;
    if (pos != null) _easeNavCamera(pos, whenStill);
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
      // Same thresholds as the dashboard's lot bars (Overview.jsx).
      final Color color;
      if (total == 0) {
        color = kTextMuted;
      } else if (ratio >= 0.90) {
        color = kRed;
      } else if (ratio >= 0.70) {
        color = kAmber;
      } else {
        color = kOpen;
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

    // Already navigating: turn the camera to face the new route right away.
    final pos = _userPos;
    if (_navTracking && pos != null) {
      setState(() => _updateRouteProgress(pos));
      _refreshNavCamera(const Duration(milliseconds: 600));
    }
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
    _searchCtrl.text = building.name; // also covers picks made by map tap
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
      _clearNavPadding();
      _guard(() => m.animateCamera(
            CameraUpdate.newLatLngZoom(building.position, 17.0),
            duration: const Duration(milliseconds: 900),
          ));
    }
  }

  void _clearDestination() {
    _stopSimulation();
    _routeRequestId++; // cancel any in-flight route request
    _searchCtrl.clear();
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
    _stopGlide();
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
    _routeSeg = seg;
    _heading = bearing;
    _distToRoute = 0;
    _displayRoute = [cur, ...route.sublist(seg + 1)];
    _routeRemaining = Geo.meters(cur, route[seg + 1]) + _routeSuffix[seg + 1];

    if (_simTickCount % 5 == 0) {
      setState(() => _gpsStatus = 'Simulating 20 mph (${bearing.round()}°)');
    }

    // Feed the simulated car through the same glide as live GPS (a "fix"
    // every 0.5 s): the arrow, the route line and the focus-mode camera all
    // move exactly as they do when driving for real.
    if (_simTickCount % 10 == 1) _startGlide(cur);
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

  // ---- destination search ----

  /// The suggestion panel is tall enough for this many rows; any more are
  /// reached by scrolling inside the panel.
  static const int _maxVisibleSuggestions = 5;
  static const double _suggestionRowHeight = 58;

  /// Every building in random order, shown while the box is empty
  /// (reshuffled each time the search opens).
  List<FauBuilding> _randomPicks = const [];
  DateTime _searchOpenedAt = DateTime.fromMillisecondsSinceEpoch(0);

  void _onSearchFocusChanged() {
    if (!mounted) return;
    setState(() {
      if (_searchFocus.hasFocus) {
        _searchOpenedAt = DateTime.now();
        _randomPicks = List<FauBuilding>.of(_campusBuildings)..shuffle();
        // Show fresh suggestions; typing replaces the selected name.
        _searchQuery = '';
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

  void _pickSuggestion(FauBuilding building) {
    _onBuildingSelected(building); // first, so unfocus shows the new name
    _searchFocus.unfocus();
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
            const Text('FAU Campus Map'),
            Text(
              navActive
                  ? 'Navigation Mode Active (${_heading.round()}°)'
                  : (_devMode ? 'Dev Mode Active' : 'Boca Raton Main Campus'),
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
          if (onCampus)
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
            tooltip: 'Reset Campus View',
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
                return _buildMap();
              },
            ),
          ),
          if (_devMode) _buildDevTapBadge(),
          if (_devMode && _selectedBuilding != null)
            _buildDevControls(onCampus, bottomInset),
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
        trackCameraPosition: true, // needed for onCameraMove
        onCameraMove: _onCameraMove,
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

    final List<FauBuilding> suggestions;
    if (_searchQuery.trim().isEmpty) {
      suggestions = _randomPicks;
    } else {
      final q = _searchQuery.trim().toLowerCase();
      suggestions = _campusBuildings
          .where((b) =>
              b.code.toLowerCase().contains(q) ||
              b.name.toLowerCase().contains(q))
          .toList();
    }
    final scrolls = suggestions.length > _maxVisibleSuggestions;

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
      child: TextFieldTapRegion(
        // Slides down into place when the map opens.
        child: FadeSlideIn(
        offsetY: -14,
        child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            decoration: BoxDecoration(
              color: kCard,
              borderRadius: BorderRadius.circular(kRadius),
              border: Border.all(
                color: (focused || selected != null) ? kAccent : kDivider,
              ),
              boxShadow: shadow,
            ),
            child: TextField(
              controller: _searchCtrl,
              focusNode: _searchFocus,
              cursorColor: kAccent,
              textAlignVertical: TextAlignVertical.center,
              textInputAction: TextInputAction.search,
              style: const TextStyle(
                color: kText,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
              onChanged: (v) => setState(() => _searchQuery = v),
              onSubmitted: (_) {
                if (suggestions.isNotEmpty) _pickSuggestion(suggestions.first);
              },
              decoration: InputDecoration(
                border: InputBorder.none,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 15),
                hintText: 'Search for destination...',
                hintStyle: const TextStyle(color: kTextMuted, fontSize: 14),
                prefixIcon: Icon(
                  Icons.search,
                  color: (focused || selected != null) ? kAccent : kTextMuted,
                ),
                suffixIcon: (hasText || selected != null)
                    ? IconButton(
                        icon: const Icon(Icons.cancel, size: 20),
                        color: kTextMuted,
                        tooltip: 'Clear',
                        onPressed: () {
                          _searchCtrl.clear();
                          setState(() => _searchQuery = '');
                          if (selected != null) _clearDestination();
                        },
                      )
                    : null,
              ),
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
                    child: AnimatedSize(
                      duration: kMotion,
                      curve: kEaseOut,
                      alignment: Alignment.topCenter,
                      child: suggestions.isEmpty
                          ? Padding(
                              padding: const EdgeInsets.all(16),
                              child: Text(
                                'No buildings match "${_searchQuery.trim()}".',
                                style: const TextStyle(
                                  color: kTextMuted,
                                  fontSize: 13,
                                ),
                              ),
                            )
                          // At most 5 rows tall; more scroll smoothly inside.
                          : ConstrainedBox(
                              constraints: const BoxConstraints(
                                maxHeight: _suggestionRowHeight *
                                        _maxVisibleSuggestions +
                                    (_maxVisibleSuggestions - 1),
                              ),
                              child: StaggerScope(
                                openedAt: _searchOpenedAt,
                                child: SmoothScroll(
                                  fade: scrolls ? 14 : 0,
                                  alwaysShowThumb: scrolls,
                                  child: ListView.separated(
                                    shrinkWrap: true,
                                    physics: scrolls
                                        ? kScrollPhysics
                                        : const NeverScrollableScrollPhysics(),
                                    padding: EdgeInsets.zero,
                                    itemCount: suggestions.length,
                                    separatorBuilder: (_, _) =>
                                        const Divider(height: 1),
                                    itemBuilder: (context, i) => FadeSlideIn(
                                      key: ValueKey('sug-${suggestions[i].id}'),
                                      index: i,
                                      offsetY: -8,
                                      duration: kMotion,
                                      child: _buildSuggestionRow(suggestions[i]),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                    ),
                  ),
          ),
        ],
      ),
      ),
      ),
    );
  }

  Widget _buildSuggestionRow(FauBuilding bldg) {
    final best = CampusPathfinder.findBestAvailableRoute(
      buildingPos: bldg.position,
      lots: _liveLots,
    );
    final lot = best != null ? _liveLots[best.lotId] : null;
    final free =
        lot == null ? 0 : (lot['capacity'] as int) - (lot['occupied'] as int);

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
                        ? 'Best lot: ${lot['name']} ($free free, ${formatDistance(best!.totalDistanceMeters)} walk)'
                        : (_liveLots.isEmpty
                            ? 'Loading parking data...'
                            : 'All nearby lots full'),
                    style: const TextStyle(color: kTextMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
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
    return Positioned(
      right: 20,
      bottom: 105 + bottomInset,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
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
                      label: const Text('Travel to FAU'),
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
    final String phase; // kind of message; the subtitle animates when it changes

    if (building == null) {
      title = 'FAU Boca Raton Main Campus';
      subtitle = _userPos == null
          ? _gpsStatus
          : (onCampus
              ? 'On Campus • Heading: ${_heading.round()}°'
              : 'Outside Campus Area');
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
      final free = lot == null
          ? 0
          : (lot['capacity'] as int) - (lot['occupied'] as int);
      title = 'Best Lot: ${lot?['name'] ?? walk.lotId} ($free free)';
      final walkText = formatDistance(walk.totalDistanceMeters);
      if (_arrived) {
        subtitle = 'Arrived • $walkText walk to ${building.code}';
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

    return Positioned(
      bottom: 24 + bottomInset,
      left: 20,
      right: 20,
      child: FadeSlideIn(
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
                                subtitle,
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
    showAppDialog(
      context: context,
      barrierDismissible: true,
      builder: (_) => const _VehicleFormDialog(),
    );
  }

  void _showVehicleDetails(Map<String, dynamic> data, String key) {
    showAppDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Row(
          children: [
            const Icon(Icons.directions_car, color: kAccent),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                '${data['model'] ?? 'Vehicle'}',
                style: mono(fontSize: 17),
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
            style: TextButton.styleFrom(foregroundColor: kRed),
            child: const Text('Delete Vehicle'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(),
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
              style: const TextStyle(color: kRed),
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

        return _ListWithBottomAction(
          actionTitle: 'Add more vehicle',
          actionIcon: Icons.add,
          onAction: _openAddVehicleDialog,
          children: [
            for (final entry in rawData.entries)
              if (entry.value is Map)
                _buildVehicleCard(
                  entry.key.toString(),
                  Map<String, dynamic>.from(entry.value as Map),
                ),
          ],
        );
      },
    );
  }

  /// Same layout as the profile cards: avatar + title row, then detail rows.
  Widget _buildVehicleCard(String key, Map<String, dynamic> data) {
    String field(String k) {
      final v = data[k]?.toString().trim() ?? '';
      return v.isEmpty ? 'N/A' : v;
    }

    final manufacturer = data['manufacturer']?.toString().trim() ?? '';
    final model = data['model']?.toString().trim() ?? '';
    final title = [manufacturer, model].where((s) => s.isNotEmpty).join(' ');

    return Padding(
      key: ValueKey('veh-$key'),
      padding: const EdgeInsets.only(bottom: 12.0),
      child: PressScale(
        child: InkWell(
        borderRadius: BorderRadius.circular(kRadius),
        onTap: () => _showVehicleDetails(data, key),
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: kCard,
            borderRadius: BorderRadius.circular(kRadius),
            border: Border.all(color: kDivider),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  const CircleAvatar(
                    radius: 30,
                    backgroundColor: kNavBg,
                    child: Icon(Icons.directions_car, size: 32, color: kAccent),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title.isEmpty ? 'Unknown Vehicle' : title,
                          style: mono(fontSize: 17),
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          field('plate'),
                          style: mono(
                            fontSize: 13,
                            color: kAccent,
                            letterSpacing: 0.8,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const Divider(height: 28),
              DetailInfoRow(label: 'Model', value: field('model')),
              DetailInfoRow(label: 'Manufacturer', value: field('manufacturer')),
              DetailInfoRow(label: 'Year', value: field('year')),
              DetailInfoRow(label: 'Color', value: field('color')),
            ],
          ),
        ),
      ),
      ),
    );
  }
}

/// Smooth-scrolling list of cards followed by a compact, centred action
/// button. Shared by the Home, Vehicle and Profile tabs.
class _ListWithBottomAction extends StatefulWidget {
  final List<Widget> children;
  final String actionTitle;
  final IconData actionIcon;
  final VoidCallback onAction;

  const _ListWithBottomAction({
    required this.children,
    required this.actionTitle,
    required this.actionIcon,
    required this.onAction,
  });

  @override
  State<_ListWithBottomAction> createState() => _ListWithBottomActionState();
}

class _ListWithBottomActionState extends State<_ListWithBottomAction> {
  final DateTime _openedAt = DateTime.now();

  @override
  Widget build(BuildContext context) {
    final children = widget.children;
    // Rows rise in one after another when the tab opens; rows further down
    // reveal themselves as they scroll into view (ListView builds lazily).
    // Keyed rows keep their state, so only newly shown rows animate.
    return SafeArea(
      child: StaggerScope(
        openedAt: _openedAt,
        child: SmoothScroll(
          child: ListView(
            physics: kScrollPhysics,
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
            children: [
              for (var i = 0; i < children.length; i++)
                FadeSlideIn(key: children[i].key, index: i, child: children[i]),
              const SizedBox(height: 8),
              FadeSlideIn(
                index: children.length,
                child: PrimaryButton(
                  title: widget.actionTitle,
                  icon: widget.actionIcon,
                  onPressed: widget.onAction,
                  compact: true,
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
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Add New Vehicle', style: mono(fontSize: 17)),
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
              minimumSize: const Size.fromHeight(40),
            ),
            child: const Text('Cancel'),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: ElevatedButton(
            onPressed: onConfirm,
            style: ElevatedButton.styleFrom(
              minimumSize: const Size.fromHeight(40),
            ),
            child: const Text('Confirm'),
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
    showAppDialog(
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

        return _ListWithBottomAction(
          actionTitle: 'Edit Information',
          actionIcon: Icons.edit_outlined,
          onAction: () => _openContactDialog(data: data),
          children: [
                    Container(
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: kCard,
                        borderRadius: BorderRadius.circular(kRadius),
                        border: Border.all(color: kDivider),
                      ),
                      child: Row(
                        children: [
                          const CircleAvatar(
                            radius: 34,
                            backgroundColor: kNavBg,
                            child: Icon(Icons.person, size: 38, color: kAccent),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(fullName, style: mono(fontSize: 18)),
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
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: kCard,
                        borderRadius: BorderRadius.circular(kRadius),
                        border: Border.all(color: kDivider),
                      ),
                      child: Column(
                        children: [
                          DetailInfoRow(
                            label: 'Phone Number',
                            // Older saves were plain digits; show them
                            // with dashes too.
                            value: data['phone'] == null
                                ? 'N/A'
                                : formatPhone(data['phone'].toString()),
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
                    const SizedBox(height: 12),
          ],
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
    _phoneCtrl = TextEditingController(text: formatPhone(v('phone')));
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
    if (_phoneCtrl.text.replaceAll(RegExp(r'\D'), '').length != 10) {
      showErrorSnackBar(context, 'Please enter a 10-digit phone number.');
      return;
    }

    Navigator.of(context).pop();

    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid != null) {
      FirebaseDatabase.instance.ref('drivers/$uid/profile').update({
        'firstName': _firstCtrl.text.trim(),
        'lastName': _lastCtrl.text.trim(),
        'middleName': _middleCtrl.text.trim(),
        'phone': formatPhone(_phoneCtrl.text), // saved as xxx-xxx-xxxx
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
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 500),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20.0),
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
                    style: mono(fontSize: 17),
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
                hintText: 'Phone Number * (xxx-xxx-xxxx)',
                icon: Icons.phone_outlined,
                keyboardType: TextInputType.phone,
                inputFormatters: [PhoneInputFormatter()],
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: kCard,
                  borderRadius: BorderRadius.circular(kRadius),
                  border: Border.all(color: kDivider),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _gender,
                    isExpanded: true,
                    hint: const Row(
                      children: [
                        Icon(Icons.transgender, color: kTextMuted, size: 20),
                        SizedBox(width: 12),
                        Text(
                          'Gender *',
                          style: TextStyle(color: kTextMuted, fontSize: 14),
                        ),
                      ],
                    ),
                    dropdownColor: kCard,
                    borderRadius: BorderRadius.circular(kRadius),
                    icon: const Icon(Icons.arrow_drop_down, color: kTextMuted),
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
// MOTION — mirrors the admin dashboard (motion.js / index.css):
// staggered fade-up entrances, press feedback, live pulse, flashes.
// Everything honours the OS "reduce motion" setting.
// ==========================================

const Duration kMotionFast = Duration(milliseconds: 160);
const Duration kMotion = Duration(milliseconds: 280);
const Duration kMotionSlow = Duration(milliseconds: 450);
const Curve kEaseOut = Curves.easeOutCubic;

/// True when the user asked the OS to reduce motion.
bool reduceMotion(BuildContext context) =>
    MediaQuery.maybeDisableAnimationsOf(context) ?? false;

/// Fades and rises its child into place once, like the dashboard's
/// `.sws-enter`. [index] staggers siblings (each one starts a bit later).
class FadeSlideIn extends StatefulWidget {
  final Widget child;
  final int index;
  final double offsetY; // start this many px lower (negative = higher)
  final Duration duration;

  const FadeSlideIn({
    super.key,
    required this.child,
    this.index = 0,
    this.offsetY = 14,
    this.duration = kMotionSlow,
  });

  @override
  State<FadeSlideIn> createState() => _FadeSlideInState();
}

class _FadeSlideInState extends State<FadeSlideIn>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: widget.duration);
  late final Animation<double> _t = CurvedAnimation(parent: _c, curve: kEaseOut);
  Timer? _delay;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_c.status != AnimationStatus.dismissed || _delay != null) return;
    if (reduceMotion(context)) {
      _c.value = 1;
      return;
    }
    // Stagger only during a list's opening moment. Items revealed later by
    // scrolling animate straight away instead of waiting their turn.
    final scope = StaggerScope.maybeOf(context);
    final opening = scope == null || scope.isOpening;
    final ms = opening ? 45 * widget.index.clamp(0, 8) : 0;
    _delay = Timer(Duration(milliseconds: ms), () {
      if (mounted) _c.forward();
    });
  }

  @override
  void dispose() {
    _delay?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _t,
      child: widget.child,
      builder: (context, child) => Opacity(
        opacity: _t.value,
        child: Transform.translate(
          offset: Offset(0, widget.offsetY * (1 - _t.value)),
          child: child,
        ),
      ),
    );
  }
}

/// Marks when a list first appeared, so [FadeSlideIn] can tell the opening
/// stagger apart from items that scroll into view later.
class StaggerScope extends InheritedWidget {
  final DateTime openedAt;

  const StaggerScope({super.key, required this.openedAt, required super.child});

  bool get isOpening =>
      DateTime.now().difference(openedAt) < const Duration(milliseconds: 700);

  static StaggerScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<StaggerScope>();

  @override
  bool updateShouldNotify(StaggerScope old) => old.openedAt != openedAt;
}

/// Smooth, springy scrolling (iOS-style bounce on every platform), always
/// scrollable so the bounce works even when the content fits.
const ScrollPhysics kScrollPhysics = BouncingScrollPhysics(
  parent: AlwaysScrollableScrollPhysics(),
  decelerationRate: ScrollDecelerationRate.fast,
);

/// Polished scroll container: slim themed scrollbar plus soft fades at the
/// top and bottom edges so content melts away instead of being cut off.
class SmoothScroll extends StatelessWidget {
  final Widget child; // a scroll view
  final double fade;
  final bool alwaysShowThumb;

  const SmoothScroll({
    super.key,
    required this.child,
    this.fade = 18,
    this.alwaysShowThumb = false,
  });

  @override
  Widget build(BuildContext context) {
    return Scrollbar(
      thumbVisibility: alwaysShowThumb,
      child: ShaderMask(
        blendMode: BlendMode.dstIn,
        shaderCallback: (rect) {
          final f = rect.height <= 0 ? 0.0 : (fade / rect.height).clamp(0.0, 0.5);
          return LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: const [
              Colors.transparent,
              Colors.black,
              Colors.black,
              Colors.transparent,
            ],
            stops: [0, f, 1 - f, 1],
          ).createShader(rect);
        },
        child: child,
      ),
    );
  }
}

/// Lets mouse and trackpad drag-scroll lists too (handy on web/desktop).
class AppScrollBehavior extends MaterialScrollBehavior {
  const AppScrollBehavior();

  @override
  Set<ui.PointerDeviceKind> get dragDevices =>
      ui.PointerDeviceKind.values.toSet();
}

/// Shrinks its child slightly while pressed (tactile feedback). It only
/// listens to the pointer, so taps still reach the InkWell/button inside.
class PressScale extends StatefulWidget {
  final Widget child;
  final double pressedScale;

  const PressScale({super.key, required this.child, this.pressedScale = 0.97});

  @override
  State<PressScale> createState() => _PressScaleState();
}

class _PressScaleState extends State<PressScale> {
  bool _down = false;

  void _set(bool v) {
    if (_down != v) setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      onPointerDown: (_) => _set(true),
      onPointerUp: (_) => _set(false),
      onPointerCancel: (_) => _set(false),
      child: AnimatedScale(
        scale: _down && !reduceMotion(context) ? widget.pressedScale : 1,
        duration: kMotionFast,
        curve: kEaseOut,
        child: widget.child,
      ),
    );
  }
}

/// Pulsing dot that signals live data (the dashboard's `.sws-live-dot`).
class LiveDot extends StatefulWidget {
  final Color color;
  final double size;

  const LiveDot({super.key, this.color = kOpen, this.size = 7});

  @override
  State<LiveDot> createState() => _LiveDotState();
}

class _LiveDotState extends State<LiveDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (reduceMotion(context)) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    return SizedBox(
      width: s * 2.6,
      height: s * 2.6,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final t = _c.value;
          return Stack(
            alignment: Alignment.center,
            children: [
              // Expanding, fading ring.
              Container(
                width: s * (1 + 1.6 * t),
                height: s * (1 + 1.6 * t),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: widget.color.withValues(alpha: 0.45 * (1 - t)),
                ),
              ),
              Container(
                width: s,
                height: s,
                decoration:
                    BoxDecoration(shape: BoxShape.circle, color: widget.color),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ==========================================
// CONNECTION QUALITY
// ==========================================

enum NetQuality { checking, good, unstable, bad, offline }

/// Watches the connection to the parking database and grades it.
///
/// Two signals: Firebase's own `.info/connected` flag (reacts the moment the
/// socket drops or comes back) and a tiny timed request every few seconds.
/// The last [_window] requests decide the grade:
///  * good     – median under 300 ms, nothing failed
///  * unstable – median 300–1000 ms, or one request failed
///  * bad      – median over 1000 ms, or two or more failed
///  * offline  – Firebase reports no connection, or every request failed
class ConnectionMonitor extends ChangeNotifier {
  static const Duration _interval = Duration(seconds: 5);
  static const Duration _timeout = Duration(seconds: 4);
  static const int _window = 4;

  final http.Client _client = http.Client(); // keep-alive: measures real RTT
  final List<int?> _samples = []; // ms per ping; null = failed
  StreamSubscription<DatabaseEvent>? _connSub;
  Timer? _timer;
  bool _firebaseConnected = true;
  bool _disposed = false;

  NetQuality quality = NetQuality.checking;
  int? latencyMs; // median of recent successful pings

  Uri get _pingUri {
    final base = DefaultFirebaseOptions.currentPlatform.databaseURL ??
        'https://smartcurb-d174e-default-rtdb.firebaseio.com';
    // A path that holds nothing: the reply is a few bytes either way.
    return Uri.parse('$base/_ping.json');
  }

  void start() {
    _connSub = FirebaseDatabase.instance
        .ref('.info/connected')
        .onValue
        .listen((e) {
      _firebaseConnected = e.snapshot.value == true;
      _grade();
      if (_firebaseConnected) _ping(); // re-measure right after reconnecting
    });
    _ping();
    _timer = Timer.periodic(_interval, (_) => _ping());
  }

  Future<void> _ping() async {
    final sw = Stopwatch()..start();
    int? ms;
    try {
      await _client.get(_pingUri).timeout(_timeout);
      ms = sw.elapsedMilliseconds;
    } catch (_) {
      ms = null; // timed out or no network
    }
    if (_disposed) return;
    _samples.add(ms);
    if (_samples.length > _window) _samples.removeAt(0);
    _grade();
  }

  void _grade() {
    if (_disposed) return;
    final ok = _samples.whereType<int>().toList()..sort();
    final failed = _samples.length - ok.length;
    latencyMs = ok.isEmpty ? null : ok[ok.length ~/ 2];

    final NetQuality q;
    if (!_firebaseConnected ||
        (_samples.isNotEmpty && ok.isEmpty && _samples.length >= 2)) {
      q = NetQuality.offline;
    } else if (_samples.isEmpty) {
      q = NetQuality.checking;
    } else if (failed >= 2 || (latencyMs ?? 99999) > 1000) {
      q = NetQuality.bad;
    } else if (failed == 1 || latencyMs! > 300) {
      q = NetQuality.unstable;
    } else {
      q = NetQuality.good;
    }
    quality = q;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _connSub?.cancel();
    _client.close();
    super.dispose();
  }
}

/// Wi-Fi style signal icon for the connection: green = good, amber =
/// unstable, red = bad, red "no wifi" = offline. Tap or hover for details.
/// It owns its own monitor, so it can be dropped anywhere.
class ConnectionIndicator extends StatefulWidget {
  final double size;

  const ConnectionIndicator({super.key, this.size = 16});

  @override
  State<ConnectionIndicator> createState() => _ConnectionIndicatorState();
}

class _ConnectionIndicatorState extends State<ConnectionIndicator> {
  final ConnectionMonitor _monitor = ConnectionMonitor();

  @override
  void initState() {
    super.initState();
    _monitor.start();
  }

  @override
  void dispose() {
    _monitor.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _monitor,
      builder: (context, _) {
        final q = _monitor.quality;
        final ms = _monitor.latencyMs;
        final (IconData icon, Color color, String label) = switch (q) {
          NetQuality.checking => (Icons.wifi, kTextMuted, 'Checking connection…'),
          NetQuality.good => (Icons.wifi, kOpen, 'Connection good'),
          NetQuality.unstable =>
            (Icons.wifi_2_bar, kAmber, 'Connection unstable'),
          NetQuality.bad => (Icons.wifi_1_bar, kRed, 'Connection poor'),
          NetQuality.offline => (Icons.wifi_off, kRed, 'Offline'),
        };
        final detail = (ms != null && q != NetQuality.offline)
            ? '$label · $ms ms'
            : label;

        return Tooltip(
          message: detail,
          triggerMode: TooltipTriggerMode.tap,
          child: Semantics(
            label: detail,
            child: AnimatedSwitcher(
              duration: kMotion,
              transitionBuilder: (child, anim) => FadeTransition(
                opacity: anim,
                child: ScaleTransition(scale: anim, child: child),
              ),
              child: Icon(
                icon,
                key: ValueKey(q),
                size: widget.size,
                color: color,
              ),
            ),
          ),
        );
      },
    );
  }
}

/// showDialog with a modern entrance: fade + gentle scale-up from 95%.
Future<T?> showAppDialog<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool barrierDismissible = true,
}) {
  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: barrierDismissible,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: Colors.black.withValues(alpha: 0.6),
    transitionDuration: reduceMotion(context) ? Duration.zero : kMotion,
    pageBuilder: (ctx, _, _) => builder(ctx),
    transitionBuilder: (ctx, anim, _, child) {
      final t = CurvedAnimation(
        parent: anim,
        curve: kEaseOut,
        reverseCurve: Curves.easeInCubic,
      );
      return FadeTransition(
        opacity: t,
        child: ScaleTransition(
          scale: Tween(begin: 0.95, end: 1.0).animate(t),
          child: child,
        ),
      );
    },
  );
}

/// Like IndexedStack (keeps every tab alive), but the newly selected tab
/// fades and rises in instead of appearing instantly.
class FadeIndexedStack extends StatefulWidget {
  final int index;
  final List<Widget> children;

  const FadeIndexedStack({
    super.key,
    required this.index,
    required this.children,
  });

  @override
  State<FadeIndexedStack> createState() => _FadeIndexedStackState();
}

class _FadeIndexedStackState extends State<FadeIndexedStack>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: kMotion, value: 1);
  late final Animation<double> _t = CurvedAnimation(parent: _c, curve: kEaseOut);

  @override
  void didUpdateWidget(FadeIndexedStack old) {
    super.didUpdateWidget(old);
    if (old.index != widget.index && !reduceMotion(context)) {
      _c.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _t,
      builder: (context, child) => Opacity(
        opacity: _t.value,
        child: Transform.translate(
          offset: Offset(0, 10 * (1 - _t.value)),
          child: child,
        ),
      ),
      child: IndexedStack(index: widget.index, children: widget.children),
    );
  }
}

/// Swaps text with a quick fade + slide whenever its content changes.
/// Pass [switchKey] to animate only when that changes (e.g. the kind of
/// message), so a value that updates every second just updates in place.
class AnimatedText extends StatelessWidget {
  final String text;
  final TextStyle? style;
  final TextOverflow? overflow;
  final Object? switchKey;

  const AnimatedText(
    this.text, {
    super.key,
    this.style,
    this.overflow,
    this.switchKey,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: kMotion,
      switchInCurve: kEaseOut,
      switchOutCurve: Curves.easeInCubic,
      layoutBuilder: (current, previous) => Stack(
        alignment: Alignment.centerLeft,
        children: [...previous, ?current],
      ),
      transitionBuilder: (child, anim) => FadeTransition(
        opacity: anim,
        child: SlideTransition(
          position: Tween(begin: const Offset(0, 0.35), end: Offset.zero)
              .animate(anim),
          child: child,
        ),
      ),
      child: Text(
        text,
        key: ValueKey(switchKey ?? text),
        style: style,
        overflow: overflow,
        maxLines: 1,
      ),
    );
  }
}

// ==========================================
// REUSABLE PRESENTATIONAL WIDGETS
// ==========================================

/// Formats a US phone number as xxx-xxx-xxxx. Partial numbers are formatted
/// as far as they go ("97170" -> "971-70"). Anything that isn't 1–10 digits
/// (e.g. an international number) is returned unchanged.
String formatPhone(String input) {
  final digits = input.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty || digits.length > 10) return input.trim();
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) {
    return '${digits.substring(0, 3)}-${digits.substring(3)}';
  }
  return '${digits.substring(0, 3)}-${digits.substring(3, 6)}-'
      '${digits.substring(6)}';
}

/// Live phone formatting while typing: digits only, at most 10, dashes added
/// automatically, and the cursor stays next to the digit you just typed.
class PhoneInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final capped = digits.length > 10 ? digits.substring(0, 10) : digits;
    final text = formatPhone(capped);

    // Where the cursor should land: after the same number of digits.
    final cursor = newValue.selection.end.clamp(0, newValue.text.length);
    final digitsBefore = newValue.text
        .substring(0, cursor)
        .replaceAll(RegExp(r'\D'), '')
        .length
        .clamp(0, capped.length);
    var offset = 0;
    var seen = 0;
    while (offset < text.length && seen < digitsBefore) {
      if (RegExp(r'\d').hasMatch(text[offset])) seen++;
      offset++;
    }
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: offset),
    );
  }
}

class AppTextField extends StatelessWidget {
  final TextEditingController controller;
  final String hintText;
  final IconData icon;
  final bool obscureText;
  final TextInputType keyboardType;
  final ValueChanged<String>? onChanged;
  final List<TextInputFormatter>? inputFormatters;

  const AppTextField({
    super.key,
    required this.controller,
    required this.hintText,
    required this.icon,
    this.obscureText = false,
    this.keyboardType = TextInputType.text,
    this.onChanged,
    this.inputFormatters,
  });

  @override
  Widget build(BuildContext context) {
    // Matches the dashboard inputs: 44px tall, panel fill, 1px line, 6px radius.
    // Height comes from the padding (14px text + 2×13px ≈ 44px), not a fixed
    // box, so the text stays vertically centred next to the icon.
    return Container(
      decoration: BoxDecoration(
        color: kCard,
        borderRadius: BorderRadius.circular(kRadius),
        border: Border.all(color: kDivider),
      ),
      child: TextField(
        controller: controller,
        obscureText: obscureText,
        keyboardType: keyboardType,
        inputFormatters: inputFormatters,
        onChanged: onChanged,
        cursorColor: kAccent,
        textAlignVertical: TextAlignVertical.center,
        style: const TextStyle(color: kText, fontSize: 14),
        decoration: InputDecoration(
          border: InputBorder.none,
          isDense: true,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
          hintText: hintText,
          hintStyle: const TextStyle(color: kTextMuted, fontSize: 14),
          prefixIcon: Icon(icon, color: kTextMuted, size: 18),
          // Default prefix box is 48×48, which made the field taller than
          // its text and pushed the text off-centre.
          prefixIconConstraints:
              const BoxConstraints(minWidth: 40, minHeight: 0),
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

  /// Compact: a smaller button sized to its label and centred, instead of
  /// full width (used under the card lists).
  final bool compact;

  const PrimaryButton({
    super.key,
    required this.title,
    required this.onPressed,
    this.isLoading = false,
    this.icon,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final button = PressScale(
      child: SizedBox(
        width: compact ? null : double.infinity,
        height: compact ? 38 : 46,
        child: ElevatedButton(
          onPressed: isLoading ? null : onPressed,
          style: ElevatedButton.styleFrom(
            disabledBackgroundColor: kAccent.withValues(alpha: 0.6),
            disabledForegroundColor: kOnAccent,
            padding: compact
                ? const EdgeInsets.symmetric(horizontal: 18)
                : null,
            textStyle: compact
                ? GoogleFonts.archivo(fontSize: 13, fontWeight: FontWeight.w600)
                : null,
          ),
          // Label and spinner cross-fade with a small scale.
          child: AnimatedSwitcher(
            duration: kMotionFast,
            transitionBuilder: (child, anim) => FadeTransition(
              opacity: anim,
              child: ScaleTransition(
                scale: Tween(begin: 0.8, end: 1.0).animate(anim),
                child: child,
              ),
            ),
            child: isLoading
                ? const SizedBox(
                    key: ValueKey('loading'),
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: kOnAccent,
                    ),
                  )
                : Row(
                    key: const ValueKey('label'),
                    mainAxisSize:
                        compact ? MainAxisSize.min : MainAxisSize.max,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (icon != null) ...[
                        Icon(icon, size: compact ? 16 : 18),
                        SizedBox(width: compact ? 6 : 8),
                      ],
                      Text(title),
                    ],
                  ),
          ),
        ),
      ),
    );
    return compact ? Center(child: button) : button;
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
          Text(label, style: const TextStyle(color: kTextMuted, fontSize: 13)),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: kText,
                fontWeight: FontWeight.w600,
                fontSize: 13.5,
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

class _AnimatedAddCardState extends State<AnimatedAddCard>
    with SingleTickerProviderStateMixin {
  bool _isPressed = false;

  /// Slow "breathing" of the + icon, inviting a tap.
  late final AnimationController _breath = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (reduceMotion(context)) {
      _breath.stop();
    } else if (!_breath.isAnimating) {
      _breath.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _breath.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: FadeSlideIn(
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
              // Flat panel; on press the border turns accent and an accent
              // ring flashes, like the dashboard's .sws-hover / .sws-flash.
              decoration: BoxDecoration(
                color: kCard,
                borderRadius: BorderRadius.circular(kRadius),
                border: Border.all(color: _isPressed ? kAccent : kDivider),
                boxShadow: [
                  BoxShadow(
                    color: kAccent.withValues(alpha: _isPressed ? 0.35 : 0),
                    spreadRadius: _isPressed ? 4 : 0,
                  ),
                ],
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  AnimatedBuilder(
                    animation: _breath,
                    builder: (context, child) {
                      final t = Curves.easeInOut.transform(_breath.value);
                      return Transform.scale(
                        scale: 1 + 0.06 * t,
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: kNavBg,
                            borderRadius: BorderRadius.circular(kRadius),
                            boxShadow: [
                              BoxShadow(
                                color: kAccent.withValues(alpha: 0.18 * t),
                                blurRadius: 18,
                                spreadRadius: 1,
                              ),
                            ],
                          ),
                          child: child,
                        ),
                      );
                    },
                    child: const Icon(Icons.add, size: 36, color: kAccent),
                  ),
                  const SizedBox(height: 18),
                  Text(widget.title, style: mono(fontSize: 16)),
                  const SizedBox(height: 6),
                  Text(
                    widget.subtitle,
                    style: const TextStyle(color: kTextMuted, fontSize: 12.5),
                  ),
                ],
              ),
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
    showAppDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Contact Us', style: mono(fontSize: 17)),
        content: SelectableText(
          kSupportEmail,
          style: mono(fontSize: 14, color: kAccent),
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
            child: const Text('Copy email'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            style: TextButton.styleFrom(foregroundColor: kTextMuted),
            child: const Text('Close'),
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
    const body = TextStyle(color: kNavText, height: 1.6, fontSize: 14.5);

    return Scaffold(
      appBar: AppBar(title: const Text('About App')),
      body: SingleChildScrollView(
        physics: kScrollPhysics,
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Logo on the left; app name and version on the right.
            FadeSlideIn(
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: Image.asset(
                      'assets/logo.png',
                      width: 76,
                      height: 76,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) =>
                          const Icon(Icons.radar, size: 60, color: kAccent),
                    ),
                  ),
                  const SizedBox(width: 18),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const _BrandTitle(fontSize: 28),
                        const SizedBox(height: 6),
                        Text(
                          'Version 1.0.8',
                          style: mono(
                            fontSize: 13,
                            color: kTextMuted,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            const FadeSlideIn(index: 1, child: Divider(color: kDivider)),
            const SizedBox(height: 20),
            const FadeSlideIn(
              index: 2,
              child: Text(
                'Smart Curb takes the guesswork out of campus parking. Smart '
                'curb sensors in each parking space report in real time '
                'whether the spot is free, so the app always knows how full '
                'every lot is.',
                style: body,
              ),
            ),
            const SizedBox(height: 14),
            const FadeSlideIn(
              index: 3,
              child: Text(
                'Choose the building you are heading to and Smart Curb finds '
                'the closest lot that still has space, measured by the real '
                'walking distance to your door. It then guides you there '
                'with live turn-by-turn navigation and shows how far you '
                'will walk once you park. If that lot fills up on the way, '
                'your route updates automatically.',
                style: body,
              ),
            ),
            const SizedBox(height: 14),
            const FadeSlideIn(
              index: 4,
              child: Text(
                'Keep your vehicles and contact details in one place, save '
                'the campuses you visit, and see every lot at a glance: '
                'green has plenty of space, amber is filling up and red is '
                'almost full.',
                style: body,
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
      // Dashboard errors are busy-red text, not a red block.
      content: Text(
        message,
        style: GoogleFonts.archivo(
          color: kRed,
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
  );
}