// Small widgets of the map's lot popup.
part of '../main.dart';

/// One spot in the lot bubble: a small rectangle with the spot name,
/// green = available, red = occupied, gray = offline.
class _SpotChip extends StatelessWidget {
  final String name;
  final bool online;
  final bool occupied;

  const _SpotChip({
    required this.name,
    required this.online,
    required this.occupied,
  });

  @override
  Widget build(BuildContext context) {
    final (color, label) = !online
        ? (kTextMuted, 'offline')
        : occupied
            ? (kRed, 'occupied')
            : (kOpen, 'available');

    // Fades to the new colour when a spot changes state.
    return Semantics(
      label: '$name, $label',
      child: AnimatedContainer(
        duration: kMotion,
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 4),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: color, width: 1.2),
        ),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            name,
            style: mono(fontSize: 11, fontWeight: FontWeight.w700, color: color),
          ),
        ),
      ),
    );
  }
}

/// Downward triangle under the lot bubble, pointing at the lot's dot.
class _BubbleArrowPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width / 2, size.height)
      ..close();
    canvas.drawPath(path, Paint()..color = kCard);
    // Outline the two slanted sides only, so it joins the card's border.
    final edge = Paint()
      ..color = kDivider
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    canvas.drawLine(Offset.zero, Offset(size.width / 2, size.height), edge);
    canvas.drawLine(
        Offset(size.width, 0), Offset(size.width / 2, size.height), edge);
  }

  @override
  bool shouldRepaint(_BubbleArrowPainter old) => false;
}
