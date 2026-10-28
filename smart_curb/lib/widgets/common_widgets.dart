// Shared widgets: text field, buttons, info rows, cards, snack bars.
part of '../main.dart';

/// Smooth-scrolling list of cards followed by a compact, centred action
/// button. Shared by the Home, Vehicle and Profile tabs.
class _ListWithBottomAction extends StatelessWidget {
  final List<Widget> children;
  final String actionTitle;
  final IconData actionIcon;
  final VoidCallback onAction;

  /// Removed rows swipe off to the left (see [CollapsibleRow.swipeOut]).
  final bool swipeOut;

  /// There's nothing to list (the last place or car is gone): [empty] is
  /// shown instead, but only once any deleted rows have finished swiping
  /// away, so deleting the last card animates like any other.
  final bool isEmpty;
  final Widget? empty;

  const _ListWithBottomAction({
    super.key,
    this.swipeOut = false,
    this.isEmpty = false,
    this.empty,
    required this.children,
    required this.actionTitle,
    required this.actionIcon,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: AnimatedRowList(
        // Extra room at the bottom so the last card and the action button
        // scroll clear of the assistant bubble.
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 96),
        swipeOut: swipeOut,
        isEmpty: isEmpty,
        empty: empty,
        footer: [
          const SizedBox(height: 8),
          PrimaryButton(
            title: actionTitle,
            icon: actionIcon,
            onPressed: onAction,
            compact: true,
          ),
        ],
        children: children,
      ),
    );
  }
}

class _DialogButtons extends StatelessWidget {
  final VoidCallback onConfirm;
  const _DialogButtons({required this.onConfirm});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton(
            onPressed: () => Navigator.of(context).pop(),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(40),
            ),
            child: const Text('Cancel'),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: ElevatedButton(
            onPressed: onConfirm,
            style: ElevatedButton.styleFrom(
              minimumSize: const Size.fromHeight(40),
            ),
            child: const Text('Confirm'),
          ),
        ),
      ],
    );
  }
}

// ==========================================
// REUSABLE PRESENTATIONAL WIDGETS
// ==========================================

class AppTextField extends StatelessWidget {
  final TextEditingController controller;
  final String hintText;
  final IconData icon;
  final bool obscureText;
  final TextInputType keyboardType;
  final ValueChanged<String>? onChanged;
  final List<TextInputFormatter>? inputFormatters;
  final FocusNode? focusNode;
  final TextInputAction? textInputAction;

  /// Enter pressed (the assistant's forms save on Enter).
  final ValueChanged<String>? onSubmitted;

  const AppTextField({
    super.key,
    required this.controller,
    required this.hintText,
    required this.icon,
    this.obscureText = false,
    this.keyboardType = TextInputType.text,
    this.onChanged,
    this.inputFormatters,
    this.focusNode,
    this.textInputAction,
    this.onSubmitted,
  });

  @override
  Widget build(BuildContext context) {
    // Matches the dashboard inputs: 44px tall, panel fill, 1px line, 6px radius.
    // Height comes from the padding (14px text + 2×13px ≈ 44px), not a fixed
    // box, so the text stays vertically centred next to the icon.
    return Container(
      decoration: BoxDecoration(
        color: kCard,
        borderRadius: BorderRadius.circular(kRadius),
        border: Border.all(color: kDivider),
      ),
      child: TextField(
        controller: controller,
        obscureText: obscureText,
        keyboardType: keyboardType,
        inputFormatters: inputFormatters,
        onChanged: onChanged,
        focusNode: focusNode,
        textInputAction: textInputAction,
        onSubmitted: onSubmitted,
        cursorColor: kAccent,
        textAlignVertical: TextAlignVertical.center,
        style: const TextStyle(color: kText, fontSize: 14),
        decoration: InputDecoration(
          border: InputBorder.none,
          isDense: true,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
          hintText: hintText,
          hintStyle: const TextStyle(color: kTextMuted, fontSize: 14),
          prefixIcon: Icon(icon, color: kTextMuted, size: 18),
          // Default prefix box is 48×48, which made the field taller than
          // its text and pushed the text off-centre.
          prefixIconConstraints:
              const BoxConstraints(minWidth: 40, minHeight: 0),
        ),
      ),
    );
  }
}

class PrimaryButton extends StatelessWidget {
  final String title;
  final VoidCallback onPressed;
  final bool isLoading;
  final IconData? icon;

  /// Compact: a smaller button sized to its label and centred, instead of
  /// full width (used under the card lists).
  final bool compact;

  const PrimaryButton({
    super.key,
    required this.title,
    required this.onPressed,
    this.isLoading = false,
    this.icon,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final button = PressScale(
      child: SizedBox(
        width: compact ? null : double.infinity,
        height: compact ? 38 : 46,
        child: ElevatedButton(
          onPressed: isLoading ? null : onPressed,
          style: ElevatedButton.styleFrom(
            disabledBackgroundColor: kAccent.withValues(alpha: 0.6),
            disabledForegroundColor: kOnAccent,
            padding: compact
                ? const EdgeInsets.symmetric(horizontal: 18)
                : null,
            textStyle: compact
                ? GoogleFonts.archivo(fontSize: 13, fontWeight: FontWeight.w600)
                : null,
          ),
          // Label and spinner cross-fade with a small scale.
          child: AnimatedSwitcher(
            duration: kMotionFast,
            transitionBuilder: (child, anim) => FadeTransition(
              opacity: anim,
              child: ScaleTransition(
                scale: Tween(begin: 0.8, end: 1.0).animate(anim),
                child: child,
              ),
            ),
            child: isLoading
                ? const SizedBox(
                    key: ValueKey('loading'),
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: kOnAccent,
                    ),
                  )
                : Row(
                    key: const ValueKey('label'),
                    mainAxisSize:
                        compact ? MainAxisSize.min : MainAxisSize.max,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (icon != null) ...[
                        Icon(icon, size: compact ? 16 : 18),
                        SizedBox(width: compact ? 6 : 8),
                      ],
                      Text(title),
                    ],
                  ),
          ),
        ),
      ),
    );
    return compact ? Center(child: button) : button;
  }
}

class DetailInfoRow extends StatelessWidget {
  final String label;
  final String value;

  const DetailInfoRow({super.key, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: kTextMuted, fontSize: 13)),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: kText,
                fontWeight: FontWeight.w600,
                fontSize: 13.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

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

class _AnimatedAddCardState extends State<AnimatedAddCard>
    with SingleTickerProviderStateMixin {
  bool _isPressed = false;

  /// Slow "breathing" of the + icon, inviting a tap.
  late final AnimationController _breath = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (reduceMotion(context)) {
      _breath.stop();
    } else if (!_breath.isAnimating) {
      _breath.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _breath.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: FadeSlideIn(
        child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: GestureDetector(
          onTapDown: (_) => setState(() => _isPressed = true),
          onTapUp: (_) {
            setState(() => _isPressed = false);
            widget.onTap();
          },
          onTapCancel: () => setState(() => _isPressed = false),
          child: AnimatedScale(
            scale: _isPressed ? 0.95 : 1.0,
            duration: const Duration(milliseconds: 150),
            curve: Curves.easeInOut,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              curve: Curves.easeInOut,
              width: double.infinity,
              height: 220,
              // Flat panel; on press the border turns accent and an accent
              // ring flashes, like the dashboard's .sws-hover / .sws-flash.
              decoration: BoxDecoration(
                color: kCard,
                borderRadius: BorderRadius.circular(kRadius),
                border: Border.all(color: _isPressed ? kAccent : kDivider),
                boxShadow: [
                  BoxShadow(
                    color: kAccent.withValues(alpha: _isPressed ? 0.35 : 0),
                    spreadRadius: _isPressed ? 4 : 0,
                  ),
                ],
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  AnimatedBuilder(
                    animation: _breath,
                    builder: (context, child) {
                      final t = Curves.easeInOut.transform(_breath.value);
                      return Transform.scale(
                        scale: 1 + 0.06 * t,
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: kNavBg,
                            borderRadius: BorderRadius.circular(kRadius),
                            boxShadow: [
                              BoxShadow(
                                color: kAccent.withValues(alpha: 0.18 * t),
                                blurRadius: 18,
                                spreadRadius: 1,
                              ),
                            ],
                          ),
                          child: child,
                        ),
                      );
                    },
                    child: const Icon(Icons.add, size: 36, color: kAccent),
                  ),
                  const SizedBox(height: 18),
                  Text(widget.title, style: mono(fontSize: 16)),
                  const SizedBox(height: 6),
                  Text(
                    widget.subtitle,
                    style: const TextStyle(color: kTextMuted, fontSize: 12.5),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      ),
    );
  }
}

// Global Alert Helper
void showErrorSnackBar(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      // Dashboard errors are busy-red text, not a red block.
      content: Text(
        message,
        style: GoogleFonts.archivo(
          color: kRed,
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
  );
}
