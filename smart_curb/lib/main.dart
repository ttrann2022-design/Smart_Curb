import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
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

const Color accentNeonDark = Color(0xFFC5E01A);
const Color accentNeonLight = Color(0xFF9EBA15);

final ThemeData darkTheme = ThemeData(
  brightness: Brightness.dark,
  primaryColor: accentNeonDark,
  scaffoldBackgroundColor: const Color(0xFF1A1D24),
  cardColor: const Color(0xFF282C35),
  dividerColor: Colors.white12,
  appBarTheme: const AppBarTheme(
    backgroundColor: Color(0xFF111318),
    elevation: 0,
    iconTheme: IconThemeData(color: Colors.white),
    titleTextStyle: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
  ),
  colorScheme: const ColorScheme.dark(
    primary: accentNeonDark,
    surface: Color(0xFF282C35),
    onSurface: Colors.white,
    onSurfaceVariant: Colors.white54,
  ),
  bottomNavigationBarTheme: const BottomNavigationBarThemeData(
    backgroundColor: Color(0xFF111318),
    selectedItemColor: accentNeonDark,
    unselectedItemColor: Colors.white54,
  ),
  useMaterial3: true,
);

final ThemeData lightTheme = ThemeData(
  brightness: Brightness.light,
  primaryColor: accentNeonLight,
  scaffoldBackgroundColor: const Color(0xFFF5F7FA),
  cardColor: Colors.white,
  dividerColor: Colors.black12,
  appBarTheme: const AppBarTheme(
    backgroundColor: Colors.white,
    elevation: 0,
    iconTheme: IconThemeData(color: Color(0xFF1A1D24)),
    titleTextStyle: TextStyle(color: Color(0xFF1A1D24), fontSize: 20, fontWeight: FontWeight.bold),
  ),
  colorScheme: const ColorScheme.light(
    primary: accentNeonLight,
    surface: Colors.white,
    onSurface: Color(0xFF1A1D24),
    onSurfaceVariant: Colors.black54,
  ),
  bottomNavigationBarTheme: const BottomNavigationBarThemeData(
    backgroundColor: Colors.white,
    selectedItemColor: accentNeonLight,
    unselectedItemColor: Colors.black54,
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
                return const Scaffold(body: Center(child: CircularProgressIndicator()));
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
      await FirebaseAuth.instance.signInWithEmailAndPassword(email: email, password: password);
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
                  errorBuilder: (_, __, ___) => Icon(Icons.radar, size: 100, color: theme.primaryColor),
                ),
                const SizedBox(height: 20),
                RichText(
                  text: TextSpan(
                    style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, letterSpacing: 1.5),
                    children: [
                      TextSpan(text: 'SMART ', style: TextStyle(color: theme.colorScheme.onSurface)),
                      TextSpan(text: 'CURB', style: TextStyle(color: theme.primaryColor)),
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
                    style: TextStyle(color: theme.primaryColor, fontWeight: FontWeight.w600),
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
      await FirebaseAuth.instance.createUserWithEmailAndPassword(email: email, password: password);
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
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface),
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
                    style: TextStyle(color: theme.primaryColor, fontWeight: FontWeight.w600),
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
            color: theme.brightness == Brightness.dark ? Colors.white10 : Colors.grey[200],
            borderRadius: BorderRadius.circular(20),
          ),
          child: TextField(
            style: TextStyle(color: theme.colorScheme.onSurface),
            decoration: InputDecoration(
              hintText: 'Search...',
              hintStyle: TextStyle(color: theme.colorScheme.onSurfaceVariant),
              prefixIcon: Icon(Icons.search, color: theme.colorScheme.onSurfaceVariant),
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
              final page = (val == 'settings') ? const UserSettingsPage() : const UserAboutPage();
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
          BottomNavigationBarItem(icon: Icon(Icons.directions_car), label: 'Vehicle'),
          BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }

  PopupMenuItem<String> _buildMenuItem(String val, IconData icon, String label, ThemeData theme) {
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
// TAB 1: HOME
// ==========================================

class _HomeTab extends StatelessWidget {
  const _HomeTab();

  void _showAddSpaceDialog(BuildContext context) {
    final theme = Theme.of(context);
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (dialogCtx) => Dialog(
        backgroundColor: theme.cardColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(maxWidth: 700, minHeight: 450),
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              IconButton(
                icon: const Icon(Icons.close),
                color: theme.colorScheme.onSurface,
                onPressed: () => Navigator.of(dialogCtx).pop(),
              ),
              const Expanded(child: SizedBox()),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedAddCard(
      title: 'No Locations Found',
      subtitle: 'Tap to add a new parking space',
      onTap: () => _showAddSpaceDialog(context),
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

  void _showVehicleDetails(BuildContext context, Map<String, dynamic> data, String docId) {
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
            DetailInfoRow(label: 'Plate Number', value: data['plate'] ?? 'N/A'),
            DetailInfoRow(label: 'Manufacturer', value: data['manufacturer'] ?? 'N/A'),
            DetailInfoRow(label: 'Year', value: data['year'] ?? 'N/A'),
            DetailInfoRow(label: 'Color', value: data['color'] ?? 'N/A'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              final uid = FirebaseAuth.instance.currentUser?.uid;
              if (uid != null) {
                FirebaseFirestore.instance
                    .collection('users')
                    .doc(uid)
                    .collection('vehicles')
                    .doc(docId)
                    .delete();
              }
            },
            child: const Text('Delete Vehicle', style: TextStyle(color: Colors.redAccent)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(),
            style: ElevatedButton.styleFrom(backgroundColor: theme.primaryColor, foregroundColor: Colors.black),
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

    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance.collection('users').doc(uid).collection('vehicles').snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(child: Text('Error: ${snapshot.error}', style: const TextStyle(color: Colors.redAccent)));
        }
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final docs = snapshot.data?.docs ?? [];
        if (docs.isEmpty) {
          return AnimatedAddCard(
            title: 'No Vehicle Found',
            subtitle: 'Tap to add a new vehicle to your account',
            onTap: () => _openAddVehicleDialog(context),
          );
        }

        return ListView(
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 16.0),
          children: [
            ...docs.map((doc) {
              final data = doc.data() as Map<String, dynamic>;
              return Padding(
                padding: const EdgeInsets.only(bottom: 12.0),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => _showVehicleDetails(context, data, doc.id),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
                    decoration: BoxDecoration(
                      color: theme.cardColor,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: theme.dividerColor, width: 2),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          data['model'] ?? 'Unknown Model',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface),
                        ),
                        Text(
                          data['plate'] ?? 'No Plate',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: theme.primaryColor),
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
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: Text(
                'Add more vehicle',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: theme.primaryColor),
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
      showErrorSnackBar(context, 'Please fill out at least Model and License Plate.');
      return;
    }

    Navigator.of(context).pop();

    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid != null) {
      FirebaseFirestore.instance.collection('users').doc(uid).collection('vehicles').add({
        'manufacturer': _manufacturerCtrl.text.trim(),
        'model': model,
        'plate': plate,
        'year': _yearCtrl.text.trim(),
        'color': _colorCtrl.text.trim(),
        'createdAt': FieldValue.serverTimestamp(),
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
                Text('Add New Vehicle', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface)),
                IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.of(context).pop()),
              ],
            ),
            const SizedBox(height: 16),
            AppTextField(controller: _manufacturerCtrl, hintText: 'Manufacturer (e.g. Toyota)', icon: Icons.business),
            const SizedBox(height: 12),
            AppTextField(controller: _modelCtrl, hintText: 'Model (e.g. RAV 4)', icon: Icons.directions_car),
            const SizedBox(height: 12),
            AppTextField(controller: _plateCtrl, hintText: 'License Plate (e.g. S108123)', icon: Icons.pin),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: AppTextField(controller: _yearCtrl, hintText: 'Year (e.g. 2024)', icon: Icons.calendar_today, keyboardType: TextInputType.number)),
                const SizedBox(width: 12),
                Expanded(child: AppTextField(controller: _colorCtrl, hintText: 'Color (e.g. Silver)', icon: Icons.color_lens)),
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
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
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
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    child: const Text('Confirm', style: TextStyle(fontWeight: FontWeight.bold)),
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

    return StreamBuilder<DocumentSnapshot>(
      stream: FirebaseFirestore.instance.collection('users').doc(user.uid).snapshots(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final data = snapshot.data?.data() as Map<String, dynamic>?;
        if (data == null || data['firstName'] == null) {
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
                            child: Icon(Icons.person, size: 38, color: theme.primaryColor),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  fullName,
                                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface),
                                ),
                                const SizedBox(height: 4),
                                Text(user.email ?? '', style: TextStyle(fontSize: 14, color: theme.colorScheme.onSurfaceVariant)),
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
                          DetailInfoRow(label: 'Phone Number', value: data['phone'] ?? 'N/A'),
                          const Divider(height: 20),
                          DetailInfoRow(label: 'Gender', value: data['gender'] ?? 'N/A'),
                          const Divider(height: 20),
                          DetailInfoRow(label: 'Address', value: fullAddress),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
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
    _phoneCtrl = TextEditingController(text: d?['phone'] ?? '');
    _firstCtrl = TextEditingController(text: d?['firstName'] ?? '');
    _lastCtrl = TextEditingController(text: d?['lastName'] ?? '');
    _middleCtrl = TextEditingController(text: d?['middleName'] ?? '');
    _addr1Ctrl = TextEditingController(text: d?['address1'] ?? '');
    _addr2Ctrl = TextEditingController(text: d?['address2'] ?? '');
    _cityCtrl = TextEditingController(text: d?['city'] ?? '');
    _stateCtrl = TextEditingController(text: d?['state'] ?? '');
    _zipCtrl = TextEditingController(text: d?['zipCode'] ?? '');
    _countryCtrl = TextEditingController(text: d?['country'] ?? '');
    _gender = d?['gender'];
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
      FirebaseFirestore.instance.collection('users').doc(uid).set({
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
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
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
                    widget.existingData == null ? 'Add Contact Info' : 'Edit Contact Info',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface),
                  ),
                  IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.of(context).pop()),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(child: AppTextField(controller: _firstCtrl, hintText: 'First Name *', icon: Icons.person_outline)),
                  const SizedBox(width: 10),
                  Expanded(child: AppTextField(controller: _lastCtrl, hintText: 'Last Name *', icon: Icons.person_outline)),
                ],
              ),
              const SizedBox(height: 12),
              AppTextField(controller: _middleCtrl, hintText: 'Middle Name (Optional)', icon: Icons.badge_outlined),
              const SizedBox(height: 12),
              AppTextField(controller: _phoneCtrl, hintText: 'Phone Number *', icon: Icons.phone_outlined, keyboardType: TextInputType.phone),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
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
                        Text('Gender *', style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
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
              AppTextField(controller: _addr1Ctrl, hintText: 'Address Line 1 *', icon: Icons.home_outlined),
              const SizedBox(height: 12),
              AppTextField(controller: _addr2Ctrl, hintText: 'Address Line 2 (Optional)', icon: Icons.location_city_outlined),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(child: AppTextField(controller: _cityCtrl, hintText: 'City *', icon: Icons.location_on_outlined)),
                  const SizedBox(width: 10),
                  Expanded(child: AppTextField(controller: _stateCtrl, hintText: 'State *', icon: Icons.map_outlined)),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(child: AppTextField(controller: _zipCtrl, hintText: 'Zip Code *', icon: Icons.markunread_mailbox_outlined, keyboardType: TextInputType.number)),
                  const SizedBox(width: 10),
                  Expanded(child: AppTextField(controller: _countryCtrl, hintText: 'Country *', icon: Icons.public_outlined)),
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
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
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
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: const Text('Confirm', style: TextStyle(fontWeight: FontWeight.bold)),
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
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.dividerColor),
      ),
      child: TextField(
        controller: controller,
        obscureText: obscureText,
        keyboardType: keyboardType,
        style: TextStyle(color: theme.colorScheme.onSurface),
        decoration: InputDecoration(
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
          hintText: hintText,
          hintStyle: TextStyle(color: theme.colorScheme.onSurfaceVariant),
          prefixIcon: Icon(icon, color: theme.primaryColor),
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
          foregroundColor: Colors.black,
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          elevation: 6,
          shadowColor: theme.primaryColor.withOpacity(0.5),
        ),
        child: isLoading
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
                  Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
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
          Text(label, style: TextStyle(color: theme.colorScheme.onSurfaceVariant, fontSize: 14)),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(color: theme.colorScheme.onSurface, fontWeight: FontWeight.bold, fontSize: 14),
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
                color: _isPressed ? theme.primaryColor.withOpacity(0.6) : theme.dividerColor,
                width: 2,
              ),
              boxShadow: _isPressed
                  ? [BoxShadow(color: theme.primaryColor.withOpacity(0.15), blurRadius: 20, spreadRadius: 2)]
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
                        color: _isPressed ? theme.primaryColor.withOpacity(0.4) : theme.primaryColor.withOpacity(0.1),
                        blurRadius: _isPressed ? 25 : 15,
                        spreadRadius: _isPressed ? 8 : 5,
                      ),
                    ],
                  ),
                  child: Icon(Icons.add, size: 40, color: theme.primaryColor),
                ),
                const SizedBox(height: 20),
                Text(widget.title, style: TextStyle(color: theme.colorScheme.onSurface, fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text(widget.subtitle, style: TextStyle(color: theme.colorScheme.onSurfaceVariant, fontSize: 14)),
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
            title: Text('Dark Mode', style: TextStyle(color: theme.colorScheme.onSurface)),
            trailing: Switch(
              value: themeNotifier.value == ThemeMode.dark,
              onChanged: (val) => themeNotifier.value = val ? ThemeMode.dark : ThemeMode.light,
              activeColor: theme.scaffoldBackgroundColor,
              activeTrackColor: theme.primaryColor,
            ),
          ),
          ListTile(
            leading: Icon(Icons.notifications_active, color: theme.primaryColor),
            title: Text('Notifications', style: TextStyle(color: theme.colorScheme.onSurface)),
            trailing: Switch(
              value: true,
              onChanged: (_) {},
              activeColor: theme.scaffoldBackgroundColor,
              activeTrackColor: theme.primaryColor,
            ),
          ),
          ListTile(
            leading: Icon(Icons.mail_outline, color: theme.primaryColor),
            title: Text('Contact Us', style: TextStyle(color: theme.colorScheme.onSurface)),
            trailing: Icon(Icons.arrow_forward_ios, color: theme.colorScheme.onSurfaceVariant, size: 16),
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
              style: TextStyle(color: theme.colorScheme.onSurfaceVariant, height: 1.5, fontSize: 16),
            ),
            const SizedBox(height: 30),
            Divider(color: theme.dividerColor),
            const SizedBox(height: 10),
            Text(
              'Version: 1.0.0 (Beta)',
              style: TextStyle(color: theme.primaryColor, fontWeight: FontWeight.bold, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }
}

// Global Helper
void showErrorSnackBar(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(message, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      backgroundColor: Colors.redAccent,
    ),
  );
}