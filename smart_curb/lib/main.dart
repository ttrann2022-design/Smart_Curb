import 'package:flutter/material.dart';


// test: Ryan Hart edit
/// Entry point of the Flutter application.
void main() {
  runApp(const MyApp());
}

// ==========================================
// THEME MANAGEMENT (Global Notifier)
// ==========================================

/// A lightweight, app-wide notifier that tracks whether the app is currently in
/// Dark Mode or Light Mode. Listening widgets will automatically rebuild when this value changes.
final ValueNotifier<ThemeMode> themeNotifier = ValueNotifier(ThemeMode.dark);

/// Brand accent colors: High-visibility neon hues used for active states,
/// primary buttons, icons, and focus highlights.
const Color accentNeonDark = Color(0xFFC5E01A); 
const Color accentNeonLight = Color(0xFF9EBA15); // Slightly darker for contrast on white

// --- DARK THEME CONFIGURATION ---
/// Defines global styling, typography colors, and surface shades for dark mode.
final ThemeData darkTheme = ThemeData(
  brightness: Brightness.dark,
  primaryColor: accentNeonDark,
  scaffoldBackgroundColor: const Color(0xFF1A1D24), // Deep slate background
  cardColor: const Color(0xFF282C35),               // Elevated surface color
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
    onSurface: Colors.white,         // Primary text color on dark surfaces
    onSurfaceVariant: Colors.white54, // Secondary/muted text color
  ),
  bottomNavigationBarTheme: const BottomNavigationBarThemeData(
    backgroundColor: Color(0xFF111318),
    selectedItemColor: accentNeonDark,
    unselectedItemColor: Colors.white54,
  ),
  useMaterial3: true,
);

// --- LIGHT THEME (WHITE MODE) CONFIGURATION ---
/// Defines global styling, typography colors, and surface shades for light mode.
final ThemeData lightTheme = ThemeData(
  brightness: Brightness.light,
  primaryColor: accentNeonLight,
  scaffoldBackgroundColor: const Color(0xFFF5F7FA), // Soft off-white background
  cardColor: Colors.white,                          // Pure white card surfaces
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
    onSurface: Color(0xFF1A1D24),    // Primary high-contrast text
    onSurfaceVariant: Colors.black54, // Secondary/muted text color
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
/// Root widget that establishes MaterialApp, binds theme switching, and sets up initial routing.
class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Listens to global theme changes without requiring complex state management libraries
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: themeNotifier,
      builder: (context, currentMode, child) {
        return MaterialApp(
          title: 'Smart Curb App',
          debugShowCheckedModeBanner: false,
          theme: lightTheme,
          darkTheme: darkTheme,
          themeMode: currentMode, // Instantly switches between light/dark
          home: const LoginPage(),
        );
      },
    );
  }
}

// ==========================================
// LOGIN PAGE
// ==========================================
/// Handles user and administrator authentication.
class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  // Text editing controllers to capture user input
  final TextEditingController _usernameController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  // Flag tracking whether the user is attempting an Admin login vs Standard User login
  bool _isAdmin = false;

  /// Validates input credentials based on the selected role and handles navigation.
  void _handleLogin() {
    final username = _usernameController.text.trim();
    final password = _passwordController.text;

    if (_isAdmin) {
      // Validate Admin Credentials
      if (username == 'ttrann2022@fau.edu' && password == 'Baythang04@') {
        // pushReplacement prevents the user from going back to the login screen via back button
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => const AdminDashboard()));
      } else {
        _showError('Invalid Admin Credentials');
      }
    } else {
      // Validate Standard User Credentials
      if (username == 'trannhattuan2004@gmail.com' && password == 'Baythang04@') {
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => const UserSpace()));
      } else {
        _showError('Invalid User Credentials');
      }
    }
  }

  /// Displays an alert banner at the bottom of the screen when login fails.
  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        backgroundColor: Colors.redAccent,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Access current active theme context
    final theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          // SingleChildScrollView prevents keyboard overflows on smaller mobile screens
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Application branding logo with fallback to a radar icon
                Image.asset(
                  'assets/logo.png',
                  height: 140, // Adjust this height if the image feels too big/small
                  fit: BoxFit.contain,
                  errorBuilder: (context, error, stackTrace) => Icon(Icons.radar, size: 100, color: theme.primaryColor), 
                ),
                const SizedBox(height: 20),
                
                // IF YOUR 'assets/logo.png' ALREADY INCLUDES THE TEXT:
                // Delete this RichText and the Text widget beneath it so it doesn't double-up.
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
                const SizedBox(height: 50),
                
                // Username input field
                _buildTextField(controller: _usernameController, hintText: 'Username', icon: Icons.person_outline),
                const SizedBox(height: 20),

                // Password input field (obscured text)
                _buildTextField(controller: _passwordController, hintText: 'Password', icon: Icons.lock_outline, obscureText: true),
                const SizedBox(height: 30),
                
                // Controls row: Admin Toggle Switch and Submit Button
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Pill-shaped container wrapping the Admin toggle
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: theme.cardColor,
                        borderRadius: BorderRadius.circular(30),
                        border: Border.all(color: theme.dividerColor),
                      ),
                      child: Row(
                        children: [
                          Text(
                            'Admin?',
                            style: TextStyle(color: theme.colorScheme.onSurface, fontWeight: FontWeight.w600, fontSize: 14),
                          ),
                          const SizedBox(width: 8),
                          SizedBox(
                            height: 30,
                            child: Switch(
                              value: _isAdmin,
                              onChanged: (val) => setState(() => _isAdmin = val),
                              activeColor: theme.scaffoldBackgroundColor,
                              activeTrackColor: theme.primaryColor,
                            ),
                          ),
                        ],
                      ),
                    ),
                    
                    // Main Login Action Button
                    ElevatedButton(
                      onPressed: _handleLogin,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: theme.primaryColor,
                        foregroundColor: Colors.white, 
                        padding: const EdgeInsets.symmetric(horizontal: 36, vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        elevation: 8,
                        shadowColor: theme.primaryColor.withOpacity(0.5),
                      ),
                      child: const Text('Login', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 1)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Helper widget to generate uniformly styled input fields.
  Widget _buildTextField({
    required TextEditingController controller, 
    required String hintText, 
    required IconData icon, 
    bool obscureText = false,
  }) {
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

// ==========================================
// USER SPACE
// ==========================================
/// Primary landing hub for regular users, providing navigation across Home, Vehicle, and Profile.
class UserSpace extends StatefulWidget {
  const UserSpace({super.key});

  @override
  State<UserSpace> createState() => _UserSpaceState();
}

class _UserSpaceState extends State<UserSpace> {
  // Tracks active bottom navigation tab: 0 = Home, 1 = Vehicle, 2 = Profile
  int _currentIndex = 0;

  /// Logs the user out and sends them back to the login screen.
  void _logout(BuildContext context) {
    Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => const LoginPage()));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        // Logout button
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => _logout(context), tooltip: 'Logout'),
        
        // Embedded search bar in the app bar title area
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
        
        // Top-right overflow menu for secondary screens
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
      
      // Dynamic body content rendered based on the selected tab
      body: _buildBodyContent(),
      
      // Bottom Navigation Bar to switch between main user views
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

  /// Switches body content based on the active bottom navigation bar index.
  Widget _buildBodyContent() {
    switch (_currentIndex) {
      case 0:
        return AnimatedAddCard(
          title: 'No Locations Found',
          subtitle: 'Tap to add a new parking space',
          onTap: () => print("Add Space Tapped"),
        );
      case 1:
        return AnimatedAddCard(
          title: 'No Vehicle Found',
          subtitle: 'Tap to add a new vehicle to your account',
          onTap: () => print("Add Vehicle Tapped"),
        );
      case 2:
        return AnimatedAddCard(
          title: 'Profile Incomplete',
          subtitle: 'Tap to add your contact information',
          onTap: () => print("Add Contact Info Tapped"),
        );
      default:
        return Container();
    }
  }
}

// ==========================================
// USER SPECIFIC PAGES
// ==========================================
/// Settings page for regular users: allows toggling theme and notifications.
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
          // Theme switcher tile
          ListTile(
            leading: Icon(Icons.dark_mode, color: theme.primaryColor),
            title: Text('Dark Mode', style: TextStyle(color: theme.colorScheme.onSurface)),
            trailing: Switch(
              value: themeNotifier.value == ThemeMode.dark,
              onChanged: (val) {
                // Instantly flips the entire app theme
                themeNotifier.value = val ? ThemeMode.dark : ThemeMode.light;
              },
              activeColor: theme.scaffoldBackgroundColor,
              activeTrackColor: theme.primaryColor,
            ),
          ),
          
          // Notifications toggle tile
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
          
          // Contact support navigation tile
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

/// Informational page presenting system overview and version metadata.
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
// ADMIN DASHBOARD
// ==========================================
/// Administrative operations hub containing user management, profiles, and plot overview.
class AdminDashboard extends StatefulWidget {
  const AdminDashboard({super.key});

  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard> {
  // Tracks active admin tab: 0 = User Mgmt, 1 = Profile, 2 = Plots
  int _currentIndex = 0;

  /// Logs the admin out and returns to the login screen.
  void _logout(BuildContext context) {
    Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => const LoginPage()));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        // Logout button
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => _logout(context), tooltip: 'Logout'),
        
        // Styled title highlighting administrative scope
        title: RichText(
          text: TextSpan(
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            children: [
              TextSpan(text: 'Admin ', style: TextStyle(color: theme.colorScheme.onSurface)),
              TextSpan(text: 'Dashboard', style: TextStyle(color: theme.primaryColor)),
            ],
          ),
        ),
        centerTitle: true,
        
        // Overflow menu with links to Admin Settings and System Info
        actions: [
          PopupMenuButton<String>(
            icon: Icon(Icons.more_vert, color: theme.primaryColor),
            color: theme.cardColor,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            offset: const Offset(0, 50),
            onSelected: (value) {
              if (value == 'settings') {
                Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminSettingsPage()));
              } else if (value == 'about') {
                Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminAboutPage()));
              }
            },
            itemBuilder: (context) => [
              PopupMenuItem<String>(
                value: 'settings',
                child: Row(
                  children: [
                    Icon(Icons.settings, color: theme.colorScheme.onSurfaceVariant, size: 20),
                    const SizedBox(width: 12),
                    Text('Admin Settings', style: TextStyle(color: theme.colorScheme.onSurface)),
                  ],
                ),
              ),
              PopupMenuItem<String>(
                value: 'about',
                child: Row(
                  children: [
                    Icon(Icons.info_outline, color: theme.colorScheme.onSurfaceVariant, size: 20),
                    const SizedBox(width: 12),
                    Text('About System', style: TextStyle(color: theme.colorScheme.onSurface)),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      
      // Central placeholder view displaying the active tab's title
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.admin_panel_settings_outlined, size: 80, color: theme.primaryColor.withOpacity(0.5)),
            const SizedBox(height: 20),
            Text(
              _getTabTitle(_currentIndex),
              style: TextStyle(fontSize: 22, color: theme.colorScheme.onSurface, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'No data available yet.',
              style: TextStyle(fontSize: 16, color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
      
      // Administrative Bottom Navigation Bar
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        type: BottomNavigationBarType.fixed,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.manage_accounts), label: 'User Mgmt'),
          BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
          BottomNavigationBarItem(icon: Icon(Icons.map), label: 'Plots'),
        ],
      ),
    );
  }

  /// Maps the selected bottom navigation index to a display header.
  String _getTabTitle(int index) {
    switch (index) {
      case 0: return 'User Management Area';
      case 1: return 'Admin Profile Area';
      case 2: return 'Plot Management Area';
      default: return '';
    }
  }
}

// ==========================================
// ADMIN SPECIFIC PAGES
// ==========================================
/// Settings page specifically tailored for administrative configurations.
class AdminSettingsPage extends StatelessWidget {
  const AdminSettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Admin Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16.0),
        children: [
          // Global Theme Switcher
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
          
          // System Alert Notifications Toggle
          ListTile(
            leading: Icon(Icons.notifications_active, color: theme.primaryColor),
            title: Text('System Alerts', style: TextStyle(color: theme.colorScheme.onSurface)),
            trailing: Switch(
              value: true,
              onChanged: (val) {},
              activeColor: theme.scaffoldBackgroundColor,
              activeTrackColor: theme.primaryColor,
            ),
          ),
          
          // Audit Log Inspection Tile
          ListTile(
            leading: Icon(Icons.admin_panel_settings, color: theme.primaryColor),
            title: Text('Access Control Logs', style: TextStyle(color: theme.colorScheme.onSurface)),
            trailing: Icon(Icons.arrow_forward_ios, color: theme.colorScheme.onSurfaceVariant, size: 16),
            onTap: () {},
          ),
        ],
      ),
    );
  }
}

/// About page covering admin console infrastructure notes and versioning.
class AdminAboutPage extends StatelessWidget {
  const AdminAboutPage({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('About System')),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.security, color: theme.primaryColor, size: 60),
            const SizedBox(height: 20),
            Text(
              'Smart Curb Admin Console. This secure environment is designed to monitor overall smart city infrastructure, manage user accounts, and oversee plot assignments.',
              style: TextStyle(color: theme.colorScheme.onSurfaceVariant, height: 1.5, fontSize: 16),
            ),
            const SizedBox(height: 30),
            Divider(color: theme.dividerColor),
            const SizedBox(height: 10),
            Text(
              'Version: 1.0.0 (Beta) - Admin Console',
              style: TextStyle(color: theme.primaryColor, fontWeight: FontWeight.bold, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }
}

// ==========================================
// CUSTOM ANIMATED INTERACTIVE CARD
// ==========================================
/// A reusable empty-state card featuring custom scale animations and neon glow effects on press.
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
  // Tracks whether the card is currently being held down by the user
  bool _isPressed = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        // Intercepts touch gestures to produce custom squeeze and glow animations
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
            // Shrinks slightly when pressed to give physical button-press feedback
            transform: Matrix4.identity()..scale(_isPressed ? 0.95 : 1.0),
            transformAlignment: Alignment.center,
            decoration: BoxDecoration(
              color: theme.cardColor,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: _isPressed ? theme.primaryColor.withOpacity(0.6) : theme.dividerColor, 
                width: 2,
              ),
              // Elevates with a colored glow outline when pressed
              boxShadow: _isPressed
                  ? [BoxShadow(color: theme.primaryColor.withOpacity(0.15), blurRadius: 20, spreadRadius: 2)]
                  : [],
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Inset circular icon button with dynamic ambient neon shadow
                AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: theme.scaffoldBackgroundColor, // Creates a nice inset look
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
                
                // Primary action title
                Text(
                  widget.title,
                  style: TextStyle(color: theme.colorScheme.onSurface, fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                
                // Explanatory subtitle
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
