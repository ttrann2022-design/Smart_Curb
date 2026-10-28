// The animated list used by Home and Vehicle (rows slide in and swipe out).
part of '../main.dart';

/// A scrolling list whose rows come and go smoothly. They rise in one after
/// another when it opens; rows added later grow in and removed ones (deleted,
/// filtered out by a search) collapse away, or swipe off with [swipeOut].
/// With [springy], rows trail a little behind as it scrolls and catch up
/// (see [ScrollSpring]). Rows are matched by key (unkeyed ones by position),
/// and the list builds them lazily, so wrap an expensive row in a [Builder].
class AnimatedRowList extends StatefulWidget {
  final List<Widget> children;

  /// After the rows, rising in with them (not animated in or out).
  final List<Widget> footer;

  final bool swipeOut;

  /// Nothing to list: [empty] is shown instead, once removed rows have
  /// finished leaving (so the last one animates out like any other).
  final bool isEmpty;
  final Widget? empty;

  final bool springy;

  /// When this changes (e.g. the search text), the list glides back to the
  /// top, so the best matches are in view.
  final Object? scrollToTopOn;

  /// A hairline between rows.
  final bool divided;

  final bool shrinkWrap;
  final ScrollPhysics physics;
  final EdgeInsetsGeometry padding;

  /// When the list opened (for the stagger); defaults to when it was built.
  final DateTime? openedAt;

  /// The rows' entrance (see [FadeSlideIn]).
  final double entranceOffset;
  final Duration entranceDuration;

  /// See [SmoothScroll].
  final double fade;
  final bool alwaysShowThumb;

  const AnimatedRowList({
    super.key,
    required this.children,
    this.footer = const [],
    this.swipeOut = false,
    this.isEmpty = false,
    this.empty,
    this.springy = false,
    this.scrollToTopOn,
    this.divided = false,
    this.shrinkWrap = false,
    this.physics = kScrollPhysics,
    this.padding = EdgeInsets.zero,
    this.openedAt,
    this.entranceOffset = 14,
    this.entranceDuration = kMotionSlow,
    this.fade = 18,
    this.alwaysShowThumb = false,
  });

  @override
  State<AnimatedRowList> createState() => _AnimatedRowListState();
}

class _AnimatedRowListState extends State<AnimatedRowList> {
  late final DateTime _openedAt = widget.openedAt ?? DateTime.now();
  final GlideWheelScrollController _scroll = GlideWheelScrollController();

  @override
  void dispose() {
    _sweep?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  /// The rows on screen: the current children plus removed ones that are
  /// still leaving.
  late List<_ListRow> _rows = _fresh(widget.children);

  /// A row's identity: its widget key, or (unkeyed) its position.
  static List<_ListRow> _fresh(List<Widget> children) => [
        for (var i = 0; i < children.length; i++)
          _ListRow(children[i].key ?? ValueKey<int>(i), children[i]),
      ];

  /// Rows added to the list after it opened, and when: they grow in and
  /// fade up, but only right after being added. A row built later only
  /// because it scrolled into view just appears, still, at full size.
  final Map<Key, DateTime> _addedAt = {};
  static const Duration _addedWindow = Duration(milliseconds: 600);

  /// A removed row normally drops itself once its exit animation ends, but
  /// one that's off screen was never built and never animates. So once an
  /// exit's time is up, every row still leaving is dropped regardless;
  /// otherwise they'd linger in the list as leftovers.
  Timer? _sweep;
  static const Duration _exitTime = Duration(milliseconds: 400);

  void _sweepLeftovers() {
    _sweep?.cancel();
    _sweep = Timer(_exitTime, () {
      if (!mounted || !_rows.any((r) => r.leaving)) return;
      setState(() => _rows.removeWhere((r) => r.leaving));
    });
  }

  bool _justAdded(Key key) {
    final at = _addedAt[key];
    return at != null && DateTime.now().difference(at) < _addedWindow;
  }

  @override
  void didUpdateWidget(AnimatedRowList old) {
    super.didUpdateWidget(old);
    final rows = _fresh(widget.children);
    final now = DateTime.now();
    final had = {for (final r in _rows) r.key};
    _addedAt.removeWhere((_, at) => now.difference(at) >= _addedWindow);
    for (final r in rows) {
      if (!had.contains(r.key)) _addedAt[r.key] = now;
    }
    final kept = {for (final r in rows) r.key};
    // A removed row stays where it was (after the row it used to follow)
    // and leaves from there, so the rows below slide up instead of jumping.
    for (var i = 0; i < _rows.length; i++) {
      final old = _rows[i];
      if (kept.contains(old.key)) continue;
      var at = 0;
      for (var j = i - 1; j >= 0; j--) {
        final before = rows.indexWhere((r) => r.key == _rows[j].key);
        if (before >= 0) {
          at = before + 1;
          break;
        }
      }
      rows.insert(at, _ListRow(old.key, old.child, leaving: true));
    }
    final newlyLeaving = rows.any(
      (r) => r.leaving && !_rows.any((o) => o.key == r.key && o.leaving),
    );
    _rows = rows;
    if (newlyLeaving) _sweepLeftovers();

    if (widget.scrollToTopOn != old.scrollToTopOn &&
        _scroll.hasClients &&
        _scroll.offset > 0) {
      if (reduceMotion(context)) {
        _scroll.jumpTo(0);
      } else {
        _scroll.animateTo(0, duration: kMotion, curve: kEaseOut);
      }
    }
  }

  void _drop(Key key) {
    if (!mounted) return;
    setState(() => _rows.removeWhere((r) => r.leaving && r.key == key));
  }

  @override
  Widget build(BuildContext context) {
    final empty = widget.empty;
    final showEmpty =
        widget.isEmpty && empty != null && !_rows.any((r) => r.leaving);
    // Quick, so what's left of the list doesn't linger behind the empty
    // state (or the other way round).
    return FadeSwitcher(
      duration: kMotionFast,
      child: showEmpty
          ? KeyedSubtree(key: const ValueKey('empty'), child: empty)
          : KeyedSubtree(key: const ValueKey('list'), child: _buildList()),
    );
  }

  Widget _buildList() {
    final rows = _rows;
    final footer = widget.footer;
    // Rows rise in one after another when the list opens, and rows added
    // later grow in. The list builds rows lazily, so a row is also built
    // when it first scrolls into view; that one just appears, at full size,
    // so nothing moves or changes length under the scroll.
    bool opening() => DateTime.now().difference(_openedAt) <
        StaggerScope.openingWindow;
    return StaggerScope(
      openedAt: _openedAt,
      child: SmoothScroll(
        controller: _scroll,
        fade: widget.fade,
        alwaysShowThumb: widget.alwaysShowThumb,
        child: ListView(
          shrinkWrap: widget.shrinkWrap,
          physics: widget.physics,
          padding: widget.padding,
          children: [
            // Callbacks hold the row's own key, never its index: rows come
            // and go, so an index captured now points at another row (or
            // past the end) by the time a callback runs.
            for (final (i, row) in rows.indexed)
              CollapsibleRow(
                key: row.key,
                present: !row.leaving,
                swipeOut: widget.swipeOut,
                onGone: () => _drop(row.key),
                growIn: () => _justAdded(row.key),
                child: FadeSlideIn(
                  index: i,
                  offsetY: widget.entranceOffset,
                  duration: widget.entranceDuration,
                  animateIf: () => opening() || _justAdded(row.key),
                  child: _decorate(i, row.child),
                ),
              ),
            for (var j = 0; j < footer.length; j++)
              FadeSlideIn(
                index: rows.length + j,
                offsetY: widget.entranceOffset,
                duration: widget.entranceDuration,
                animateIf: opening,
                child: footer[j],
              ),
          ],
        ),
      ),
    );
  }

  Widget _decorate(int i, Widget row) {
    if (widget.divided) {
      // Always there (clear above the first row), so a row keeps its
      // content's state when it moves to or from the top.
      row = Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Divider(height: 1, color: i == 0 ? Colors.transparent : null),
          row,
        ],
      );
    }
    return widget.springy ? ScrollSpring(child: row) : row;
  }
}

class _ListRow {
  final Key key;
  final Widget child;
  final bool leaving;
  const _ListRow(this.key, this.child, {this.leaving = false});
}
