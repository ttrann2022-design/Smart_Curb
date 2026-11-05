import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/foundation.dart' show defaultTargetPlatform, kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show RenderAbstractViewport;
import 'package:flutter/scheduler.dart'
    show SchedulerBinding, SchedulerPhase, Ticker;
import 'package:flutter/services.dart';
import 'package:flutter_compass/flutter_compass.dart';
import 'package:geolocator/geolocator.dart' as geo;
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:pointer_interceptor/pointer_interceptor.dart';

import 'assistant.dart';
import 'firebase_options.dart';

// The app is one Dart library split over these files by what they do.
// They share the imports above, and private (_name) declarations work
// across all of them, exactly as when everything was in this file.
part 'auth/login_page.dart';
part 'auth/register_page.dart';
part 'home/home_tab.dart';
part 'home/user_space.dart';
part 'map/map_helpers.dart';
part 'map/map_widgets.dart';
part 'map/place_map_screen.dart';
part 'parking/live_parking.dart';
part 'places/broward_mall.dart';
part 'places/curb_spot_row.dart';
part 'places/fau_boca.dart';
part 'places/place.dart';
part 'places/place_building.dart';
part 'profile/contact_info_dialog.dart';
part 'profile/profile_tab.dart';
part 'routing/campus_pathfinder.dart';
part 'routing/geo.dart';
part 'routing/road_router.dart';
part 'settings/about_page.dart';
part 'settings/settings_page.dart';
part 'theme/app_theme.dart';
part 'utils/formatters.dart';
part 'vehicle/vehicle_form_dialog.dart';
part 'vehicle/vehicle_tab.dart';
part 'widgets/animated_row_list.dart';
part 'widgets/brand.dart';
part 'widgets/common_widgets.dart';
part 'widgets/connection_indicator.dart';
part 'widgets/motion.dart';
part 'widgets/scrolling.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  // Each place's parking lots, kept up to date from `lots/`.
  Place.watchLots();
  // Each place's walking network for A*.
  await Future.wait([for (final p in Place.all) p.pathfinder.load()]);
  runApp(const MyApp());
}

// ==========================================
// ROOT APP & AUTH LISTENER
// ==========================================

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Smart Curb App',
      debugShowCheckedModeBanner: false,
      theme: appTheme,
      scrollBehavior: const AppScrollBehavior(),
      home: StreamBuilder<User?>(
        stream: FirebaseAuth.instance.authStateChanges(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            );
          }
          return snapshot.hasData ? const UserSpace() : const LoginPage();
        },
      ),
    );
  }
}
