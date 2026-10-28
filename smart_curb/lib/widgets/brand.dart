// The Smart Curb title and the logo entrance animation.
part of '../main.dart';

class _BrandTitle extends StatelessWidget {
  final double fontSize;
  const _BrandTitle({required this.fontSize});

  @override
  Widget build(BuildContext context) {
    return RichText(
      text: TextSpan(
        style: mono(fontSize: fontSize, letterSpacing: 1.5),
        children: const [
          TextSpan(text: 'SMART ', style: TextStyle(color: kText)),
          TextSpan(text: 'CURB', style: TextStyle(color: kAccent)),
        ],
      ),
    );
  }
}

/// Login logo: scales up from 85% with a soft accent glow that fades out.
class _LogoEntrance extends StatelessWidget {
  const _LogoEntrance();

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: reduceMotion(context) ? Duration.zero : kMotionSlow * 2,
      curve: Curves.easeOutBack,
      builder: (context, t, child) => Opacity(
        opacity: t.clamp(0.0, 1.0),
        child: Transform.scale(
          scale: 0.85 + 0.15 * t,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              boxShadow: [
                BoxShadow(
                  color: kAccent.withValues(
                    alpha: 0.25 * (1 - t.clamp(0.0, 1.0)),
                  ),
                  blurRadius: 40,
                  spreadRadius: 6,
                ),
              ],
            ),
            child: child,
          ),
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Image.asset(
          'assets/logo.png',
          height: 140,
          fit: BoxFit.contain,
          errorBuilder: (_, _, _) =>
              const Icon(Icons.radar, size: 100, color: kAccent),
        ),
      ),
    );
  }
}
