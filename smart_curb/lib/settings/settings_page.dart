// The Settings page.
part of '../main.dart';

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
                      _notifRef == null ? null : (val) => _notifRef.set(val),
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
