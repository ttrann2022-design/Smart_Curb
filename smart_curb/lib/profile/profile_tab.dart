// Profile tab: the user's contact information.
part of '../main.dart';

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
      : FirebaseDatabase.instance.ref('drivers/${_user.uid}/profile').onValue;

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
          return const FadeSwitcher(
            child: Center(
              key: ValueKey('loading'),
              child: CircularProgressIndicator(),
            ),
          );
        }

        final rawData = snapshot.data?.snapshot.value;
        if (rawData is! Map || rawData['firstName'] == null) {
          return FadeSwitcher(
            child: AnimatedAddCard(
              key: const ValueKey('empty'),
              title: 'Profile Incomplete',
              subtitle: 'Tap to add your contact information',
              onTap: _openContactDialog,
            ),
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

        return FadeSwitcher(
          child: _ListWithBottomAction(
          key: const ValueKey('list'),
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
          ),
        );
      },
    );
  }
}
