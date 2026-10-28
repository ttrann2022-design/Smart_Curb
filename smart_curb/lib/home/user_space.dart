// The signed-in main screen: Home / Vehicle / Profile tabs, menu, chat bubble.
part of '../main.dart';

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

  /// The assistant conversation: kept while signed in, so reopening the
  /// chat picks up where it left off.
  final ChatSession _chat = ChatSession();

  Future<void> _openChat() async {
    final tab = await openAssistantChat(context, _chat);
    // A reply's "Go to Vehicles" etc. comes back as the tab to show.
    if (tab != null && mounted) setState(() => _currentIndex = tab);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // Smart Curb AI, on every tab.
      floatingActionButton: AssistantBubble(onTap: _openChat),
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
