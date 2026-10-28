// Vehicle tab: the list of cars and their details.
part of '../main.dart';

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
              if (uid == null) return;
              // After the dialog has faded away, so the card's swipe-out
              // plays in full view instead of behind it.
              final wait = reduceMotion(context) ? Duration.zero : kMotion;
              Future.delayed(wait, () {
                FirebaseDatabase.instance
                    .ref('drivers/$uid/vehicles/$key')
                    .remove();
              });
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
          return FadeSwitcher(
            child: Center(
              key: const ValueKey('error'),
              child: Text(
                'Error: ${snapshot.error}',
                style: const TextStyle(color: kRed),
              ),
            ),
          );
        }
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const FadeSwitcher(
            child: Center(
              key: ValueKey('loading'),
              child: CircularProgressIndicator(),
            ),
          );
        }

        final rawData = snapshot.data?.snapshot.value;
        final cards = [
          if (rawData is Map)
            for (final entry in rawData.entries)
              if (entry.value is Map)
                _buildVehicleCard(
                  entry.key.toString(),
                  Map<String, dynamic>.from(entry.value as Map),
                ),
        ];

        // Always the same list, even with no cars left, so the last card
        // swipes away like the others before the empty card takes over.
        return FadeSwitcher(
          child: _ListWithBottomAction(
            key: const ValueKey('list'),
            // Deleted cars swipe away to the left.
            swipeOut: true,
            isEmpty: cards.isEmpty,
            empty: AnimatedAddCard(
              title: 'No Vehicle Found',
              subtitle: 'Tap to add a new vehicle to your account',
              onTap: _openAddVehicleDialog,
            ),
            actionTitle: 'Add more vehicle',
            actionIcon: Icons.add,
            onAction: _openAddVehicleDialog,
            children: cards,
          ),
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
