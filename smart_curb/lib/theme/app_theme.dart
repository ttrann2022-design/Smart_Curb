// Colors, sizes and the app theme (dark only).
part of '../main.dart';

// ==========================================
// THEME (dark only) — mirrors admin-dashboard/src/theme.js
// ==========================================

const Color kAccent = Color(0xFFC6F24A); // c.accent
const Color kBg = Color(0xFF0F0F0D); // c.bg
const Color kBar = Color(0xFF090908); // c.side
const Color kCard = Color(0xFF171714); // c.panel
const Color kCardAlt = Color(0xFF1D1D19); // c.card
const Color kDivider = Color(0xFF2B2B25); // c.line
const Color kText = Color(0xFFF2F1EA); // c.text
const Color kTextMuted = Color(0xFF8E8C82); // c.dim
const Color kOnAccent = Color(0xFF12110F); // c.onAccent
const Color kOpen = Color(0xFF8BD44A); // c.open
const Color kAmber = Color(0xFFE0A63C); // c.warn
const Color kRed = Color(0xFFF2694C); // c.busy
const Color kNavBg = Color(0xFF232B15); // c.navBg
const Color kNavText = Color(0xFFA5A399); // c.navText
const Color kDev = Colors.cyanAccent;
const Color kDevBlue = Color(0xFF3D8BFF); // dev "Click to move" toggle

/// Dashboard corner radius (5–6px everywhere).
const double kRadius = 6;

/// TODO: replace with your real support address.
const String kSupportEmail = 'support@example.com';

/// Shown on the About page (and by the assistant).
const String kAppVersion = '1.0.9';

/// IBM Plex Mono, the dashboard's heading/number font (`mono` in theme.js).
TextStyle mono({
  double? fontSize,
  FontWeight fontWeight = FontWeight.w600,
  Color color = kText,
  double? letterSpacing,
}) =>
    GoogleFonts.ibmPlexMono(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      letterSpacing: letterSpacing,
    );

final RoundedRectangleBorder _panelShape = RoundedRectangleBorder(
  borderRadius: BorderRadius.circular(kRadius),
  side: const BorderSide(color: kDivider),
);

final ThemeData appTheme = ThemeData(
  useMaterial3: true,
  brightness: Brightness.dark,
  primaryColor: kAccent,
  scaffoldBackgroundColor: kBg,
  cardColor: kCard,
  dividerColor: kDivider,
  // Archivo is the dashboard's body font.
  textTheme: GoogleFonts.archivoTextTheme(ThemeData.dark().textTheme)
      .apply(bodyColor: kText, displayColor: kText),
  dividerTheme: const DividerThemeData(color: kDivider, thickness: 1),
  // Slim, rounded scrollbar in the dashboard's colours.
  scrollbarTheme: ScrollbarThemeData(
    thickness: const WidgetStatePropertyAll(4),
    radius: const Radius.circular(4),
    thumbColor: WidgetStateProperty.resolveWith(
      (s) => s.contains(WidgetState.dragged) || s.contains(WidgetState.hovered)
          ? kAccent.withValues(alpha: 0.8)
          : kTextMuted.withValues(alpha: 0.45),
    ),
    crossAxisMargin: 2,
  ),
  // Modern page transitions: new pages fade in while sliding forward
  // (iOS/macOS keep the native slide so swipe-back still works).
  pageTransitionsTheme: const PageTransitionsTheme(
    builders: {
      TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.fuchsia: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.windows: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.linux: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
    },
  ),
  dialogTheme: DialogThemeData(backgroundColor: kCard, shape: _panelShape),
  bottomSheetTheme: const BottomSheetThemeData(backgroundColor: kCard),
  popupMenuTheme: PopupMenuThemeData(color: kCard, shape: _panelShape),
  snackBarTheme: SnackBarThemeData(
    backgroundColor: kCardAlt,
    contentTextStyle: GoogleFonts.archivo(color: kText, fontSize: 13),
    behavior: SnackBarBehavior.floating,
    shape: _panelShape,
  ),
  // Page header bar: panel background with a 1px bottom rule.
  appBarTheme: AppBarTheme(
    backgroundColor: kCard,
    elevation: 0,
    scrolledUnderElevation: 0,
    shape: const Border(bottom: BorderSide(color: kDivider)),
    iconTheme: const IconThemeData(color: kText),
    titleTextStyle: mono(fontSize: 17),
  ),
  colorScheme: const ColorScheme.dark(
    primary: kAccent,
    onPrimary: kOnAccent,
    secondary: kAccent,
    onSecondary: kOnAccent,
    surface: kCard,
    onSurface: kText,
    onSurfaceVariant: kTextMuted,
    outline: kDivider,
    error: kRed,
  ),
  elevatedButtonTheme: ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(
      backgroundColor: kAccent,
      foregroundColor: kOnAccent,
      elevation: 0,
      textStyle: GoogleFonts.archivo(fontSize: 14, fontWeight: FontWeight.w600),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(kRadius),
      ),
    ),
  ),
  outlinedButtonTheme: OutlinedButtonThemeData(
    style: OutlinedButton.styleFrom(
      foregroundColor: kText,
      backgroundColor: kBg,
      side: const BorderSide(color: kDivider),
      textStyle: GoogleFonts.archivo(fontSize: 14, fontWeight: FontWeight.w600),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(kRadius),
      ),
    ),
  ),
  textButtonTheme: TextButtonThemeData(
    style: TextButton.styleFrom(
      foregroundColor: kAccent,
      textStyle: GoogleFonts.archivo(fontSize: 13, fontWeight: FontWeight.w600),
    ),
  ),
  switchTheme: SwitchThemeData(
    thumbColor: WidgetStateProperty.resolveWith(
      (s) => s.contains(WidgetState.selected) ? kOnAccent : kTextMuted,
    ),
    trackColor: WidgetStateProperty.resolveWith(
      (s) => s.contains(WidgetState.selected) ? kAccent : kBg,
    ),
    trackOutlineColor: const WidgetStatePropertyAll(kDivider),
  ),
  // Bottom nav = dashboard sidebar: active item gets the navBg pill.
  navigationBarTheme: NavigationBarThemeData(
    backgroundColor: kBar,
    indicatorColor: kNavBg,
    indicatorShape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(kRadius),
    ),
    surfaceTintColor: Colors.transparent,
    iconTheme: WidgetStateProperty.resolveWith(
      (s) => IconThemeData(
        color: s.contains(WidgetState.selected) ? kAccent : kNavText,
      ),
    ),
    labelTextStyle: WidgetStateProperty.resolveWith(
      (s) => GoogleFonts.archivo(
        fontSize: 12,
        fontWeight:
            s.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
        color: s.contains(WidgetState.selected) ? kAccent : kNavText,
      ),
    ),
  ),
);
