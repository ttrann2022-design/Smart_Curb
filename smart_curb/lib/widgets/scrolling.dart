// Scrolling: physics, smooth mouse-wheel glide, edge fades.
part of '../main.dart';

/// Springy scrolling, like iOS Messages: when you drag or fling the list,
/// rows nearest the way it's moving go straight along with it, and rows
/// further back trail a little behind and catch up. The list stretches
/// slightly as it moves (rows never overlap) and settles back into a tidy
/// list the moment it stops. Mouse-wheel scrolling stays rigid.
class ScrollSpring extends StatefulWidget {
  final Widget child;

  const ScrollSpring({super.key, required this.child});

  @override
  State<ScrollSpring> createState() => _ScrollSpringState();
}

class _ScrollSpringState extends State<ScrollSpring>
    with SingleTickerProviderStateMixin {
  /// The share of each scroll step the row furthest behind trails by.
  static const double _maxLag = 0.14;

  /// Furthest a row ever trails (px).
  static const double _maxOffset = 16;

  /// How quickly a row catches up: about 63% of the way every this many
  /// seconds (no overshoot, so it settles calmly).
  static const double _catchUp = 0.09;

  ScrollPosition? _position;
  double? _lastPixels;

  /// Where the row's centre is, from the top (0) to the bottom (1) of the
  /// view, as of the last time it could be measured.
  double _down = 0.5;

  /// How far the row trails its place in the list (px, + = below it).
  double _offset = 0;
  bool _reduce = false;
  late final Ticker _ticker = createTicker(_tick);
  Duration? _lastTick;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduce = reduceMotion(context);
    final position = Scrollable.maybeOf(context)?.position;
    if (position != _position) {
      _position?.removeListener(_onScroll);
      _position = position?..addListener(_onScroll);
      _lastPixels = position?.hasPixels == true ? position!.pixels : null;
    }
  }

  @override
  void dispose() {
    _position?.removeListener(_onScroll);
    _ticker.dispose();
    super.dispose();
  }

  void _onScroll() {
    final p = _position;
    if (!mounted || p == null || !p.hasPixels) return;
    final last = _lastPixels;
    _lastPixels = p.pixels;
    if (last == null || _reduce) return;
    // Touch drags and flings only: on a mouse wheel or touchpad glide, rows
    // still catching up after the list has stopped look like it overshot
    // and got pulled back.
    if (p is _GlideWheelPosition && p.wheelGliding) return;
    final delta = p.pixels - last;
    if (delta == 0) return;
    _measure(p);
    // Scrolling down (content moving up), the top rows lead and lower rows
    // trail; scrolling up, the other way round.
    final lag = _maxLag * (delta > 0 ? _down : 1 - _down);
    _offset = (_offset + delta * lag).clamp(-_maxOffset, _maxOffset);
    if (!_ticker.isActive) {
      _lastTick = null;
      _ticker.start();
    }
  }

  /// Updates [_down]. Where the row sits in the list (fixed while scrolling)
  /// minus how far the list has scrolled, so it's right as the scroll
  /// changes, before the rows are laid out again.
  void _measure(ScrollPosition p) {
    // Mid-layout, geometry can be stale; keep the last value.
    if (SchedulerBinding.instance.schedulerPhase ==
        SchedulerPhase.persistentCallbacks) {
      return;
    }
    final box = context.findRenderObject();
    if (box is! RenderBox || !box.attached || !box.hasSize) return;
    final viewport = RenderAbstractViewport.maybeOf(box);
    if (viewport == null || !p.hasViewportDimension) return;
    final top = viewport.getOffsetToReveal(box, 0).offset - p.pixels;
    final h = p.viewportDimension;
    if (h <= 0) return;
    _down = ((top + box.size.height / 2) / h).clamp(0.0, 1.0);
  }

  void _tick(Duration now) {
    final last = _lastTick;
    _lastTick = now;
    final dt = last == null ? 1 / 60 : (now - last).inMicroseconds / 1e6;
    _offset *= math.exp(-dt / _catchUp);
    if (_offset.abs() < 0.05) {
      _offset = 0;
      _ticker.stop();
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Transform.translate(
      offset: Offset(0, _offset),
      child: widget.child,
    );
  }
}

/// Smooth, springy scrolling (iOS-style bounce on every platform), always
/// scrollable so the bounce works even when the content fits. Normal
/// deceleration: a flick glides on and eases to a stop, like iOS.
const ScrollPhysics kScrollPhysics = BouncingScrollPhysics(
  parent: AlwaysScrollableScrollPhysics(),
);

/// How quickly a wheel glide closes in on its target: about 63% of the
/// remaining distance every this many seconds (~95% within 0.27 s).
const double _wheelGlideTau = 0.09;

/// A scroll controller whose mouse-wheel and touchpad scrolling glides (see
/// [_GlideWheelPosition]). Touch and drag scrolling are unchanged.
class GlideWheelScrollController extends ScrollController {
  @override
  ScrollPosition createScrollPosition(
    ScrollPhysics physics,
    ScrollContext context,
    ScrollPosition? oldPosition,
  ) =>
      _GlideWheelPosition(
        physics: physics,
        context: context,
        initialPixels: initialScrollOffset,
        keepScrollOffset: keepScrollOffset,
        oldPosition: oldPosition,
        debugLabel: debugLabel,
      );
}

/// Mouse-wheel (and touchpad) scrolling glides instead of jumping a notch at
/// a time. There's one target, kept within the list, and the list closes in
/// on it smoothly every frame; each notch just moves the target on. So quick
/// notches (or a touchpad's stream of small steps) blend into one continuous
/// glide that never runs past the end and never restarts its motion, which
/// is what made a fresh animation per notch stutter.
class _GlideWheelPosition extends ScrollPositionWithSingleContext {
  _GlideWheelPosition({
    required super.physics,
    required super.context,
    super.initialPixels,
    super.keepScrollOffset,
    super.oldPosition,
    super.debugLabel,
  });

  /// True while a wheel glide is moving the list (see [ScrollSpring]).
  bool get wheelGliding => activity is _WheelGlideActivity;

  @override
  void pointerScroll(double delta) {
    final reduce = WidgetsBinding
        .instance.platformDispatcher.accessibilityFeatures.disableAnimations;
    if (delta == 0 || reduce) {
      super.pointerScroll(delta);
      return;
    }
    final current = activity;
    final from = current is _WheelGlideActivity ? current.target : pixels;
    final target = (from + delta).clamp(minScrollExtent, maxScrollExtent);
    if (current is _WheelGlideActivity) {
      current.target = target;
    } else if (target != pixels) {
      beginActivity(
          _WheelGlideActivity(this, vsync: context.vsync, target: target));
    }
  }
}

/// Moves the list toward [target] a little every frame (see
/// [_GlideWheelPosition]), going idle once it's there.
class _WheelGlideActivity extends ScrollActivity {
  _WheelGlideActivity(
    _GlideWheelPosition super.delegate, {
    required TickerProvider vsync,
    required this.target,
  }) : _position = delegate {
    _ticker = vsync.createTicker(_tick)..start();
  }

  final _GlideWheelPosition _position;
  double target;
  late final Ticker _ticker;
  Duration? _lastTick;
  double _velocity = 0;

  void _tick(Duration now) {
    final last = _lastTick;
    _lastTick = now;
    final dt = last == null ? 1 / 60 : (now - last).inMicroseconds / 1e6;
    if (dt <= 0) return;
    final pixels = _position.pixels;
    final left = target - pixels;
    if (left.abs() < 0.5) {
      _velocity = 0;
      delegate.setPixels(target);
      delegate.goIdle();
      return;
    }
    final next = pixels + left * (1 - math.exp(-dt / _wheelGlideTau));
    _velocity = (next - pixels) / dt;
    // Ran into an end (the list got shorter mid-glide): stop there.
    if (delegate.setPixels(next) != 0) delegate.goIdle();
  }

  @override
  bool get shouldIgnorePointer => false;

  @override
  bool get isScrolling => true;

  @override
  double get velocity => _velocity;

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }
}

/// Polished scroll container: slim themed scrollbar, soft fades at the top
/// and bottom edges so content melts away instead of being cut off (only at
/// an edge with more beyond it, so nothing fades when it all fits), and a
/// gliding mouse wheel. [child] is a scroll view without its own controller
/// (it picks this one up).
class SmoothScroll extends StatefulWidget {
  final Widget child; // a scroll view
  final double fade;
  final bool alwaysShowThumb;

  /// To scroll the list from outside; one is made if not given.
  final GlideWheelScrollController? controller;

  const SmoothScroll({
    super.key,
    required this.child,
    this.fade = 18,
    this.alwaysShowThumb = false,
    this.controller,
  });

  @override
  State<SmoothScroll> createState() => _SmoothScrollState();
}

class _SmoothScrollState extends State<SmoothScroll> {
  GlideWheelScrollController? _own;

  GlideWheelScrollController get _controller =>
      widget.controller ?? (_own ??= GlideWheelScrollController());

  @override
  void dispose() {
    _own?.dispose();
    super.dispose();
  }

  /// How deep (px) to fade an edge with [hidden] px of content beyond it:
  /// growing over the first [SmoothScroll.fade] px of scrolling, so the fade
  /// eases in rather than snapping on.
  double _fadeFor(double hidden) {
    final fade = widget.fade;
    return fade <= 0 ? 0 : fade * (hidden / fade).clamp(0.0, 1.0);
  }

  @override
  Widget build(BuildContext context) {
    // Every platform, not just phones, so web and desktop get the glide too.
    return PrimaryScrollController(
      controller: _controller,
      automaticallyInheritForPlatforms: TargetPlatform.values.toSet(),
      child: Scrollbar(
        controller: _controller,
        thumbVisibility: widget.alwaysShowThumb,
        // Rows coming or going change what's hidden without any scrolling;
        // re-check the edges then too.
        child: NotificationListener<ScrollMetricsNotification>(
          onNotification: (_) {
            if (mounted) setState(() {});
            return false;
          },
          child: AnimatedBuilder(
            animation: _controller,
            child: widget.child,
            builder: (context, child) {
              final p = _controller.hasClients &&
                      _controller.position.hasContentDimensions
                  ? _controller.position
                  : null;
              final top = p == null ? 0.0 : _fadeFor(p.extentBefore);
              final bottom = p == null ? 0.0 : _fadeFor(p.extentAfter);
              return ShaderMask(
                blendMode: BlendMode.dstIn,
                shaderCallback: (rect) {
                  final h = rect.height <= 0 ? 1.0 : rect.height;
                  final t = (top / h).clamp(0.0, 0.5);
                  final b = (bottom / h).clamp(0.0, 0.5);
                  return LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: const [
                      Colors.transparent,
                      Colors.black,
                      Colors.black,
                      Colors.transparent,
                    ],
                    stops: [0, t, 1 - b, 1],
                  ).createShader(rect);
                },
                child: child,
              );
            },
          ),
        ),
      ),
    );
  }
}

/// Lets mouse and trackpad drag-scroll lists too (handy on web/desktop).
class AppScrollBehavior extends MaterialScrollBehavior {
  const AppScrollBehavior();

  @override
  Set<ui.PointerDeviceKind> get dragDevices =>
      ui.PointerDeviceKind.values.toSet();
}
