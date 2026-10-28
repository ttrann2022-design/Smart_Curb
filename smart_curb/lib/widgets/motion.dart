// Animations: entrances, press feedback, live pulse, fades.
part of '../main.dart';

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

  /// Asked once, when first built; false just shows the child (e.g. a list
  /// row that merely scrolled into view, which should sit still where it
  /// is). Always animates when not given.
  final ValueGetter<bool>? animateIf;

  const FadeSlideIn({
    super.key,
    required this.child,
    this.index = 0,
    this.offsetY = 14,
    this.duration = kMotionSlow,
    this.animateIf,
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
    if (!(widget.animateIf?.call() ?? true) || reduceMotion(context)) {
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

/// A list row that comes and goes smoothly: with [growIn] (a row just added
/// to the list) it grows open, so the rows below slide down; when [present]
/// turns false it fades and collapses, the rows below sliding up, then calls
/// [onGone]. With [swipeOut] it leaves faster, swiped off to the left first.
class CollapsibleRow extends StatefulWidget {
  final Widget child;
  final bool present;
  final VoidCallback? onGone;
  final bool swipeOut;

  /// Asked once, when the row is first built: true only for a row that is
  /// new to the list. Never for one a lazy list merely built because it
  /// scrolled into view: a row growing from nothing changes the list's
  /// length mid-scroll, which made it jump.
  final ValueGetter<bool>? growIn;

  const CollapsibleRow({
    super.key,
    required this.child,
    this.present = true,
    this.onGone,
    this.swipeOut = false,
    this.growIn,
  });

  @override
  State<CollapsibleRow> createState() => _CollapsibleRowState();
}

class _CollapsibleRowState extends State<CollapsibleRow>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: kMotion, value: 1);
  late final Animation<double> _size = CurvedAnimation(
    parent: _c,
    curve: Curves.easeOutCubic,
    reverseCurve: Curves.easeInOutCubic,
  );
  bool _started = false;

  /// Swiping out: the whole exit, the share of it spent sliding off to the
  /// left, and where the gap starts closing (overlapping the slide's end).
  static const Duration _swipeExit = Duration(milliseconds: 250);
  static const double _swipePart = 0.65;
  static const double _closeFrom = 0.5;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduce = reduceMotion(context);
    _c.duration = reduce ? Duration.zero : kMotion;
    _c.reverseDuration =
        reduce ? Duration.zero : (widget.swipeOut ? _swipeExit : kMotion);
    if (_started) return;
    _started = true;
    if (!widget.present) {
      // Built only after it was removed (it was off screen until now): it's
      // already gone, so it never shows.
      _c.value = 0;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && !widget.present) widget.onGone?.call();
      });
    } else if (widget.growIn?.call() ?? false) {
      _c.forward(from: 0);
    }
  }

  @override
  void didUpdateWidget(CollapsibleRow old) {
    super.didUpdateWidget(old);
    if (widget.present == old.present) return;
    if (widget.present) {
      _c.forward();
    } else {
      _c.reverse().whenCompleteOrCancel(() {
        if (mounted && !widget.present) widget.onGone?.call();
      });
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // One widget structure for every phase, so the row's content keeps its
    // state (and doesn't replay its entrance) when it starts leaving.
    return AnimatedBuilder(
      animation: _c,
      // A leaving row can't be tapped again while it collapses.
      child: IgnorePointer(ignoring: !widget.present, child: widget.child),
      builder: (context, child) {
        var height = _size.value;
        var opacity = _c.value;
        var slide = 0.0;
        if (widget.swipeOut && !widget.present) {
          final gone = 1 - _c.value; // 0 -> 1 over the exit
          // Flicked off to the left, picking up speed as it goes...
          final swipe =
              Curves.easeInCubic.transform((gone / _swipePart).clamp(0.0, 1.0));
          slide = -1.1 * swipe;
          // Solid for most of the slide, fading only at the end, so no
          // see-through ghost of the card trails behind.
          opacity = 1 - ((swipe - 0.6) / 0.4).clamp(0.0, 1.0);
          // ...then the gap closes, the rows below gliding up and easing to
          // a soft stop.
          final close = ((gone - _closeFrom) / (1 - _closeFrom)).clamp(0.0, 1.0);
          height = 1 - Curves.easeOutCubic.transform(close);
        }
        // Not clipped, so a swiped row slides off the screen edge rather
        // than vanishing at its own edge.
        final row = Align(
          alignment: Alignment.topCenter,
          heightFactor: height.clamp(0.0, 1.0),
          child: Opacity(
            opacity: opacity.clamp(0.0, 1.0),
            child: FractionalTranslation(
              translation: Offset(slide, 0),
              child: child,
            ),
          ),
        );
        return widget.swipeOut ? row : ClipRect(child: row);
      },
    );
  }
}

/// Cross-fades between the states of a screen (loading, empty, list)
/// instead of swapping them in one frame: deleting the last car fades the
/// list out as the "add" card fades in. Give each state's widget its own
/// key.
class FadeSwitcher extends StatelessWidget {
  final Widget child;
  final Duration duration;

  const FadeSwitcher({super.key, required this.child, this.duration = kMotion});

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: reduceMotion(context) ? Duration.zero : duration,
      switchInCurve: kEaseOut,
      switchOutCurve: Curves.easeInCubic,
      child: child,
    );
  }
}

/// Marks when a list first appeared, so [FadeSlideIn] can tell the opening
/// stagger apart from items that scroll into view later.
class StaggerScope extends InheritedWidget {
  final DateTime openedAt;

  const StaggerScope({super.key, required this.openedAt, required super.child});

  /// How long after opening its rows still count as part of the opening.
  static const Duration openingWindow = Duration(milliseconds: 700);

  bool get isOpening => DateTime.now().difference(openedAt) < openingWindow;

  static StaggerScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<StaggerScope>();

  @override
  bool updateShouldNotify(StaggerScope old) => old.openedAt != openedAt;
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
