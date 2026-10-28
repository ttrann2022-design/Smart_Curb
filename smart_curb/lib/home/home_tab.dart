// Home tab: saved places, place logos, the add-location dialog.
part of '../main.dart';

// ==========================================
// TAB 1: HOME (Places & Campus Management)
// ==========================================

/// A place's 52 px logo tile: its logo image when it has one (the whole
/// logo, on its own background colour), otherwise [shortName] as text.
Widget buildCampusLogo(String shortName, {Place? place}) {
  const size = 52.0;
  final text = Center(
    child: Text(
      shortName,
      style: mono(fontSize: 15, color: kAccent, letterSpacing: 0.8),
    ),
  );
  final logo = place?.logoAsset;
  return Container(
    width: size,
    height: size,
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      color: logo == null ? kCardAlt : place!.logoBackground,
      borderRadius: BorderRadius.circular(kRadius),
      border: Border.all(color: kDivider),
    ),
    child: logo == null
        ? text
        : Padding(
            padding: const EdgeInsets.all(3),
            child: Image.asset(
              logo,
              fit: BoxFit.contain,
              // The FAU file is 3840 px wide: decode it tile-sized.
              cacheWidth: 200,
              filterQuality: FilterQuality.medium,
              // Missing or broken file: the text tile, on the usual colour.
              errorBuilder: (_, _, _) =>
                  ColoredBox(color: kCardAlt, child: text),
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
  /// Every place users can add (see [Place.all]).
  static final List<Map<String, String>> _availableCampuses = [
    for (final p in Place.all)
      {
        'id': p.id,
        'shortName': p.shortName,
        'fullName': p.fullName,
        'address': p.address,
      },
  ];

  // Stream is created once instead of on every build (avoids re-subscribing).
  late final String? _uid = FirebaseAuth.instance.currentUser?.uid;
  late final Stream<DatabaseEvent>? _stream = _uid == null
      ? null
      : FirebaseDatabase.instance.ref('drivers/$_uid/locations').onValue;

  void _addCampus(Map<String, String> campus) {
    final uid = _uid;
    final place = Place.byId(campus['id']!);
    if (uid == null || place == null) return;
    FirebaseDatabase.instance
        .ref('drivers/$uid/locations/${place.id}')
        .set(savedPlaceEntry(place));
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
          return const FadeSwitcher(
            child: Center(
              key: ValueKey('loading'),
              child: CircularProgressIndicator(),
            ),
          );
        }

        final rawData = snapshot.data?.snapshot.value;
        final locations = <String, Map<String, dynamic>>{
          if (rawData is Map)
            for (final entry in rawData.entries)
              if (entry.value is Map)
                entry.key.toString():
                    Map<String, dynamic>.from(entry.value as Map),
        };
        _addedIds = locations.keys.toSet();
        final visible = locations.entries
            .where((e) => matchesLocationQuery(e.value, _query))
            .toList();

        // Always the same list, even with no places left, so the last card
        // swipes away like the others before the empty card takes over.
        return FadeSwitcher(
          child: _ListWithBottomAction(
          key: const ValueKey('list'),
          // Deleted places swipe away to the left.
          swipeOut: true,
          isEmpty: locations.isEmpty,
          empty: AnimatedAddCard(
            title: 'No Locations Found',
            subtitle: 'Tap to add a new location',
            onTap: _showAddSpaceDialog,
          ),
          actionTitle: 'Add more locations',
          actionIcon: Icons.add_location_alt_outlined,
          onAction: _showAddSpaceDialog,
          children: [
            AppTextField(
              key: const ValueKey('search'),
              controller: _searchCtrl,
              hintText: 'Search your locations',
              icon: Icons.search,
              onChanged: (v) => setState(() => _query = v),
            ),
            const SizedBox(key: ValueKey('search-gap'), height: 16),
            for (final e in visible) _buildLocationCard(uid, e.key, e.value),
            if (visible.isEmpty && locations.isNotEmpty)
              Padding(
                key: const ValueKey('no-match'),
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Text(
                  'No saved locations match "${_query.trim()}".',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: kTextMuted, fontSize: 13),
                ),
              ),
          ],
          ),
        );
      },
    );
  }

  Widget _buildLocationCard(String uid, String locKey, Map<String, dynamic> data) {
    final place = Place.byId(locKey);
    final shortName = data['shortName']?.toString() ?? place?.shortName ?? '?';
    final fullName = data['fullName']?.toString() ?? place?.fullName ?? locKey;
    final address = data['address']?.toString() ?? place?.address ?? '';

    return Padding(
      key: ValueKey('loc-$locKey'),
      padding: const EdgeInsets.only(bottom: 12.0),
      child: PressScale(
        child: InkWell(
        borderRadius: BorderRadius.circular(kRadius),
        onTap: () {
          if (place == null) {
            showErrorSnackBar(context, 'This location is no longer available.');
            return;
          }
          Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => PlaceMapScreen(place: place)),
          );
        },
        child: Container(
          padding: const EdgeInsets.all(16.0),
          decoration: BoxDecoration(
            color: kCard,
            borderRadius: BorderRadius.circular(kRadius),
            border: Border.all(color: kDivider),
          ),
          child: Row(
            children: [
              buildCampusLogo(shortName, place: place),
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

  /// The campus being added: its button turns into a check and its card
  /// lights up for a moment before the dialog closes.
  String? _addingId;
  static const Duration _addConfirm = Duration(milliseconds: 420);

  void _add(Map<String, String> campus) {
    if (_addingId != null) return;
    setState(() => _addingId = campus['id']);
    final wait = reduceMotion(context) ? Duration.zero : _addConfirm;
    Future.delayed(wait, () {
      if (!mounted) return;
      Navigator.of(context).pop();
      widget.onAdd(campus);
    });
  }

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
            // Rows rise in when the dialog opens, fold away or grow in as you
            // search, and recede under the edges as they scroll.
            Expanded(
              child: AnimatedRowList(
                springy: true,
                isEmpty: emptyText != null,
                empty: Padding(
                  padding: const EdgeInsets.only(top: 24),
                  child: Text(
                    emptyText ?? '',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: kTextMuted, fontSize: 13),
                  ),
                ),
                children: [for (final c in results) _buildCampusRow(c)],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCampusRow(Map<String, String> campus) {
    final adding = _addingId == campus['id'];
    return AnimatedContainer(
      key: ValueKey('campus-${campus['id']}'),
      duration: kMotion,
      curve: kEaseOut,
      margin: const EdgeInsets.only(bottom: 12.0),
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: adding ? kNavBg : kBg,
        borderRadius: BorderRadius.circular(kRadius),
        border: Border.all(color: adding ? kAccent : kDivider),
      ),
      child: Row(
        children: [
          buildCampusLogo(
            campus['shortName']!,
            place: Place.byId(campus['id']!),
          ),
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
          PressScale(
            child: ElevatedButton(
              onPressed: () => _add(campus),
              style: ElevatedButton.styleFrom(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              ),
              // "Add" pops into a check when tapped.
              child: AnimatedSwitcher(
                duration: kMotion,
                transitionBuilder: (child, anim) => FadeTransition(
                  opacity: anim,
                  child: ScaleTransition(
                    scale: Tween(begin: 0.4, end: 1.0).animate(
                      CurvedAnimation(parent: anim, curve: Curves.easeOutBack),
                    ),
                    child: child,
                  ),
                ),
                child: adding
                    ? const Icon(Icons.check, key: ValueKey('added'), size: 18)
                    : const Text('Add', key: ValueKey('add')),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
