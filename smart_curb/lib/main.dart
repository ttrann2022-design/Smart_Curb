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
// THEME MANAGEMENT (Global Notifier)
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
// ROOT APPLICATION WIDGET
// ==========================================
class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: themeNotifier,
      builder: (context, currentMode, child) {
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
              if (snapshot.hasData) {
                return const UserSpace();
              }
              return const LoginPage();
            },
          ),
        );
      },
    );
  }
}

// ==========================================
// LOGIN PAGE
// ==========================================
class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  bool _isLoading = false;

  Future<void> _handleLogin() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (email.isEmpty || password.isEmpty) {
      _showMessage('Please enter both email and password.');
      return;
    }

    setState(() => _isLoading = true);

    try {
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
    } on FirebaseAuthException catch (e) {
      _showMessage(e.message ?? 'Login failed.');
    } catch (_) {
      _showMessage('An unexpected error occurred. Please try again.');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        backgroundColor: Colors.redAccent,
      ),
    );
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
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
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Image.asset(
                  'assets/logo.png',
                  height: 140,
                  fit: BoxFit.contain,
                  errorBuilder: (context, error, stackTrace) =>
                      Icon(Icons.radar, size: 100, color: theme.primaryColor),
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
                _buildInputContainer(
                  theme: theme,
                  controller: _emailController,
                  hintText: 'Email',
                  icon: Icons.email_outlined,
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 20),
                _buildInputContainer(
                  theme: theme,
                  controller: _passwordController,
                  hintText: 'Password',
                  icon: Icons.lock_outline,
                  obscureText: true,
                ),
                const SizedBox(height: 30),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _isLoading ? null : _handleLogin,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: theme.primaryColor,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      elevation: 8,
                      shadowColor: theme.primaryColor.withOpacity(0.5),
                    ),
                    child: _isLoading
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                          )
                        : const Text(
                            'Login',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 1),
                          ),
                  ),
                ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (context) => const RegisterPage()),
                    );
                  },
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

// ==========================================
// REGISTER PAGE
// ==========================================
class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key});

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _confirmPasswordController = TextEditingController();
  bool _isLoading = false;

  Future<void> _handleRegister() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    final confirmPassword = _confirmPasswordController.text;

    if (email.isEmpty || password.isEmpty || confirmPassword.isEmpty) {
      _showMessage('Please fill out all fields.');
      return;
    }

    if (password != confirmPassword) {
      _showMessage('Passwords do not match.');
      return;
    }

    setState(() => _isLoading = true);

    try {
      await FirebaseAuth.instance.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );
      if (mounted) {
        Navigator.pop(context);
      }
    } on FirebaseAuthException catch (e) {
      _showMessage(e.message ?? 'Registration failed.');
    } catch (_) {
      _showMessage('An unexpected error occurred. Please try again.');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        backgroundColor: Colors.redAccent,
      ),
    );
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
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
              mainAxisAlignment: MainAxisAlignment.center,
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
                const SizedBox(height: 8),
                Text(
                  'Register a new account to manage parking spaces',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: theme.colorScheme.onSurfaceVariant, fontSize: 14),
                ),
                const SizedBox(height: 36),
                _buildInputContainer(
                  theme: theme,
                  controller: _emailController,
                  hintText: 'Email Address',
                  icon: Icons.email_outlined,
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 18),
                _buildInputContainer(
                  theme: theme,
                  controller: _passwordController,
                  hintText: 'Password',
                  icon: Icons.lock_outline,
                  obscureText: true,
                ),
                const SizedBox(height: 18),
                _buildInputContainer(
                  theme: theme,
                  controller: _confirmPasswordController,
                  hintText: 'Confirm Password',
                  icon: Icons.lock_reset,
                  obscureText: true,
                ),
                const SizedBox(height: 30),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _isLoading ? null : _handleRegister,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: theme.primaryColor,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      elevation: 8,
                      shadowColor: theme.primaryColor.withOpacity(0.5),
                    ),
                    child: _isLoading
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                          )
                        : const Text(
                            'Register',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 1),
                          ),
                  ),
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

// Reusable input container
Widget _buildInputContainer({
  required ThemeData theme,
  required TextEditingController controller,
  required String hintText,
  required IconData icon,
  bool obscureText = false,
  TextInputType keyboardType = TextInputType.text,
}) {
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

// ==========================================
// USER SPACE (With Vehicle Flow)
// ==========================================
class UserSpace extends StatefulWidget {
  const UserSpace({super.key});

  @override
  State<UserSpace> createState() => _UserSpaceState();
}

class _UserSpaceState extends State<UserSpace> {
  int _currentIndex = 0;

  Future<void> _logout() async {
    await FirebaseAuth.instance.signOut();
  }

  /// Opens the dialog/sheet to input new vehicle data
  /// Opens a centered modal dialog to input new vehicle data
  void _showAddVehicleDialog() {
    final manufacturerCtrl = TextEditingController();
    final modelCtrl = TextEditingController();
    final plateCtrl = TextEditingController();
    final yearCtrl = TextEditingController();
    final colorCtrl = TextEditingController();
    final theme = Theme.of(context);

    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (dialogContext) {
        return Dialog(
          backgroundColor: theme.cardColor,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
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
                      onPressed: () => Navigator.of(dialogContext).pop(),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                _buildInputContainer(
                  theme: theme,
                  controller: manufacturerCtrl,
                  hintText: 'Manufacturer (e.g. Toyota)',
                  icon: Icons.business,
                ),
                const SizedBox(height: 12),
                _buildInputContainer(
                  theme: theme,
                  controller: modelCtrl,
                  hintText: 'Model (e.g. RAV 4)',
                  icon: Icons.directions_car,
                ),
                const SizedBox(height: 12),
                _buildInputContainer(
                  theme: theme,
                  controller: plateCtrl,
                  hintText: 'License Plate (e.g. S108123)',
                  icon: Icons.pin,
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _buildInputContainer(
                        theme: theme,
                        controller: yearCtrl,
                        hintText: 'Year (e.g. 2024)',
                        icon: Icons.calendar_today,
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _buildInputContainer(
                        theme: theme,
                        controller: colorCtrl,
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
                        onPressed: () => Navigator.of(dialogContext).pop(),
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
                        onPressed: () {
                          final model = modelCtrl.text.trim();
                          final plate = plateCtrl.text.trim();
                          final manufacturer = manufacturerCtrl.text.trim();
                          final year = yearCtrl.text.trim();
                          final color = colorCtrl.text.trim();

                          if (model.isEmpty || plate.isEmpty) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Please fill out at least Model and License Plate.'),
                                backgroundColor: Colors.redAccent,
                              ),
                            );
                            return;
                          }

                          // 1. Instantly dismiss the popup window
                          Navigator.of(dialogContext).pop();

                          // 2. Perform the database write asynchronously
                          final user = FirebaseAuth.instance.currentUser;
                          if (user != null) {
                            FirebaseFirestore.instance
                                .collection('users')
                                .doc(user.uid)
                                .collection('vehicles')
                                .add({
                              'manufacturer': manufacturer,
                              'model': model,
                              'plate': plate,
                              'year': year,
                              'color': color,
                              'createdAt': FieldValue.serverTimestamp(),
                            }).catchError((error) {
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text('Failed to save vehicle: $error'),
                                    backgroundColor: Colors.redAccent,
                                  ),
                                );
                              }
                            });
                          }
                        },
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
      },
    );
  }
  // ==========================================
  // PROFILE TAB LOGIC & UI (With Zip Code)
  // ==========================================
  /// Opens a large blank modal dialog with an 'X' button on the top-left
  void _showAddSpaceDialog() {
    final theme = Theme.of(context);

    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (dialogCtx) {
        return Dialog(
          backgroundColor: theme.cardColor,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: Container(
            width: double.infinity,
            constraints: const BoxConstraints(
              maxWidth: 700,
              minHeight: 450,
            ),
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top-left 'X' close button
                IconButton(
                  icon: const Icon(Icons.close),
                  color: theme.colorScheme.onSurface,
                  tooltip: 'Close',
                  onPressed: () => Navigator.of(dialogCtx).pop(),
                ),
                // Expanded blank area ready for your parking space addition UI
                const Expanded(
                  child: SizedBox(),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  // =========================================
  /// PROFILE TAB UI
  /// Displays user profile information and allows editing
  /// =========================================
  /// 
  Widget _buildProfileSection() {
    final user = FirebaseAuth.instance.currentUser;
    final theme = Theme.of(context);

    if (user == null) {
      return const Center(child: Text('User not signed in.'));
    }

    return StreamBuilder<DocumentSnapshot>(
      stream: FirebaseFirestore.instance.collection('users').doc(user.uid).snapshots(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final data = snapshot.data?.data() as Map<String, dynamic>?;

        // If no profile document or essential fields haven't been saved yet
        if (data == null || data['firstName'] == null) {
          return AnimatedAddCard(
            title: 'Profile Incomplete',
            subtitle: 'Tap to add your contact information',
            onTap: () => _showContactInfoDialog(),
          );
        }

        // Combine full name
        final middle = (data['middleName'] ?? '').toString().trim();
        final fullName = middle.isEmpty
            ? '${data['firstName']} ${data['lastName']}'
            : '${data['firstName']} $middle ${data['lastName']}';

        // Combine address including zip code
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
                  padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 20.0),
                  children: [
                    // Header Card
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

                    // Information Details Card
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: theme.cardColor,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: theme.dividerColor),
                      ),
                      child: Column(
                        children: [
                          _buildDetailRow('Phone Number', data['phone'] ?? 'N/A', theme),
                          const Divider(height: 20),
                          _buildDetailRow('Gender', data['gender'] ?? 'N/A', theme),
                          const Divider(height: 20),
                          _buildDetailRow('Address', fullAddress, theme),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              // Bottom Middle "Edit Information" Button
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () => _showContactInfoDialog(existingData: data),
                    icon: const Icon(Icons.edit_outlined, size: 18),
                    label: const Text(
                      'Edit Information',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: theme.primaryColor,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      elevation: 6,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  /// Centered dialog for creating and updating user contact info
  void _showContactInfoDialog({Map<String, dynamic>? existingData}) {
    final theme = Theme.of(context);

    final phoneCtrl = TextEditingController(text: existingData?['phone'] ?? '');
    final firstCtrl = TextEditingController(text: existingData?['firstName'] ?? '');
    final lastCtrl = TextEditingController(text: existingData?['lastName'] ?? '');
    final middleCtrl = TextEditingController(text: existingData?['middleName'] ?? '');
    final addr1Ctrl = TextEditingController(text: existingData?['address1'] ?? '');
    final addr2Ctrl = TextEditingController(text: existingData?['address2'] ?? '');
    final cityCtrl = TextEditingController(text: existingData?['city'] ?? '');
    final stateCtrl = TextEditingController(text: existingData?['state'] ?? '');
    final zipCtrl = TextEditingController(text: existingData?['zipCode'] ?? '');
    final countryCtrl = TextEditingController(text: existingData?['country'] ?? '');

    String? selectedGender = existingData?['gender'];
    final List<String> genderOptions = ['Male', 'Female', 'Other'];

    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (dialogCtx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
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
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            existingData == null ? 'Add Contact Info' : 'Edit Contact Info',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              color: theme.colorScheme.onSurface,
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () => Navigator.of(dialogCtx).pop(),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // First & Last Name (Required)
                      Row(
                        children: [
                          Expanded(
                            child: _buildInputContainer(
                              theme: theme,
                              controller: firstCtrl,
                              hintText: 'First Name *',
                              icon: Icons.person_outline,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _buildInputContainer(
                              theme: theme,
                              controller: lastCtrl,
                              hintText: 'Last Name *',
                              icon: Icons.person_outline,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),

                      // Middle Name (Optional)
                      _buildInputContainer(
                        theme: theme,
                        controller: middleCtrl,
                        hintText: 'Middle Name (Optional)',
                        icon: Icons.badge_outlined,
                      ),
                      const SizedBox(height: 12),

                      // Phone Number (Required)
                      _buildInputContainer(
                        theme: theme,
                        controller: phoneCtrl,
                        hintText: 'Phone Number *',
                        icon: Icons.phone_outlined,
                        keyboardType: TextInputType.phone,
                      ),
                      const SizedBox(height: 12),

                      // Gender Dropdown (Required)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                        decoration: BoxDecoration(
                          color: theme.cardColor,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: theme.dividerColor),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            value: selectedGender,
                            isExpanded: true,
                            hint: Row(
                              children: [
                                Icon(Icons.transgender, color: theme.primaryColor),
                                const SizedBox(width: 12),
                                Text(
                                  'Gender *',
                                  style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
                                ),
                              ],
                            ),
                            dropdownColor: theme.cardColor,
                            icon: Icon(Icons.arrow_drop_down, color: theme.primaryColor),
                            items: genderOptions.map((gender) {
                              return DropdownMenuItem<String>(
                                value: gender,
                                child: Text(
                                  gender,
                                  style: TextStyle(color: theme.colorScheme.onSurface),
                                ),
                              );
                            }).toList(),
                            onChanged: (val) {
                              setDialogState(() => selectedGender = val);
                            },
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Address 1 (Required)
                      _buildInputContainer(
                        theme: theme,
                        controller: addr1Ctrl,
                        hintText: 'Address Line 1 *',
                        icon: Icons.home_outlined,
                      ),
                      const SizedBox(height: 12),

                      // Address 2 (Optional)
                      _buildInputContainer(
                        theme: theme,
                        controller: addr2Ctrl,
                        hintText: 'Address Line 2 (Optional)',
                        icon: Icons.location_city_outlined,
                      ),
                      const SizedBox(height: 12),

                      // City & State (Required)
                      Row(
                        children: [
                          Expanded(
                            child: _buildInputContainer(
                              theme: theme,
                              controller: cityCtrl,
                              hintText: 'City *',
                              icon: Icons.location_on_outlined,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _buildInputContainer(
                              theme: theme,
                              controller: stateCtrl,
                              hintText: 'State *',
                              icon: Icons.map_outlined,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),

                      // Zip Code & Country (Required)
                      Row(
                        children: [
                          Expanded(
                            child: _buildInputContainer(
                              theme: theme,
                              controller: zipCtrl,
                              hintText: 'Zip Code *',
                              icon: Icons.markunread_mailbox_outlined,
                              keyboardType: TextInputType.number,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _buildInputContainer(
                              theme: theme,
                              controller: countryCtrl,
                              hintText: 'Country *',
                              icon: Icons.public_outlined,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),

                      // Buttons
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => Navigator.of(dialogCtx).pop(),
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
                              onPressed: () {
                                final phone = phoneCtrl.text.trim();
                                final first = firstCtrl.text.trim();
                                final last = lastCtrl.text.trim();
                                final middle = middleCtrl.text.trim();
                                final addr1 = addr1Ctrl.text.trim();
                                final addr2 = addr2Ctrl.text.trim();
                                final city = cityCtrl.text.trim();
                                final state = stateCtrl.text.trim();
                                final zip = zipCtrl.text.trim();
                                final country = countryCtrl.text.trim();

                                // Validate all required fields including Zip Code
                                if (phone.isEmpty ||
                                    first.isEmpty ||
                                    last.isEmpty ||
                                    selectedGender == null ||
                                    addr1.isEmpty ||
                                    city.isEmpty ||
                                    state.isEmpty ||
                                    zip.isEmpty ||
                                    country.isEmpty) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('Please fill in all required fields.'),
                                      backgroundColor: Colors.redAccent,
                                    ),
                                  );
                                  return;
                                }

                                // 1. Close dialog immediately
                                Navigator.of(dialogCtx).pop();

                                // 2. Save/Update to Firestore under users/{userId}
                                final user = FirebaseAuth.instance.currentUser;
                                if (user != null) {
                                  FirebaseFirestore.instance
                                      .collection('users')
                                      .doc(user.uid)
                                      .set({
                                    'firstName': first,
                                    'lastName': last,
                                    'middleName': middle,
                                    'phone': phone,
                                    'gender': selectedGender,
                                    'address1': addr1,
                                    'address2': addr2,
                                    'city': city,
                                    'state': state,
                                    'zipCode': zip,
                                    'country': country,
                                    'updatedAt': FieldValue.serverTimestamp(),
                                  }, SetOptions(merge: true)).catchError((e) {
                                    if (mounted) {
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(
                                          content: Text('Failed to save profile: $e'),
                                          backgroundColor: Colors.redAccent,
                                        ),
                                      );
                                    }
                                  });
                                }
                              },
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
          },
        );
      },
    );
  }
  /// Displays vehicle detail modal when a card is clicked
  /// Displays vehicle detail modal when a card is clicked
  void _showVehicleDetails(Map<String, dynamic> data, String docId) {
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
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildDetailRow('Plate Number', data['plate'] ?? 'N/A', theme),
            _buildDetailRow('Manufacturer', data['manufacturer'] ?? 'N/A', theme),
            _buildDetailRow('Year', data['year'] ?? 'N/A', theme),
            _buildDetailRow('Color', data['color'] ?? 'N/A', theme),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              // 1. Instantly close the dialog window
              Navigator.of(ctx).pop();

              // 2. Perform the Firestore document delete in the background
              final user = FirebaseAuth.instance.currentUser;
              if (user != null) {
                FirebaseFirestore.instance
                    .collection('users')
                    .doc(user.uid)
                    .collection('vehicles')
                    .doc(docId)
                    .delete()
                    .catchError((error) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('Failed to delete vehicle: $error'),
                        backgroundColor: Colors.redAccent,
                      ),
                    );
                  }
                });
              }
            },
            child: const Text('Delete Vehicle', style: TextStyle(color: Colors.redAccent)),
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

  Widget _buildDetailRow(String label, String value, ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: theme.colorScheme.onSurfaceVariant, fontSize: 14)),
          Text(value, style: TextStyle(color: theme.colorScheme.onSurface, fontWeight: FontWeight.bold, fontSize: 14)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.logout),
          onPressed: _logout,
          tooltip: 'Logout',
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
            onSelected: (value) {
              if (value == 'settings') {
                Navigator.push(context, MaterialPageRoute(builder: (_) => const UserSettingsPage()));
              } else if (value == 'about') {
                Navigator.push(context, MaterialPageRoute(builder: (_) => const UserAboutPage()));
              }
            },
            itemBuilder: (context) => [
              PopupMenuItem<String>(
                value: 'settings',
                child: Row(
                  children: [
                    Icon(Icons.settings, color: theme.colorScheme.onSurfaceVariant, size: 20),
                    const SizedBox(width: 12),
                    Text('Settings', style: TextStyle(color: theme.colorScheme.onSurface)),
                  ],
                ),
              ),
              PopupMenuItem<String>(
                value: 'about',
                child: Row(
                  children: [
                    Icon(Icons.info_outline, color: theme.colorScheme.onSurfaceVariant, size: 20),
                    const SizedBox(width: 12),
                    Text('About App', style: TextStyle(color: theme.colorScheme.onSurface)),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      body: _buildBodyContent(),
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

Widget _buildBodyContent() {
    switch (_currentIndex) {
      case 0:
        return AnimatedAddCard(
          title: 'No Locations Found',
          subtitle: 'Tap to add a new parking space',
          onTap: _showAddSpaceDialog, // <--- Connected here
        );
      case 1:
        return _buildVehicleSection();
      case 2:
        return _buildProfileSection();
      default:
        return const SizedBox.shrink();
    }
  }

  /// Vehicle view: Displays empty card if 0 vehicles, or list of cards matching the sketch
/// Vehicle view: Displays empty card if 0 vehicles, or list of cards matching the sketch
  Widget _buildVehicleSection() {
    final theme = Theme.of(context);
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return const Center(child: Text('User not signed in.'));
    }

    return StreamBuilder<QuerySnapshot>(
      // Removed orderBy temporarily to prevent index/permission hangs
      stream: FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .collection('vehicles')
          .snapshots(),
      builder: (context, snapshot) {
        // If Firestore throws an error (e.g., rules permission denied), show it instead of hanging
        if (snapshot.hasError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, color: Colors.redAccent, size: 48),
                  const SizedBox(height: 12),
                  Text(
                    'Firestore Error:\n${snapshot.error}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.redAccent, fontSize: 13),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => setState(() {}),
                    child: const Text('Retry'),
                  )
                ],
              ),
            ),
          );
        }

        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final docs = snapshot.data?.docs ?? [];

        if (docs.isEmpty) {
          return AnimatedAddCard(
            title: 'No Vehicle Found',
            subtitle: 'Tap to add a new vehicle to your account',
            onTap: _showAddVehicleDialog,
          );
        }

        return ListView(
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 16.0),
          children: [
            ...docs.map((doc) {
              final data = doc.data() as Map<String, dynamic>;
              final model = data['model'] ?? 'Unknown Model';
              final plate = data['plate'] ?? 'No Plate';

              return Padding(
                padding: const EdgeInsets.only(bottom: 12.0),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => _showVehicleDetails(data, doc.id),
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
                          model,
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: theme.colorScheme.onSurface,
                          ),
                        ),
                        Text(
                          plate,
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
            }).toList(),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: _showAddVehicleDialog,
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                side: BorderSide(color: theme.primaryColor, width: 1.5),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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

// ==========================================
// USER SPECIFIC PAGES
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
              onChanged: (val) {
                themeNotifier.value = val ? ThemeMode.dark : ThemeMode.light;
              },
              activeColor: theme.scaffoldBackgroundColor,
              activeTrackColor: theme.primaryColor,
            ),
          ),
          ListTile(
            leading: Icon(Icons.notifications_active, color: theme.primaryColor),
            title: Text('Notifications', style: TextStyle(color: theme.colorScheme.onSurface)),
            trailing: Switch(
              value: true,
              onChanged: (val) {},
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



// ==========================================
// CUSTOM ANIMATED CARD
// ==========================================
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
                  : [],
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
                Text(
                  widget.title,
                  style: TextStyle(color: theme.colorScheme.onSurface, fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  widget.subtitle,
                  style: TextStyle(color: theme.colorScheme.onSurfaceVariant, fontSize: 14),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}