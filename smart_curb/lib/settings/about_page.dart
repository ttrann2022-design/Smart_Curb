// The About App page.
part of '../main.dart';

class UserAboutPage extends StatelessWidget {
  const UserAboutPage({super.key});

  @override
  Widget build(BuildContext context) {
    const body = TextStyle(color: kNavText, height: 1.6, fontSize: 14.5);

    return Scaffold(
      appBar: AppBar(title: const Text('About App')),
      body: SingleChildScrollView(
        physics: kScrollPhysics,
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Logo on the left; app name and version on the right.
            FadeSlideIn(
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: Image.asset(
                      'assets/logo.png',
                      width: 76,
                      height: 76,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) =>
                          const Icon(Icons.radar, size: 60, color: kAccent),
                    ),
                  ),
                  const SizedBox(width: 18),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const _BrandTitle(fontSize: 28),
                        const SizedBox(height: 6),
                        Text(
                          'Version $kAppVersion',
                          style: mono(
                            fontSize: 13,
                            color: kTextMuted,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            const FadeSlideIn(index: 1, child: Divider(color: kDivider)),
            const SizedBox(height: 20),
            const FadeSlideIn(
              index: 2,
              child: Text(
                'Smart Curb takes the guesswork out of campus parking. Smart '
                'curb sensors in each parking space report in real time '
                'whether the spot is free, so the app always knows how full '
                'every lot is.',
                style: body,
              ),
            ),
            const SizedBox(height: 14),
            const FadeSlideIn(
              index: 3,
              child: Text(
                'Choose the building you are heading to and Smart Curb finds '
                'the closest lot that still has space, measured by the real '
                'walking distance to your door. It then guides you there '
                'with live turn-by-turn navigation and shows how far you '
                'will walk once you park. If that lot fills up on the way, '
                'your route updates automatically.',
                style: body,
              ),
            ),
            const SizedBox(height: 14),
            const FadeSlideIn(
              index: 4,
              child: Text(
                'Keep your vehicles and contact details in one place, save '
                'the campuses you visit, and see every lot at a glance: '
                'green has plenty of space, amber is filling up and red is '
                'almost full.',
                style: body,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
