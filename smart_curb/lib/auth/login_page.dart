// The login screen.
part of '../main.dart';

// ==========================================
// AUTHENTICATION: LOGIN & REGISTER
// ==========================================

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _isLoading = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final email = _emailCtrl.text.trim();
    final password = _passwordCtrl.text;
    if (email.isEmpty || password.isEmpty) {
      showErrorSnackBar(context, 'Please enter both email and password.');
      return;
    }
    setState(() => _isLoading = true);
    try {
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
    } on FirebaseAuthException catch (e) {
      if (mounted) showErrorSnackBar(context, e.message ?? 'Login failed.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32.0),
            child: Column(
              children: [
                // Logo pops in (scale + fade), then the rest rises in order.
                const _LogoEntrance(),
                const SizedBox(height: 20),
                const FadeSlideIn(index: 2, child: _BrandTitle(fontSize: 26)),
                const SizedBox(height: 6),
                const FadeSlideIn(
                  index: 3,
                  child: Text(
                    'SMART PARKING',
                    style: TextStyle(
                      color: kTextMuted,
                      fontSize: 10,
                      letterSpacing: 1.2,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(height: 40),
                FadeSlideIn(
                  index: 4,
                  child: AppTextField(
                    controller: _emailCtrl,
                    hintText: 'Email',
                    icon: Icons.email_outlined,
                    keyboardType: TextInputType.emailAddress,
                  ),
                ),
                const SizedBox(height: 16),
                FadeSlideIn(
                  index: 5,
                  child: AppTextField(
                    controller: _passwordCtrl,
                    hintText: 'Password',
                    icon: Icons.lock_outline,
                    obscureText: true,
                  ),
                ),
                const SizedBox(height: 28),
                FadeSlideIn(
                  index: 6,
                  child: PrimaryButton(
                    title: 'Login',
                    isLoading: _isLoading,
                    onPressed: _handleLogin,
                  ),
                ),
                const SizedBox(height: 16),
                FadeSlideIn(
                  index: 7,
                  child: TextButton(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const RegisterPage()),
                    ),
                    child: const Text("Don't have an account? Register"),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
